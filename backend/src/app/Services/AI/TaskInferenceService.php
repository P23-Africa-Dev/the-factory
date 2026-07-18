<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Enums\TaskPriority;
use App\Enums\TaskType;
use App\Models\User;
use App\Services\AI\Providers\AiGenerationResult;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Throwable;

class TaskInferenceService
{
    public function __construct(
        private readonly AiProviderRouter $aiProviderRouter,
    ) {}

    /**
     * @param  array<string, string>  $entities
     * @return array<string, mixed>
     */
    public function infer(
        string $message,
        int $companyId,
        array $entities = [],
        string $role = 'admin',
        int $userId = 0,
        string $conversationSummary = '',
    ): array {
        $normalized = trim($message);
        $isAgent = $role === 'agent';
        $llmCandidate = $this->extractStructuredCandidate($normalized, $conversationSummary, $companyId, $userId);

        // Prefer deterministic extractions over model candidates when both exist.
        $labeledTitle = $this->extractLabeledValue($message, ['task title', 'title']);
        $sentenceTitle = $this->extractTaskTitleFromSentence($message);
        $rawTitle = $this->firstNonEmptyString([
            $labeledTitle,
            $sentenceTitle,
            $llmCandidate['title'] ?? null,
        ]) ?? 'Task created by ELY';
        $title = Str::limit(trim($rawTitle), 255, '');
        // Strict confirmation treats missing user-provided titles as defaults even when LLM filled one.
        $usedDefaultTitle = $labeledTitle === null && $sentenceTitle === null;

        $rawDescription = $this->firstNonEmptyString([
            $this->extractLabeledValue($message, ['description']),
            $llmCandidate['description'] ?? null,
        ]);
        if ($rawDescription === null) {
            $rawDescription = preg_match('/\bgenerate\b/i', $message) === 1
                ? $this->generateTaskDescription($message, $title, $companyId, $userId)
                : $this->buildTaskDescriptionFallback($message, $title);
        }
        $description = Str::limit(trim($rawDescription), 5000, '');

        $rawType = $this->firstNonEmptyString([
            $this->extractLabeledValue($message, ['task type', 'type']),
            $llmCandidate['type'] ?? null,
        ]);
        if ($rawType === null && preg_match('/\bvisit\b/i', $message) === 1) {
            $rawType = 'sales visit';
        }
        $typeResolution = $this->resolveTaskType($rawType);

        $locationParts = $this->resolveLocationParts($message, $llmCandidate);
        $location = $locationParts['location'];
        $address = $locationParts['address'];

        $labeledDue = $this->extractLabeledValue($message, ['due date', 'due']);
        $sentenceDue = $this->extractDueDateHintFromSentence($message);
        $dueDateText = $this->firstNonEmptyString([
            $labeledDue,
            $sentenceDue,
            $llmCandidate['due_date'] ?? null,
        ]);
        $dueAt = $this->resolveDueDate($dueDateText);
        $usedDefaultDueDate = $labeledDue === null && $sentenceDue === null;

        $assigneeToken = $isAgent ? null : $this->firstNonEmptyString([
            $this->extractAssigneeToken($message),
            isset($entities['agent']) ? (string) $entities['agent'] : null,
            $llmCandidate['assignee'] ?? null,
        ]);
        $assignedAgentId = $isAgent ? null : $this->resolveAgentIdFromAssigneeToken((string) ($assigneeToken ?? ''), $companyId);

        $priority = $this->resolvePriority(
            $this->firstNonEmptyString([
                $this->extractLabeledValue($message, ['priority']),
                $llmCandidate['priority'] ?? null,
            ]),
        );

        return [
            'title' => $title,
            'description' => $description,
            'type' => $typeResolution['value'],
            'location' => Str::limit($location, 255, ''),
            'address' => Str::limit($address, 1000, ''),
            'due_date' => $dueAt,
            'priority' => $priority,
            ...($isAgent ? [] : ['assigned_agent_id' => $assignedAgentId]),
            ...(! $isAgent && is_string($assigneeToken) && $assigneeToken !== '' && $assignedAgentId === null
                ? ['assignee' => $assigneeToken]
                : []),
            '__inference' => [
                'used_default_title' => $usedDefaultTitle,
                'used_default_due_date' => $usedDefaultDueDate,
                'raw_type_unrecognized' => $typeResolution['raw_unrecognized'],
                'assignee_unresolved' => ! $isAgent && $assignedAgentId === null,
                'assignee_token' => $assigneeToken,
                'source' => $llmCandidate === [] ? 'heuristic' : 'llm_plus_heuristic',
            ],
        ];
    }

