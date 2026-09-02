<?php

declare(strict_types=1);

namespace App\Services\AI\Crm;

use App\Enums\LeadPriority;
use App\Models\LeadLabel;
use App\Models\LeadPipeline;
use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LeadInferenceService
{
    public function __construct(private readonly AiProviderRouter $aiProviderRouter) {}

    /**
     * @param  array<string, string>  $entities
     * @return array<string, mixed>
     */
    public function infer(
        string $message,
        int $companyId,
        int $userId,
        string $role,
        array $entities = [],
        string $conversationSummary = '',
    ): array {
        $name = $this->extractLabeledValue($message, [
            'business name',
            'business/lead name',
            'lead name',
            'company name',
            'name',
        ]) ?? $this->extractQuotedBusinessName($message);

        $phone = $this->extractLabeledValue($message, ['phone number', 'phone', 'mobile', 'tel'])
            ?? $this->extractPhoneFromText($message);

        $location = $this->extractLabeledValue($message, ['location', 'location/address', 'address', 'area']);

        $email = $this->extractLabeledValue($message, ['email', 'email address']);

        $industry = $this->extractLabeledValue($message, ['industry', 'business type', 'sector']);

        $contactPerson = $this->extractLabeledValue($message, ['contact person', 'contact name', 'contact']);

        $notes = $this->extractLabeledValue($message, ['notes', 'context', 'comment', 'comments'])
            ?? $this->extractNotesSentence($message);

        $status = $this->resolveStatusSlug(
            $this->extractLabeledValue($message, ['lead status', 'status']),
            $companyId,
        );

        $priority = $this->resolvePriority(
            $this->extractLabeledValue($message, ['priority']),
        );

        $pipelineId = $this->resolveDefaultPipelineId($companyId, $userId);

        $assignedToUserId = $role === 'agent' ? $userId : $this->resolveAssignedUserId($message, $companyId, $entities);

        $usedDefaultName = ! is_string($name) || trim($name) === '';
        if ($usedDefaultName) {
            $name = $this->generateLeadNameFallback($message, $conversationSummary, $companyId, $userId);
        }

        $nextAction = $this->buildNextAction($notes, $industry, $location);

        return [
            'name' => Str::limit(trim((string) $name), 255, ''),
            'phone' => is_string($phone) ? Str::limit(trim($phone), 40, '') : null,
            'email' => is_string($email) ? Str::limit(trim($email), 255, '') : null,
            'location' => is_string($location) ? Str::limit(trim($location), 255, '') : null,
            'source' => 'ely_copilot',
            'status' => $status,
            'priority' => $priority,
            'pipeline_id' => $pipelineId,
            'assigned_to_user_id' => $assignedToUserId,
            'next_action' => $nextAction,
            'industry' => is_string($industry) ? Str::limit(trim($industry), 120, '') : null,
            'contact_person' => is_string($contactPerson) ? Str::limit(trim($contactPerson), 120, '') : null,
            'notes' => is_string($notes) ? Str::limit(trim($notes), 500, '') : null,
            'meta' => array_filter([
                'industry' => is_string($industry) ? Str::limit(trim($industry), 120, '') : null,
                'contact_person' => is_string($contactPerson) ? Str::limit(trim($contactPerson), 120, '') : null,
                'notes' => is_string($notes) ? Str::limit(trim($notes), 500, '') : null,
                'created_via' => 'ely_copilot',
            ]),
            '__inference' => [
                'used_default_name' => $usedDefaultName,
                'missing_phone' => ! is_string($phone) || trim($phone) === '',
                'missing_location' => ! is_string($location) || trim($location) === '',
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $actionArgs
     * @return array<string, mixed>
     */
    public function normalizeProvidedArgs(int $companyId, array $actionArgs, string $role, int $userId): array
    {
        $normalized = $actionArgs;

        foreach (['name', 'phone', 'email', 'location', 'source', 'status', 'next_action'] as $field) {
            if (is_string($normalized[$field] ?? null)) {
                $normalized[$field] = trim((string) $normalized[$field]);
            }
        }

        if (! isset($normalized['pipeline_id']) || (int) ($normalized['pipeline_id'] ?? 0) <= 0) {
            $normalized['pipeline_id'] = $this->resolveDefaultPipelineId($companyId, $userId);
        }

        if (! is_string($normalized['status'] ?? null) || trim((string) $normalized['status']) === '') {
            $normalized['status'] = $this->resolveStatusSlug(null, $companyId);
        }

        if (! is_string($normalized['priority'] ?? null) || trim((string) $normalized['priority']) === '') {
            $normalized['priority'] = LeadPriority::MEDIUM->value;
        }

        if ($role === 'agent') {
            $normalized['assigned_to_user_id'] = $userId;
        }

        if (isset($normalized['meta']) && ! is_array($normalized['meta'])) {
            unset($normalized['meta']);
        }

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $args
     * @param  array<int, string>  $warnings
     */
    public function buildPreviewSummary(array $args, array $warnings = [], bool $blockingConfirmation = false): string
    {
        $name = (string) ($args['name'] ?? 'Unnamed Lead');
        $phone = (string) ($args['phone'] ?? 'Not provided');
        $location = (string) ($args['location'] ?? 'Not provided');

        $base = sprintf(
            'ELY action ready: create CRM lead "%s" (phone: %s, location: %s). Review the details below and click Confirm Action to save this lead.',
            $name,
            $phone !== '' ? $phone : 'Not provided',
            $location !== '' ? $location : 'Not provided',
        );

        if ($warnings !== []) {
            $base .= ' Notes: ' . implode(' ', array_map(static fn(string $w): string => '[' . $w . ']', $warnings));
        }

        if ($blockingConfirmation) {
            $base .= ' Confirmation is blocked until required fields are corrected.';
        }

        return $base;
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<int, string>
     */
    public function warningCodes(array $args): array
    {
        $inference = is_array($args['__inference'] ?? null) ? $args['__inference'] : [];
        $codes = [];

        if (($inference['used_default_name'] ?? false) === true || trim((string) ($args['name'] ?? '')) === '') {
            $codes[] = 'missing_lead_name';
        }

        if (($inference['missing_phone'] ?? false) === true || trim((string) ($args['phone'] ?? '')) === '') {
            $codes[] = 'missing_phone';
        }

        if (($inference['missing_location'] ?? false) === true || trim((string) ($args['location'] ?? '')) === '') {
            $codes[] = 'missing_location';
        }

        return $codes;
    }

    /**
     * @param  array<int, string>  $labels
     */
    private function extractLabeledValue(string $message, array $labels): ?string
    {
        foreach ($labels as $label) {
            $escaped = preg_quote($label, '/');
            $pattern = '/\b' . $escaped . '\b\s*:\s*(.+?)(?=\s*(?:[a-z][a-z\s&\/]{1,30}\s*:|\.|;|\n|$))/i';
            if (preg_match($pattern, $message, $m) === 1) {
                $value = trim((string) $m[1]);
                if ($value !== '') {
                    return rtrim($value, '.');
                }
            }
        }

        return null;
    }

    private function extractQuotedBusinessName(string $message): ?string
    {
        if (preg_match('/\b(?:business|company|lead)\s+name\b\s*[:\-]?\s*["“](.+?)["”]/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        return null;
    }

    private function extractPhoneFromText(string $message): ?string
    {
        if (preg_match('/\+?\d[\d\s\-()]{7,}\d/', $message, $m) === 1) {
            return trim((string) $m[0]);
        }

        return null;
    }

    private function extractNotesSentence(string $message): ?string
    {
        if (preg_match('/\b(?:found|met|discovered|referred)\b.+$/i', $message, $m) === 1) {
            return trim((string) $m[0]);
        }

        return null;
    }

    private function resolveDefaultPipelineId(int $companyId, ?int $userId = null): int
    {
        try {
            if ($userId !== null) {
                $preferredId = DB::table('company_users')
                    ->where('company_id', $companyId)
                    ->where('user_id', $userId)
                    ->value('preferred_pipeline_id');

                if ($preferredId !== null) {
                    $exists = LeadPipeline::query()
                        ->where('company_id', $companyId)
                        ->where('id', (int) $preferredId)
                        ->exists();
                    if ($exists) {
                        return (int) $preferredId;
                    }
                }
            }

            $pipelineId = LeadPipeline::query()
                ->where('company_id', $companyId)
                ->orderByDesc('is_default')
                ->orderBy('sort_order')
                ->value('id');
        } catch (QueryException) {
            // Unit tests can run against in-memory sqlite without full CRM tables.
            return 0;
        }

        return (int) ($pipelineId ?? 0);
    }

    private function resolveStatusSlug(?string $rawStatus, int $companyId): string
    {
        try {
            if (is_string($rawStatus) && trim($rawStatus) !== '') {
                $slug = Str::slug(trim($rawStatus), '_');
                $exists = LeadLabel::query()
                    ->where('company_id', $companyId)
                    ->where('slug', $slug)
                    ->exists();

                if ($exists) {
                    return $slug;
                }
            }

            $default = LeadLabel::query()
                ->where('company_id', $companyId)
                ->orderByDesc('is_default')
                ->orderBy('sort_order')
                ->value('slug');

            return is_string($default) && $default !== '' ? $default : 'newly_lead';
        } catch (QueryException) {
            // Graceful fallback when lead_labels table is unavailable in isolated tests.
            return 'newly_lead';
        }
    }

    private function resolvePriority(?string $rawPriority): string
    {
        if (! is_string($rawPriority) || trim($rawPriority) === '') {
            return LeadPriority::MEDIUM->value;
        }

        $normalized = strtolower(trim($rawPriority));

        return in_array($normalized, LeadPriority::values(), true)
            ? $normalized
            : LeadPriority::MEDIUM->value;
    }

    /**
     * @param  array<string, string>  $entities
     */
    private function resolveAssignedUserId(string $message, int $companyId, array $entities): ?int
    {
        $assigneeHint = $this->extractLabeledValue($message, ['assign to agent', 'assign to', 'assigned to', 'agent'])
            ?? ($entities['agent'] ?? null);

        if (! is_string($assigneeHint) || trim($assigneeHint) === '') {
            return null;
        }

        $needle = strtolower(trim($assigneeHint));
        $userId = User::query()
            ->select('users.id')
            ->join('company_users', 'company_users.user_id', '=', 'users.id')
            ->where('company_users.company_id', $companyId)
            ->where(function ($query) use ($needle): void {
                $query->whereRaw('LOWER(users.name) LIKE ?', ['%' . $needle . '%'])
                    ->orWhereRaw('LOWER(users.email) LIKE ?', ['%' . $needle . '%']);
            })
            ->value('users.id');

        return $userId !== null ? (int) $userId : null;
    }

    private function generateLeadNameFallback(string $message, string $conversationSummary, int $companyId, int $userId): string
    {
        $userPrompt = trim("Conversation:\n{$conversationSummary}\n\nMessage:\n{$message}");
        $result = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'You extract a concise CRM lead business name from user text. Respond with plain text only, no markdown, max 80 characters. If no name is present, respond with: New Lead',
            userPrompt: $userPrompt,
            options: [
                'max_tokens' => 60,
                'temperature' => 0.1,
                'company_id' => $companyId,
                '_log' => [
                    'company_id' => $companyId,
                    'user_id' => $userId,
                    'intent_type' => 'inference',
                    'tool_name' => 'crm.create_lead',
                    'routing_purpose' => 'operational',
                    'user_prompt' => $userPrompt,
                ],
            ],
        );

        $candidate = $result?->text !== null ? trim($result->text) : '';
        if ($candidate === '' || strtolower($candidate) === 'new lead') {
            return 'New Lead';
        }

        return Str::limit($candidate, 255, '');
    }

    private function buildNextAction(?string $notes, ?string $industry, ?string $location): ?string
    {
        $parts = array_filter([
            is_string($notes) && trim($notes) !== '' ? trim($notes) : null,
            is_string($industry) && trim($industry) !== '' ? 'Industry: ' . trim($industry) : null,
            is_string($location) && trim($location) !== '' ? 'Location: ' . trim($location) : null,
        ]);

        if ($parts === []) {
            return 'Initial follow-up from ELY lead capture';
        }

        return Str::limit(implode(' | ', $parts), 255, '');
    }
}
