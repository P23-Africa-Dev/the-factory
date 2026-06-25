<?php

declare(strict_types=1);

namespace App\Services\AI\Kpi;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class KpiInferenceService
{
    public function __construct(private readonly AiProviderRouter $aiProviderRouter) {}

    /**
     * @param  array<string, string>  $entities
     * @return array<string, mixed>
     */
    public function infer(
        string $message,
        int $companyId,
        array $entities = [],
        string $conversationSummary = '',
    ): array {
        $name = $this->extractLabeledValue($message, ['kpi name', 'name', 'title'])
            ?? $this->extractKpiNameFromSentence($message);

        $objective = $this->extractLabeledValue($message, ['objective', 'goal', 'purpose'])
            ?? $this->extractObjectiveSentence($message);

        $targetValue = $this->extractLabeledValue($message, ['target value', 'target', 'quota'])
            ?? $this->extractTargetValueFromSentence($message);

        $expectedOutcome = $this->extractLabeledValue($message, ['expected outcome', 'outcome', 'success criteria'])
            ?? $this->buildExpectedOutcomeFallback($objective, $targetValue);

        $category = $this->resolveCategory(
            $this->extractLabeledValue($message, ['category', 'kpi category']),
            $message,
        );

        $priority = $this->resolvePriority(
            $this->extractLabeledValue($message, ['priority']),
            $message,
        );

        [$startDate, $endDate, $usedDefaultDates] = $this->resolveDateRange($message);

        $assignedToUserId = $this->resolveAssignedUserId($message, $companyId, $entities);

        $usedDefaultName = ! is_string($name) || trim($name) === '';
        if ($usedDefaultName) {
            $name = $this->generateKpiNameFallback($message, $conversationSummary);
        }

        $usedDefaultObjective = ! is_string($objective) || mb_strlen(trim($objective)) < 10;
        if ($usedDefaultObjective) {
            $objective = $this->generateObjectiveFallback($message, (string) $name, $conversationSummary);
        }

        $usedDefaultTarget = ! is_string($targetValue) || trim($targetValue) === '';
        if ($usedDefaultTarget) {
            $targetValue = 'To be defined';
        }

        $usedDefaultOutcome = ! is_string($expectedOutcome) || mb_strlen(trim($expectedOutcome)) < 10;
        if ($usedDefaultOutcome) {
            $expectedOutcome = $this->buildExpectedOutcomeFallback($objective, $targetValue);
        }

        return [
            'name' => Str::limit(trim((string) $name), 255, ''),
            'category' => $category,
            'objective' => Str::limit(trim((string) $objective), 5000, ''),
            'target_value' => Str::limit(trim((string) $targetValue), 255, ''),
            'expected_outcome' => Str::limit(trim((string) $expectedOutcome), 5000, ''),
            'priority' => $priority,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'assigned_to_user_id' => $assignedToUserId,
            '__inference' => [
                'used_default_name' => $usedDefaultName,
                'missing_objective' => $usedDefaultObjective,
                'missing_target_value' => $usedDefaultTarget,
                'missing_expected_outcome' => $usedDefaultOutcome,
                'used_default_dates' => $usedDefaultDates,
                'assignee_unresolved' => $this->messageMentionsAssignee($message, $entities) && $assignedToUserId === null,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $actionArgs
     * @return array<string, mixed>
     */
    public function normalizeProvidedArgs(int $companyId, array $actionArgs): array
    {
        $normalized = $actionArgs;

        foreach (['name', 'objective', 'target_value', 'expected_outcome', 'category', 'priority'] as $field) {
            if (is_string($normalized[$field] ?? null)) {
                $normalized[$field] = trim((string) $normalized[$field]);
            }
        }

        if (! is_string($normalized['category'] ?? null) || trim((string) $normalized['category']) === '') {
            $normalized['category'] = KpiCategory::SALES->value;
        } else {
            $normalized['category'] = $this->resolveCategory((string) $normalized['category'], '');
        }

        if (! is_string($normalized['priority'] ?? null) || trim((string) $normalized['priority']) === '') {
            $normalized['priority'] = KpiPriority::MEDIUM->value;
        } else {
            $normalized['priority'] = $this->resolvePriority((string) $normalized['priority'], '');
        }

        if (is_string($normalized['assignee'] ?? null) && trim((string) $normalized['assignee']) !== '') {
            $resolved = $this->resolveAssignedUserId(
                'assign to ' . trim((string) $normalized['assignee']),
                $companyId,
                [],
            );
            if ($resolved !== null) {
                $normalized['assigned_to_user_id'] = $resolved;
            }
            unset($normalized['assignee']);
        } elseif (isset($normalized['assigned_to_user_id']) && is_numeric($normalized['assigned_to_user_id'])) {
            $normalized['assigned_to_user_id'] = (int) $normalized['assigned_to_user_id'];
        }

        if (! is_string($normalized['start_date'] ?? null) || trim((string) $normalized['start_date']) === '') {
            $normalized['start_date'] = now()->toDateString();
        }

        if (! is_string($normalized['end_date'] ?? null) || trim((string) $normalized['end_date']) === '') {
            $normalized['end_date'] = now()->addMonth()->toDateString();
        }

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $args
     * @param  array<int, string>  $warnings
     */
    public function buildPreviewSummary(array $args, array $warnings = [], bool $blockingConfirmation = false): string
    {
        $name = (string) ($args['name'] ?? 'Untitled KPI');
        $target = (string) ($args['target_value'] ?? 'Not set');
        $assigneeId = $args['assigned_to_user_id'] ?? null;
        $assigneeLabel = is_numeric($assigneeId) ? 'User #' . (int) $assigneeId : 'Unassigned';

        $base = sprintf(
            'ELY action ready: create KPI "%s" (target: %s, assignee: %s). Review the details below and click Confirm Action to save this KPI.',
            $name,
            $target !== '' ? $target : 'Not set',
            $assigneeLabel,
        );

        if ($warnings !== []) {
            $base .= ' Notes: ' . implode(' ', array_map(static fn (string $w): string => '[' . $w . ']', $warnings));
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
            $codes[] = 'missing_kpi_name';
        }

        if (($inference['missing_objective'] ?? false) === true || mb_strlen(trim((string) ($args['objective'] ?? ''))) < 10) {
            $codes[] = 'missing_objective';
        }

        if (($inference['missing_target_value'] ?? false) === true || trim((string) ($args['target_value'] ?? '')) === '' || (string) ($args['target_value'] ?? '') === 'To be defined') {
            $codes[] = 'missing_target_value';
        }

        if (($inference['missing_expected_outcome'] ?? false) === true || mb_strlen(trim((string) ($args['expected_outcome'] ?? ''))) < 10) {
            $codes[] = 'missing_expected_outcome';
        }

        if (($inference['assignee_unresolved'] ?? false) === true) {
            $codes[] = 'assignee_unresolved';
        }

        if (($inference['used_default_dates'] ?? false) === true) {
            $codes[] = 'used_default_dates';
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

    private function extractKpiNameFromSentence(string $message): ?string
    {
        if (preg_match('/\bkpi\s+(?:called|named|titled)\s+["“](.+?)["”]/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\bcreate\s+(?:a\s+)?kpi\s+(?:for|to)\s+(.+?)(?=\s+(?:with|target|objective|assign|priority|category)\b|[\.,;]|$)/i', $message, $m) === 1) {
            $candidate = trim((string) $m[1]);
            if ($candidate !== '' && ! preg_match('/\b(agent|john|team|user)\b/i', $candidate)) {
                return Str::limit($candidate, 255, '');
            }
        }

        return null;
    }

    private function extractObjectiveSentence(string $message): ?string
    {
        if (preg_match('/\bto\s+((?:achieve|complete|deliver|reach|secure|close|generate|collect|visit).+?)(?=\s+(?:with|target|priority|assign|by|before)\b|[\.,;]|$)/i', $message, $m) === 1) {
            $objective = trim((string) $m[1]);
            if (mb_strlen($objective) >= 10) {
                return $objective;
            }
        }

        return null;
    }

    private function extractTargetValueFromSentence(string $message): ?string
    {
        if (preg_match('/\b(\d+(?:\.\d+)?\s*(?:%|percent|visits?|leads?|sales|units?|retailers?|customers?|sign[\s-]?ups?))\b/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\btarget(?:\s+of)?\s+(\d+(?:\.\d+)?(?:\s+[a-z]+)?)\b/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        return null;
    }

    private function buildExpectedOutcomeFallback(?string $objective, ?string $targetValue): string
    {
        $parts = array_filter([
            is_string($objective) && trim($objective) !== '' ? 'Objective: ' . trim($objective) : null,
            is_string($targetValue) && trim($targetValue) !== '' ? 'Target: ' . trim($targetValue) : null,
        ]);

        if ($parts === []) {
            return 'Achieve the defined KPI target within the selected period.';
        }

        return Str::limit(implode('. ', $parts), 5000, '');
    }

    private function resolveCategory(?string $rawCategory, string $message): string
    {
        $haystack = strtolower(trim((string) $rawCategory . ' ' . $message));

        $map = [
            'customer_visits' => ['customer visit', 'field visit', 'store visit', 'visit'],
            'lead_generation' => ['lead generation', 'lead gen', 'new lead', 'prospect'],
            'collection' => ['collection', 'collections', 'payment collection', 'debt'],
            'survey' => ['survey', 'feedback'],
            'merchandising' => ['merchandis', 'display', 'shelf'],
            'sales' => ['sales', 'revenue', 'retailer', 'retail'],
        ];

        foreach ($map as $category => $keywords) {
            foreach ($keywords as $keyword) {
                if (str_contains($haystack, $keyword)) {
                    return $category;
                }
            }
        }

        if (is_string($rawCategory) && in_array(strtolower(trim($rawCategory)), KpiCategory::values(), true)) {
            return strtolower(trim($rawCategory));
        }

        return KpiCategory::SALES->value;
    }

    private function resolvePriority(?string $rawPriority, string $message): string
    {
        $haystack = strtolower(trim((string) $rawPriority . ' ' . $message));

        if (str_contains($haystack, 'critical')) {
            return KpiPriority::CRITICAL->value;
        }

        if (str_contains($haystack, 'high')) {
            return KpiPriority::HIGH->value;
        }

        if (str_contains($haystack, 'low')) {
            return KpiPriority::LOW->value;
        }

        if (is_string($rawPriority) && in_array(strtolower(trim($rawPriority)), KpiPriority::values(), true)) {
            return strtolower(trim($rawPriority));
        }

        return KpiPriority::MEDIUM->value;
    }

    /**
     * @return array{0:string,1:string,2:bool}
     */
    private function resolveDateRange(string $message): array
    {
        $start = $this->extractLabeledValue($message, ['start date', 'start']);
        $end = $this->extractLabeledValue($message, ['end date', 'end', 'deadline']);

        if (preg_match('/\bthis\s+month\b/i', $message) === 1) {
            return [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString(), false];
        }

        if (preg_match('/\bnext\s+month\b/i', $message) === 1) {
            $next = now()->addMonth();

            return [$next->copy()->startOfMonth()->toDateString(), $next->copy()->endOfMonth()->toDateString(), false];
        }

        $usedDefaultDates = ! is_string($start) || ! is_string($end);

        try {
            $startDate = is_string($start) && trim($start) !== ''
                ? Carbon::parse($start)->toDateString()
                : now()->toDateString();
            $endDate = is_string($end) && trim($end) !== ''
                ? Carbon::parse($end)->toDateString()
                : now()->addMonth()->toDateString();
        } catch (\Throwable) {
            $startDate = now()->toDateString();
            $endDate = now()->addMonth()->toDateString();
            $usedDefaultDates = true;
        }

        return [$startDate, $endDate, $usedDefaultDates];
    }

    /**
     * @param  array<string, string>  $entities
     */
    private function resolveAssignedUserId(string $message, int $companyId, array $entities): ?int
    {
        $assigneeHint = $this->extractLabeledValue($message, ['assign to', 'assigned to', 'assignee', 'for agent'])
            ?? null;

        if (! is_string($assigneeHint) || trim($assigneeHint) === '') {
            if (preg_match('/\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/', $message, $m) === 1) {
                $assigneeHint = trim((string) $m[1]);
            } elseif (preg_match('/\bagent\s+([a-z][a-z\-]*(?:\s+[a-z][a-z\-]*){0,3})(?=\s+(?:to|for|on|at|by|with)\b|[\.,!?]|$)/i', $message, $m) === 1) {
                $assigneeHint = trim((string) $m[1]);
            } elseif (is_string($entities['agent'] ?? null)) {
                $assigneeHint = trim((string) $entities['agent']);
            }
        }

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

    /**
     * @param  array<string, string>  $entities
     */
    private function messageMentionsAssignee(string $message, array $entities): bool
    {
        if (is_string($entities['agent'] ?? null) && trim((string) $entities['agent']) !== '') {
            return true;
        }

        return preg_match('/\b(assign(?:ed)?\s+to|for\s+agent|agent\s+[a-z])/i', $message) === 1
            || preg_match('/\bfor\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/', $message) === 1;
    }

    private function generateKpiNameFallback(string $message, string $conversationSummary): string
    {
        $providerText = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'You extract a concise KPI name from user text. Respond with plain text only, no markdown, max 80 characters. If no name is present, respond with: New KPI',
            userPrompt: trim("Conversation:\n{$conversationSummary}\n\nMessage:\n{$message}"),
            options: ['max_tokens' => 60, 'temperature' => 0.1],
        );

        $candidate = is_string($providerText) ? trim($providerText) : '';
        if ($candidate === '' || strtolower($candidate) === 'new kpi') {
            return 'New KPI';
        }

        return Str::limit($candidate, 255, '');
    }

    private function generateObjectiveFallback(string $message, string $name, string $conversationSummary): string
    {
        $providerText = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'Write one concise KPI objective sentence (minimum 10 characters) from the user request. Plain text only, no markdown.',
            userPrompt: trim("KPI name: {$name}\nConversation:\n{$conversationSummary}\n\nMessage:\n{$message}"),
            options: ['max_tokens' => 120, 'temperature' => 0.2],
        );

        $candidate = is_string($providerText) ? trim($providerText) : '';
        if (mb_strlen($candidate) < 10) {
            return 'Deliver measurable progress toward the requested KPI target within the selected period.';
        }

        return Str::limit($candidate, 5000, '');
    }
}