    /**
     * @param  array<string, string>  $entities
     * @param  array<string, mixed>  $actionArgs
     * @return array<string, mixed>
     */
    public function normalizeProvidedArgs(
        string $message,
        int $companyId,
        array $entities,
        array $actionArgs,
        string $role = 'admin',
    ): array {
        $normalized = $actionArgs;
        $isAgent = $role === 'agent';

        if ($isAgent) {
            unset($normalized['assigned_agent_id'], $normalized['assigned_agent_ids'], $normalized['assignee']);
        }

        foreach (['title', 'description', 'location', 'address'] as $field) {
            if (is_string($normalized[$field] ?? null)) {
                $max = $field === 'description' ? 5000 : ($field === 'address' ? 1000 : 255);
                $value = Str::limit(trim((string) $normalized[$field]), $max, '');
                if ($value !== '') {
                    $normalized[$field] = $value;
                }
            }
        }

        if (is_string($normalized['type'] ?? null)) {
            $normalized['type'] = $this->resolveTaskType((string) $normalized['type'])['value'];
        }

        if (is_string($normalized['priority'] ?? null)) {
            $priority = $this->resolvePriority((string) $normalized['priority']);
            if ($priority !== null) {
                $normalized['priority'] = $priority;
            } else {
                unset($normalized['priority']);
            }
        }

        if (is_string($normalized['due_date'] ?? null) && trim((string) $normalized['due_date']) !== '') {
            $normalized['due_date'] = $this->resolveDueDate(trim((string) $normalized['due_date']));
        }

        if (isset($normalized['latitude']) && is_numeric($normalized['latitude'])) {
            $normalized['latitude'] = (float) $normalized['latitude'];
        }
        if (isset($normalized['longitude']) && is_numeric($normalized['longitude'])) {
            $normalized['longitude'] = (float) $normalized['longitude'];
        }
        if (array_key_exists('visit_verification_required', $normalized)) {
            $normalized['visit_verification_required'] = filter_var(
                $normalized['visit_verification_required'],
                FILTER_VALIDATE_BOOL,
            );
        }

        if (! $isAgent) {
            if (is_string($normalized['assignee'] ?? null)) {
                $assigneeToken = trim((string) $normalized['assignee']);
                unset($normalized['assignee']);
                if ($assigneeToken !== '') {
                    $resolved = $this->resolveAgentIdFromAssigneeToken($assigneeToken, $companyId);
                    $normalized['assigned_agent_id'] = $resolved;
                    if ($resolved === null) {
                        $normalized['assignee'] = $assigneeToken;
                    }
                }
            } elseif (is_string($normalized['assigned_agent_id'] ?? null) && is_numeric($normalized['assigned_agent_id'])) {
                $normalized['assigned_agent_id'] = (int) $normalized['assigned_agent_id'];
            }

            if (($normalized['assigned_agent_id'] ?? null) === null) {
                $fallbackAgent = $this->resolveAgentIdForTaskMessage($message, $companyId, $entities);
                if ($fallbackAgent !== null) {
                    $normalized['assigned_agent_id'] = $fallbackAgent;
                    unset($normalized['assignee']);
                }
            }
        }

        $existingInference = is_array($normalized['__inference'] ?? null) ? $normalized['__inference'] : [];
        $normalized['__inference'] = array_merge($existingInference, [
            'assignee_unresolved' => ! $isAgent && ($normalized['assigned_agent_id'] ?? null) === null,
            'used_default_title' => ($existingInference['used_default_title'] ?? false) === true
                && strtolower(trim((string) ($normalized['title'] ?? ''))) === 'task created by ely',
            'used_default_due_date' => ($existingInference['used_default_due_date'] ?? false) === true
                && ! is_string($actionArgs['due_date'] ?? null),
        ]);

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<int, string>
     */
    public function warningCodes(array $args, string $role = 'admin'): array
    {
        $warningCodes = [];
        $inference = is_array($args['__inference'] ?? null) ? $args['__inference'] : [];

        if ($role !== 'agent' && (($inference['assignee_unresolved'] ?? false) === true || ($args['assigned_agent_id'] ?? null) === null)) {
            $warningCodes[] = 'assignee_unresolved';
        }

        if (($inference['raw_type_unrecognized'] ?? false) === true) {
            $warningCodes[] = 'raw_type_unrecognized';
        }

        if (($inference['used_default_due_date'] ?? false) === true) {
            $warningCodes[] = 'used_default_due_date';
        }

        if (($inference['used_default_title'] ?? false) === true) {
            $warningCodes[] = 'used_default_title';
        }

        if (($inference['assignee_ambiguous'] ?? false) === true) {
            $warningCodes[] = 'assignee_ambiguous';
        }

        return $warningCodes;
    }

    /**
     * Patch an existing inferred task with conversational corrections.
     *
     * @param  array<string, mixed>  $currentArgs
     * @return array<string, mixed>
     */
    public function patchFromCorrection(
        string $message,
        array $currentArgs,
        int $companyId,
        string $role = 'admin',
    ): array {
        $patched = $currentArgs;
        $normalized = trim($message);
        $isAgent = $role === 'agent';

        if (preg_match('/\b(?:include|add|set|use|change|update)\s+(?:the\s+)?location\s*(?:to|=|:)?\s*(.+)$/i', $normalized, $m) === 1
            || preg_match('/\blocation\s*(?:should\s+be|is|=|:)\s*(.+)$/i', $normalized, $m) === 1
        ) {
            $location = $this->stripTrailingClauses(trim((string) $m[1]));
            if ($location !== '') {
                $patched['location'] = Str::limit($location, 255, '');
                $patched['address'] = Str::limit($location, 1000, '');
            }
        } elseif (preg_match('/\bat\s+(.+?)(?:\.|$)/i', $normalized, $atMatch) === 1
            && preg_match('/\blocation\b/i', $normalized) === 1
        ) {
            $location = $this->stripTrailingClauses(trim((string) $atMatch[1]));
            if ($location !== '') {
                $patched['location'] = Str::limit($location, 255, '');
                $patched['address'] = Str::limit($location, 1000, '');
            }
        }

        if (preg_match('/\b(?:assign|reassign)\s+(?:to\s+)?(.+?)(?:\.|$)/i', $normalized, $m) === 1 && ! $isAgent) {
            $token = $this->normalizeAssigneeCandidate((string) $m[1]);
            if ($token !== '') {
                $resolved = $this->resolveAgentIdFromAssigneeToken($token, $companyId);
                $patched['assigned_agent_id'] = $resolved;
                if ($resolved === null) {
                    $patched['assignee'] = $token;
                } else {
                    unset($patched['assignee']);
                }
            }
        }

        if (preg_match('/\b(?:due|by|on)\s+(.+?)(?:\.|$)/i', $normalized, $m) === 1) {
            $dueText = trim((string) $m[1]);
            if ($dueText !== '') {
                $patched['due_date'] = $this->resolveDueDate($dueText);
                $inference = is_array($patched['__inference'] ?? null) ? $patched['__inference'] : [];
                $inference['used_default_due_date'] = false;
                $patched['__inference'] = $inference;
            }
        }

        if (preg_match('/\b(?:title|rename)\s*(?:to|as|=|:)\s*[\"“]?(.+?)[\"”]?(?:\.|$)/i', $normalized, $m) === 1) {
            $title = trim((string) $m[1]);
            if ($title !== '') {
                $patched['title'] = Str::limit($title, 255, '');
            }
        }

        if (preg_match('/\b(?:type|task type)\s*(?:to|as|=|:)\s*([a-z_ ]+)/i', $normalized, $m) === 1) {
            $patched['type'] = $this->resolveTaskType((string) $m[1])['value'];
        }

        $inference = is_array($patched['__inference'] ?? null) ? $patched['__inference'] : [];
        $inference['assignee_unresolved'] = ! $isAgent && ($patched['assigned_agent_id'] ?? null) === null;
        $patched['__inference'] = $inference;

        return $patched;
    }

    public function looksLikeCorrection(string $message): bool
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return false;
        }

