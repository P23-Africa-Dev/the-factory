<?php

declare(strict_types=1);

namespace App\Services\AI\Kpi;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use App\Support\UserDisplayNameResolver;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class KpiInferenceService
{
    public function __construct(
        private readonly AiProviderRouter $aiProviderRouter,
        private readonly UserDisplayNameResolver $userDisplayNameResolver,
    ) {}

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
            $name = $this->generateKpiNameFallback($message, $conversationSummary, $companyId);
        }

        $usedDefaultObjective = ! is_string($objective) || mb_strlen(trim($objective)) < 10;
        if ($usedDefaultObjective) {
            $objective = $this->generateObjectiveFallback($message, (string) $name, $conversationSummary, $companyId);
        }

        $usedDefaultTarget = ! is_string($targetValue) || trim($targetValue) === '';
        if ($usedDefaultTarget) {
            $targetValue = $this->generateTargetValueFallback($message, (string) $name, $conversationSummary, $companyId);
        }

        $usedDefaultOutcome = ! is_string($expectedOutcome) || mb_strlen(trim($expectedOutcome)) < 10;
        if ($usedDefaultOutcome) {
            $expectedOutcome = $this->buildExpectedOutcomeFallback($objective, $targetValue);
        }

        $finalName = Str::limit(trim((string) $name), 255, '');
        $finalObjective = Str::limit(trim((string) $objective), 5000, '');
        $finalTarget = Str::limit(trim((string) $targetValue), 255, '');
        $finalOutcome = Str::limit(trim((string) $expectedOutcome), 5000, '');
        $mentionsAssignee = $this->messageMentionsAssignee($message, $entities);

        return [
            'name' => $finalName,
            'category' => $category,
            'objective' => $finalObjective,
            'target_value' => $finalTarget,
            'expected_outcome' => $finalOutcome,
            'priority' => $priority,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'assigned_to_user_id' => $assignedToUserId,
            '__inference' => [
                'used_default_name' => $finalName === '' || strtolower($finalName) === 'new kpi',
                'missing_objective' => mb_strlen($finalObjective) < 10,
                'missing_target_value' => $finalTarget === '' || strtolower($finalTarget) === 'to be defined',
                'missing_expected_outcome' => mb_strlen($finalOutcome) < 10,
                'used_default_dates' => $usedDefaultDates,
                'assignee_unresolved' => $mentionsAssignee && $assignedToUserId === null,
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
        } elseif (isset($normalized['assigned_to_user_id']) && is_string($normalized['assigned_to_user_id'])) {
            $resolved = $this->findUserIdByHint($companyId, (string) $normalized['assigned_to_user_id']);
            if ($resolved !== null) {
                $normalized['assigned_to_user_id'] = $resolved;
            } else {
                unset($normalized['assigned_to_user_id']);
            }
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
        $assigneeLabel = 'Unassigned';
        if (is_numeric($assigneeId)) {
            $nameMap = $this->userDisplayNameResolver->resolveMap([(int) $assigneeId]);
            $assigneeLabel = $this->userDisplayNameResolver->label((int) $assigneeId, $nameMap);
        }

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
        $codes = [];
        $name = trim((string) ($args['name'] ?? ''));
        $objective = trim((string) ($args['objective'] ?? ''));
        $targetValue = trim((string) ($args['target_value'] ?? ''));
        $expectedOutcome = trim((string) ($args['expected_outcome'] ?? ''));

        if ($name === '' || strtolower($name) === 'new kpi') {
            $codes[] = 'missing_kpi_name';
        }

        if (mb_strlen($objective) < 10) {
            $codes[] = 'missing_objective';
        }

        if ($targetValue === '' || strtolower($targetValue) === 'to be defined') {
            $codes[] = 'missing_target_value';
        }

        if (mb_strlen($expectedOutcome) < 10) {
            $codes[] = 'missing_expected_outcome';
        }

        $inference = is_array($args['__inference'] ?? null) ? $args['__inference'] : [];
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
        if (preg_match('/\b(?:set\s+up|create|define|add)\s+(?:a\s+)?kpi\s+for\s+(?:that\s+)?agent\b/i', $message) === 1) {
            return null;
        }

        if (preg_match('/\bkpi\s+(?:called|named|titled)\s+["“](.+?)["”]/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\b(?:set\s+up|create|define|add)\s+(?:a\s+)?kpi\s+for\s+(.+?)(?:\s+for\s+(?:that\s+)?agent\b|\s+assign(?:ed)?\s+to\b|\s+with\b|[\.,;]|$)/i', $message, $m) === 1) {
            $candidate = $this->cleanKpiNameCandidate((string) ($m[1] ?? ''));
            if ($candidate !== '') {
                return Str::limit($candidate, 255, '');
            }
        }

        if (preg_match('/\bcreate\s+(?:a\s+)?kpi\s+(?:for|to)\s+(.+?)(?=\s+(?:with|target|objective|assign|priority|category|for\s+(?:that\s+)?agent)\b|[\.,;]|$)/i', $message, $m) === 1) {
            $candidate = $this->cleanKpiNameCandidate((string) ($m[1] ?? ''));
            if ($candidate !== '') {
                return Str::limit($candidate, 255, '');
            }
        }

        return null;
    }

    private function cleanKpiNameCandidate(string $candidate): string
    {
        $cleaned = trim($candidate);
        $cleaned = preg_replace('/\s+/', ' ', $cleaned) ?? $cleaned;
        $cleaned = rtrim($cleaned, ',.;:');

        if ($cleaned === '' || preg_match('/^(that|the|a|an)\s+agent\b/i', $cleaned) === 1) {
            return '';
        }

        return $cleaned;
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
        foreach ($this->extractAssigneeHints($message, $entities) as $hint) {
            $userId = $this->findUserIdByHint($companyId, $hint);
            if ($userId !== null) {
                return $userId;
            }
        }

        return null;
    }

    /**
     * @param  array<string, string>  $entities
     * @return array<int, string>
     */
    private function extractAssigneeHints(string $message, array $entities): array
    {
        $hints = [];

        $labeled = $this->extractLabeledValue($message, ['assign to', 'assigned to', 'assignee', 'for agent']);
        if (is_string($labeled) && trim($labeled) !== '') {
            $hints[] = trim($labeled);
        }

        $patterns = [
            '/\bassign(?:ed)?\s+to\s+(.+?)(?:\?|\.|$)/i',
            '/\bfor\s+(?:that\s+)?agent\s+(.+?)(?:\s+to\s+|\?|\.|$)/i',
            '/\bagent\s+([a-zA-Z][a-zA-Z\'\-]*(?:\s+[a-zA-Z][a-zA-Z\'\-]*){0,3})(?=\s+(?:to|for|on|at|by|with)\b|[\.,!?]|$)/i',
            '/\bfor\s+([a-zA-Z][a-zA-Z\'\-]*(?:\s+[a-zA-Z][a-zA-Z\'\-]*){0,3})\b/i',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $message, $matches) !== 1) {
                continue;
            }

            $hint = $this->cleanAssigneeHint((string) ($matches[1] ?? ''));
            if ($hint !== '') {
                $hints[] = $hint;
            }
        }

        if (is_string($entities['agent'] ?? null) && trim((string) $entities['agent']) !== '') {
            $hints[] = trim((string) $entities['agent']);
        }

        return array_values(array_unique($hints));
    }

    private function findUserIdByHint(int $companyId, string $hint): ?int
    {
        $needle = $this->cleanAssigneeHint($hint);
        if ($needle === '') {
            return null;
        }

        $baseQuery = User::query()
            ->select('users.id', 'users.name', 'users.email')
            ->join('company_users', 'company_users.user_id', '=', 'users.id')
            ->where('company_users.company_id', $companyId);

        $exact = (clone $baseQuery)
            ->where(function ($query) use ($needle): void {
                $query->whereRaw('LOWER(users.name) = ?', [strtolower($needle)])
                    ->orWhereRaw('LOWER(users.email) = ?', [strtolower($needle)]);
            })
            ->value('users.id');

        if ($exact !== null) {
            return (int) $exact;
        }

        $like = (clone $baseQuery)
            ->where(function ($query) use ($needle): void {
                $query->whereRaw('LOWER(users.name) LIKE ?', ['%' . strtolower($needle) . '%'])
                    ->orWhereRaw('LOWER(users.email) LIKE ?', ['%' . strtolower($needle) . '%']);
            })
            ->orderByRaw('CASE WHEN LOWER(users.name) = ? THEN 0 WHEN LOWER(users.name) LIKE ? THEN 1 ELSE 2 END', [strtolower($needle), strtolower($needle) . '%'])
            ->orderByRaw('LENGTH(users.name) ASC')
            ->value('users.id');

        if ($like !== null) {
            return (int) $like;
        }

        $tokens = preg_split('/\s+/', strtolower($needle)) ?: [];
        foreach ($tokens as $token) {
            if (strlen($token) < 2) {
                continue;
            }

            $tokenMatch = (clone $baseQuery)
                ->where(function ($query) use ($token): void {
                    $query->whereRaw('LOWER(users.name) = ?', [$token])
                        ->orWhereRaw('LOWER(users.name) LIKE ?', [$token . ' %'])
                        ->orWhereRaw('LOWER(users.name) LIKE ?', ['% ' . $token])
                        ->orWhereRaw('LOWER(users.name) LIKE ?', ['% ' . $token . ' %'])
                        ->orWhereRaw('LOWER(users.email) LIKE ?', [$token . '@%']);
                })
                ->orderByRaw('LENGTH(users.name) ASC')
                ->value('users.id');

            if ($tokenMatch !== null) {
                return (int) $tokenMatch;
            }
        }

        return null;
    }

    private function cleanAssigneeHint(string $hint): string
    {
        $cleaned = trim($hint);
        $cleaned = preg_replace('/\s+/', ' ', $cleaned) ?? $cleaned;
        $cleaned = rtrim($cleaned, ',.;:!?');
        $cleaned = preg_replace('/^(the|that|our|my|this)\s+/i', '', $cleaned) ?? $cleaned;
        $cleaned = preg_replace('/\b(agent|user|staff|member)\s*$/i', '', $cleaned) ?? $cleaned;

        return trim($cleaned);
    }

    /**
     * @param  array<string, string>  $entities
     */
    private function messageMentionsAssignee(string $message, array $entities): bool
    {
        if (is_string($entities['agent'] ?? null) && trim((string) $entities['agent']) !== '') {
            return true;
        }

        return preg_match('/\b(assign(?:ed)?\s+to|for\s+(?:that\s+)?agent|agent\s+[a-zA-Z])/i', $message) === 1
            || preg_match('/\bfor\s+[a-zA-Z][a-zA-Z\'\-]*(?:\s+[a-zA-Z][a-zA-Z\'\-]*){0,3}\b/', $message) === 1;
    }

    private function generateKpiNameFallback(string $message, string $conversationSummary, int $companyId): string
    {
        $userPrompt = trim("Conversation:\n{$conversationSummary}\n\nMessage:\n{$message}");
        $result = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'You extract a concise KPI name from user text. Respond with plain text only, no markdown, max 80 characters. If no name is present, respond with: New KPI',
            userPrompt: $userPrompt,
            options: [
                'max_tokens' => 60,
                'temperature' => 0.1,
                'company_id' => $companyId,
                '_log' => [
                    'company_id' => $companyId,
                    'intent_type' => 'inference',
                    'tool_name' => 'kpis.create',
                    'routing_purpose' => 'operational',
                    'user_prompt' => $userPrompt,
                ],
            ],
        );

        $candidate = $result?->text !== null ? trim($result->text) : '';
        if ($candidate === '' || strtolower($candidate) === 'new kpi') {
            return 'New KPI';
        }

        return Str::limit($candidate, 255, '');
    }

    private function generateObjectiveFallback(string $message, string $name, string $conversationSummary, int $companyId): string
    {
        $userPrompt = trim("KPI name: {$name}\nConversation:\n{$conversationSummary}\n\nMessage:\n{$message}");
        $result = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'Write one concise KPI objective sentence (minimum 10 characters) from the user request. Plain text only, no markdown.',
            userPrompt: $userPrompt,
            options: [
                'max_tokens' => 120,
                'temperature' => 0.2,
                'company_id' => $companyId,
                '_log' => [
                    'company_id' => $companyId,
                    'intent_type' => 'inference',
                    'tool_name' => 'kpis.create',
                    'routing_purpose' => 'operational',
                    'user_prompt' => $userPrompt,
                ],
            ],
        );

        $candidate = $result?->text !== null ? trim($result->text) : '';
        if (mb_strlen($candidate) < 10) {
            return 'Deliver measurable progress toward the requested KPI target within the selected period.';
        }

        return Str::limit($candidate, 5000, '');
    }

    private function generateTargetValueFallback(string $message, string $name, string $conversationSummary, int $companyId): string
    {
        $fromMessage = $this->extractTargetValueFromSentence($message);
        if (is_string($fromMessage) && trim($fromMessage) !== '') {
            return Str::limit(trim($fromMessage), 255, '');
        }

        $userPrompt = trim("KPI name: {$name}\nConversation:\n{$conversationSummary}\n\nMessage:\n{$message}");
        $result = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'Extract or propose one concise measurable KPI target value from the user request. Plain text only, max 40 characters. Examples: "50 visits", "100%", "25 leads".',
            userPrompt: $userPrompt,
            options: [
                'max_tokens' => 40,
                'temperature' => 0.1,
                'company_id' => $companyId,
                '_log' => [
                    'company_id' => $companyId,
                    'intent_type' => 'inference',
                    'tool_name' => 'kpis.create',
                    'routing_purpose' => 'operational',
                    'user_prompt' => $userPrompt,
                ],
            ],
        );

        $candidate = $result?->text !== null ? trim($result->text) : '';
        if ($candidate !== '' && strtolower($candidate) !== 'to be defined') {
            return Str::limit($candidate, 255, '');
        }

        return '1 completed target';
    }
}