        if (preg_match('/\b(create|add|new)\s+(a\s+)?task\b/i', $normalized) === 1) {
            return false;
        }

        return preg_match('/\b(include|add|set|change|update|correct|fix|use|should\s+include|assign|reassign|due|location|address|title|type|priority)\b/i', $normalized) === 1;
    }

    /**
     * @param  array<string, mixed>  $llmCandidate
     * @return array{location: string, address: string}
     */
    private function resolveLocationParts(string $message, array $llmCandidate): array
    {
        $labeled = $this->extractLabeledValue($message, ['location & address', 'address', 'location']);
        $fromLlmLocation = is_string($llmCandidate['location'] ?? null) ? trim((string) $llmCandidate['location']) : '';
        $fromLlmAddress = is_string($llmCandidate['address'] ?? null) ? trim((string) $llmCandidate['address']) : '';

        $address = $this->firstNonEmptyString([
            $labeled,
            $this->extractGeographicLocation($message),
            $this->extractVisitLocationFromSentence($message),
            $fromLlmAddress !== '' ? $fromLlmAddress : null,
            $fromLlmLocation !== '' ? $fromLlmLocation : null,
        ]) ?? 'Operations Center';

        $address = $this->stripTrailingClauses($address);
        $location = trim((string) Str::of($address)->before(','));
        if ($location === '') {
            $location = 'Operations Center';
        }

        return [
            'location' => $location,
            'address' => $address,
        ];
    }

    private function extractGeographicLocation(string $message): ?string
    {
        if (preg_match('/\bat\s+((?:lekki|ikeja|victoria\s+island|vi|ajah|yaba|surulere|mainland|island|phase\s+[ivx0-9]+)[^,\.;]*)/i', $message, $m) === 1) {
            return $this->stripTrailingClauses(trim((string) $m[1]));
        }

        if (preg_match('/\bat\s+([A-Z][\w\'\-]+(?:\s+[A-Z0-9][\w\'\-]*){0,5})/', $message, $m) === 1) {
            return $this->stripTrailingClauses(trim((string) $m[1]));
        }

        return null;
    }

    private function extractVisitLocationFromSentence(string $message): ?string
    {
        if (preg_match('/\b(?:to\s+)?visit\s+(.+?)(?=\s+and\s+assign\b|\s+assign\b|\s+due\b|\s+by\b|[\.,;]|$|\n)/i', $message, $match) === 1) {
            $target = $this->stripTrailingClauses(trim((string) $match[1]));
            // Prefer geographic "at X" inside the visit clause when present.
            if (preg_match('/\bat\s+(.+)$/i', $target, $atMatch) === 1) {
                return $this->stripTrailingClauses(trim((string) $atMatch[1]));
            }

            return $target !== '' ? $target : null;
        }

        return null;
    }

    private function extractTaskTitleFromSentence(string $message): ?string
    {
        if (preg_match('/\b(?:task\s+title|title)\b\s*[:\-]?\s*["“](.+?)["”]/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\bto\s+(visit|deliver|inspect|collect)\s+(.+?)(?=\s+and\s+assign\b|\s+assign\b|\s+due\b|[\.,;]|$|\n)/i', $message, $m) === 1) {
            $verb = ucfirst(strtolower(trim((string) $m[1])));
            $target = $this->stripTrailingClauses(trim((string) $m[2]));
            // Compact "visit a client at Lekki..." -> "Visit client"
            if (preg_match('/\b(a\s+)?client\b/i', $target) === 1) {
                return "{$verb} client";
            }
            if (preg_match('/\bat\s+(.+)$/i', $target, $atMatch) === 1) {
                $place = $this->stripTrailingClauses(trim((string) $atMatch[1]));

                return $place !== '' ? "{$verb} {$place}" : "{$verb} location";
            }

            return $target !== '' ? "{$verb} {$target}" : null;
        }

        if (preg_match('/\bcreate\s+(a\s+)?task\b[:\-\s]*(.+?)(?=\s+and\s+assign\b|\s+assign\b|\.|$|\n|task\s+type\s*:|description\s*:|assign\s+to\b|due\s+date\s*:)/i', $message, $m) === 1) {
            $candidate = $this->stripTrailingClauses(trim((string) $m[2]));
            if ($candidate !== '' && preg_match('/^assign\s+to\b/i', $candidate) !== 1) {
                return $candidate;
            }
        }

        return null;
    }

    private function extractAssigneeToken(string $message): ?string
    {
        if (preg_match('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', $message, $emailMatch) === 1) {
            return trim((string) $emailMatch[0]);
        }

        // "assign Taraji Henson to it"
        if (preg_match('/\bassign\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+to\s+(?:it|the\s+task|this\s+task)\b/i', $message, $m) === 1) {
            return $this->normalizeAssigneeCandidate((string) $m[1]);
        }

        if (preg_match('/\bassign\s*to\s*:\s*([^\.\n]+)/i', $message, $m) === 1) {
            return $this->normalizeAssigneeCandidate((string) $m[1]);
        }

        if (preg_match('/\bassign\s+to\s+([^\.\n,;]+)/i', $message, $m) === 1) {
            return $this->normalizeAssigneeCandidate((string) $m[1]);
        }

        if (preg_match('/\btask\s+for\s+([A-Za-z][A-Za-z\'\-]+(?:\s+[A-Za-z][A-Za-z\'\-]*){0,2})(?=\s+to\b|\s+due\b|\s+by\b|[.,;]|$)/i', $message, $m) === 1) {
            return $this->normalizeAssigneeCandidate((string) $m[1]);
        }

        return null;
    }

    /**
     * @param  array<string, string>  $entities
     */
    private function resolveAgentIdForTaskMessage(string $message, int $companyId, array $entities): ?int
    {
        $token = $this->extractAssigneeToken($message);
        if (is_string($token) && $token !== '') {
            $resolved = $this->resolveAgentIdFromAssigneeToken($token, $companyId);
            if ($resolved !== null) {
                return $resolved;
            }
        }

        if (isset($entities['agent']) && is_string($entities['agent'])) {
            return $this->resolveAgentIdFromAssigneeToken($entities['agent'], $companyId);
        }

        return null;
    }

    public function resolveAgentIdFromAssigneeToken(string $token, int $companyId): ?int
    {
        $candidate = trim($token);
        if ($candidate === '') {
            return null;
        }

        $query = User::query()
            ->whereHas('companies', static function ($q) use ($companyId): void {
                $q->where('companies.id', $companyId)
                    ->where('company_users.role', 'agent');
            });

        // Editors may submit a raw user ID before the assignee list resolved to a name.
        if (preg_match('/^\d+$/', $candidate) === 1) {
            $byId = (clone $query)->where('users.id', (int) $candidate)->value('id');

            return is_numeric($byId) ? (int) $byId : null;
        }

        if (preg_match('/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i', $candidate) === 1) {
            $byEmail = (clone $query)->where('email', $candidate)->value('id');

            return is_numeric($byEmail) ? (int) $byEmail : null;
        }

        $exact = (clone $query)->whereRaw('LOWER(name) = ?', [strtolower($candidate)])->value('id');
        if (is_numeric($exact)) {
            return (int) $exact;
        }

        $matches = (clone $query)
            ->where('name', 'like', '%' . $candidate . '%')
            ->limit(2)
            ->pluck('id');

        if ($matches->count() === 1) {
            return (int) $matches->first();
        }

        return null;
    }

    private function normalizeAssigneeCandidate(string $raw): string
    {
        $candidate = trim($raw);
        if ($candidate === '') {
            return '';
        }

        $candidate = preg_replace('/\s+to\s+(?:it|the\s+task|this\s+task|visit|deliver|inspect|collect|do)\b.*/i', '', $candidate) ?? $candidate;
        $candidate = preg_replace('/\s+(?:due|by|on|location|address|priority|description|title|type)\b.*/i', '', $candidate) ?? $candidate;
        $candidate = preg_replace('/\((.*?)\)/', '', $candidate) ?? $candidate;
        $candidate = preg_replace('/\bagent\s+/i', '', $candidate) ?? $candidate;

        return trim($candidate);
    }

    private function stripTrailingClauses(string $value): string
    {
        $cleaned = preg_replace('/\s+and\s+assign\b.*/i', '', $value) ?? $value;
        $cleaned = preg_replace('/\s+assign\b.*/i', '', $cleaned) ?? $cleaned;
        $cleaned = preg_replace('/\s+due\b.*/i', '', $cleaned) ?? $cleaned;
        $cleaned = preg_replace('/\s+by\b.*/i', '', $cleaned) ?? $cleaned;
        $cleaned = preg_replace('/\s+this\s+task\s+creation\b.*/i', '', $cleaned) ?? $cleaned;

        return trim($cleaned, " \t\n\r\0\x0B,.;");
    }

    /**
     * @return array<string, mixed>
     */
    private function extractStructuredCandidate(
        string $message,
        string $conversationSummary,
        int $companyId,
        int $userId,
    ): array {
        if (trim($message) === '') {
            return [];
        }

        $userPrompt = trim(<<<PROMPT
Conversation summary:
{$conversationSummary}

User request:
{$message}

Return ONLY JSON with keys:
title, description, type, location, address, due_date, assignee, priority
Use null when unknown. type must be one of: sales_visit, inspection, delivery, collection, awareness.
Keep title short. Keep location as the place name only (e.g. "Lekki Phase II"), not assignment clauses.
PROMPT);

        try {
            $result = $this->aiProviderRouter->generateForPurpose(
                purpose: 'routing',
                systemPrompt: 'You extract task form fields for a workforce CRM. Respond with valid JSON only. Never invent user IDs.',
                userPrompt: $userPrompt,
                options: [
                    'company_id' => $companyId,
                    'max_tokens' => 350,
                    'temperature' => 0,
                    '_log' => [
                        'company_id' => $companyId,
                        'user_id' => $userId,
                        'intent_type' => 'inference',
                        'tool_name' => 'tasks.create',
                        'routing_purpose' => 'routing',
                        'user_prompt' => $message,
                    ],
                ],
            );
        } catch (Throwable) {
            return [];
        }

        if (! $result instanceof AiGenerationResult || ! $result->isSuccessful()) {
            return [];
        }

        $text = trim((string) $result->text);
        if (preg_match('/\{.*\}/s', $text, $m) !== 1) {
            return [];
        }

        try {
            $decoded = json_decode($m[0], true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            return [];
        }

        return is_array($decoded) ? $decoded : [];
    }

    private function generateTaskDescription(string $message, string $title, int $companyId, int $userId): string
    {
        $userPrompt = trim("Task title: {$title}\nUser request:\n{$message}");
        $result = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'Write one concise operational task description (minimum 20 characters) for a field workforce platform. Plain text only, no markdown.',
            userPrompt: $userPrompt,
            options: [
                'company_id' => $companyId,
                'max_tokens' => 160,
                'temperature' => 0.3,
                '_log' => [
                    'company_id' => $companyId,
                    'user_id' => $userId,
                    'intent_type' => 'inference',
                    'tool_name' => 'tasks.create',
                    'routing_purpose' => 'operational',
                    'user_prompt' => $userPrompt,
                ],
            ],
        );

        $candidate = $result instanceof AiGenerationResult && is_string($result->text) ? trim($result->text) : '';
        if (mb_strlen($candidate) >= 10) {
            return Str::limit($candidate, 5000, '');
        }

        return $this->buildTaskDescriptionFallback($message, $title);
    }

    private function buildTaskDescriptionFallback(string $message, string $title): string
    {
        if (preg_match('/\bvisit\s+(.+?)(?=\s+and\s+assign\b|\s+assign\b|[\.,;]|$)/i', $message, $match) === 1) {
            $target = $this->stripTrailingClauses(trim((string) $match[1]));

            return "Complete the assigned visit to {$target}, document observations, engage relevant contacts, and log outcomes in the CRM.";
        }

        $fallback = trim($message) !== '' ? trim($message) : $title;

        return Str::limit($fallback, 5000, '');
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
                $value = $this->stripWrappingQuotes(trim((string) $m[1]));
                if ($value !== '') {
                    return $value;
                }
            }
        }

        return null;
    }

    private function stripWrappingQuotes(string $value): string
    {
        $trimmed = trim($value);
        if (
            (str_starts_with($trimmed, '"') && str_ends_with($trimmed, '"'))
            || (str_starts_with($trimmed, "'") && str_ends_with($trimmed, "'"))
        ) {
            return trim(substr($trimmed, 1, -1));
        }

        return $trimmed;
    }

    /**
     * @return array{value: string, raw_unrecognized: bool}
     */
    public function resolveTaskType(?string $rawType): array
    {
        if (! is_string($rawType) || trim($rawType) === '') {
            return [
                'value' => TaskType::INSPECTION->value,
                'raw_unrecognized' => false,
            ];
        }

        $normalized = strtolower(trim($rawType));
        $map = [
            'sales visit' => TaskType::SALES_VISIT->value,
            'sales_visit' => TaskType::SALES_VISIT->value,
            'inspection' => TaskType::INSPECTION->value,
            'delivery' => TaskType::DELIVERY->value,
            'collection' => TaskType::COLLECTION->value,
            'awareness' => TaskType::AWARENESS->value,
        ];

        if (array_key_exists($normalized, $map)) {
            return [
                'value' => $map[$normalized],
                'raw_unrecognized' => false,
            ];
        }

        return [
            'value' => TaskType::INSPECTION->value,
            'raw_unrecognized' => true,
        ];
    }

    public function resolveDueDate(?string $dueDateText): string
    {
        if (is_string($dueDateText) && trim($dueDateText) !== '') {
            $text = strtolower(trim($dueDateText));

            if (preg_match('/\btomorrow(?:\s+(morning|afternoon|evening|night))?\b/i', $text, $m) === 1) {
                $candidate = now()->addDay();
                $part = strtolower((string) ($m[1] ?? ''));
                $candidate = match ($part) {
                    'morning' => $candidate->setTime(9, 0),
                    'afternoon' => $candidate->setTime(14, 0),
                    'evening' => $candidate->setTime(18, 0),
                    'night' => $candidate->setTime(20, 0),
                    default => $candidate->setTime(17, 0),
                };

                return $candidate->toDateTimeString();
            }

            if (preg_match('/\btoday(?:\s+(morning|afternoon|evening|night))?\b/i', $text, $m) === 1) {
                $candidate = now();
                $part = strtolower((string) ($m[1] ?? ''));
                $candidate = match ($part) {
                    'morning' => $candidate->setTime(9, 0),
                    'afternoon' => $candidate->setTime(14, 0),
                    'evening' => $candidate->setTime(18, 0),
                    'night' => $candidate->setTime(20, 0),
                    default => $candidate->setTime(17, 0),
                };

                if ($candidate->lessThanOrEqualTo(now())) {
                    $candidate = $candidate->addDay();
                }

                return $candidate->toDateTimeString();
            }

            if (preg_match('/\bin\s+(\d{1,2})\s+days?\b/i', $text, $m) === 1) {
                $days = max(1, (int) $m[1]);

                return now()->addDays($days)->setTime(17, 0)->toDateTimeString();
            }

            try {
                $candidate = Carbon::parse($text);
                if ($candidate->hour === 0 && $candidate->minute === 0 && $candidate->second === 0) {
                    $candidate = $candidate->setTime(17, 0);
                }
                if ($candidate->lessThanOrEqualTo(now())) {
                    $candidate = $candidate->addDay();
                }

                return $candidate->toDateTimeString();
            } catch (Throwable) {
                // Fall through.
            }
        }

        return now()->addDay()->setTime(17, 0)->toDateTimeString();
    }

    private function extractDueDateHintFromSentence(string $message): ?string
    {
        if (preg_match('/\b(?:due|by|for)\s+(tomorrow(?:\s+(?:morning|afternoon|evening|night))?)\b/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\b(?:due|by|for)\s+(today(?:\s+(?:morning|afternoon|evening|night))?)\b/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\b(?:due|by|for)\s+(next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\bin\s+(\d{1,2})\s+days?\b/i', $message, $m) === 1) {
            return 'in ' . (int) $m[1] . ' days';
        }

        return null;
    }

    private function resolvePriority(?string $raw): ?string
    {
        if (! is_string($raw) || trim($raw) === '') {
            return null;
        }

        $normalized = strtolower(trim($raw));
        foreach (TaskPriority::values() as $value) {
            if ($normalized === $value) {
                return $value;
            }
        }

        return null;
    }

    /**
     * @param  array<int, mixed>  $candidates
     */
    private function firstNonEmptyString(array $candidates): ?string
    {
        foreach ($candidates as $candidate) {
            if (is_string($candidate) && trim($candidate) !== '') {
                return trim($candidate);
            }
        }

        return null;
    }
}
