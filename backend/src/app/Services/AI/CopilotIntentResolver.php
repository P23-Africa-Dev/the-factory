<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Services\AI\Context\ConversationMemoryService;

class CopilotIntentResolver
{
    public function __construct(
        private readonly IntentClassifier $intentClassifier,
        private readonly LlmIntentRouter $llmIntentRouter,
        private readonly AiIntentRoutingSettingService $intentRoutingSettingService,
        private readonly ConversationMemoryService $conversationMemoryService,
        private readonly ActionDraftStore $actionDraftStore,
        private readonly ReadToolArgsResolver $readToolArgsResolver,
        private readonly TaskInferenceService $taskInferenceService,
    ) {}
    /**
     * @param  array<string, mixed>  $actionArgs
     * @return array{
     *   intent: array{type: string, tool: ?string, confidence: float},
     *   action_confirmed: bool,
     *   action_args: array<string, mixed>,
     *   action_message: string,
     *   resolved_action_tool: ?string,
     *   resolved_read_tool: ?string
     * }
     */
    public function resolve(
        string $message,
        string $role,
        ?string $threadId,
        int $companyId,
        int $userId,
        array $actionArgs,
        bool $actionConfirmed,
    ): array {
        $intent = ['type' => 'general', 'tool' => null, 'confidence' => 0.4];

        if (
            preg_match('/\bproject\b/i', $message) === 1
            && preg_match('/\b(delete|remove|cancel|archive)\b/i', $message) === 1
        ) {
            return $this->buildResult($intent, $actionConfirmed, $actionArgs, $message, $threadId, $companyId, $userId);
        }

        // Prefer the latest assistant suggestion (truncated list offer) over stale action confirmations.
        $truncatedListTool = $this->readToolArgsResolver->resolveTruncatedListToolFromThread(
            $message,
            $threadId,
            $companyId,
            $userId,
        );
        if (is_string($truncatedListTool) && $truncatedListTool !== '') {
            return $this->buildResult(
                ['type' => 'tool', 'tool' => $truncatedListTool, 'confidence' => 0.95],
                $actionConfirmed,
                $actionArgs,
                $message,
                $threadId,
                $companyId,
                $userId,
            );
        }

        if ($this->isNaturalLanguageConfirmation($message)) {
            $pendingTool = $this->resolvePendingActionToolFromThread($threadId, $companyId, $userId);
            if ($pendingTool === null
                && ! $this->readToolArgsResolver->latestAssistantTurnOffersListExpansion($threadId, $companyId, $userId)
            ) {
                $pendingTool = $this->resolveContextualActionToolFromThread($threadId, $companyId, $userId);
            }

            if (is_string($pendingTool) && $pendingTool !== '') {
                return $this->buildResult(
                    ['type' => 'action', 'tool' => $pendingTool, 'confidence' => 0.95],
                    true,
                    $actionArgs,
                    $message,
                    $threadId,
                    $companyId,
                    $userId,
                );
            }
        }

        if ($actionConfirmed && $actionArgs === [] && is_string($threadId) && $threadId !== '') {
            $pendingDraft = $this->actionDraftStore->get($companyId, $userId, $threadId);
            if (is_array($pendingDraft) && ($pendingDraft['action_args'] ?? null) !== null) {
                $actionArgs = is_array($pendingDraft['action_args']) ? $pendingDraft['action_args'] : [];
                $actionArgs['draft_id'] = $pendingDraft['draft_id'];
                $actionArgs['draft_version'] = $pendingDraft['draft_version'];

                return $this->buildResult(
                    [
                        'type' => 'action',
                        'tool' => (string) $pendingDraft['tool'],
                        'confidence' => 0.95,
                    ],
                    $actionConfirmed,
                    $actionArgs,
                    $message,
                    $threadId,
                    $companyId,
                    $userId,
                );
            }
        }

        if ($actionConfirmed && $actionArgs !== []) {
            $pendingTool = $this->resolvePendingActionToolFromThread($threadId, $companyId, $userId);
            if (is_string($pendingTool) && $pendingTool !== '') {
                return $this->buildResult(
                    ['type' => 'action', 'tool' => $pendingTool, 'confidence' => 1.0],
                    $actionConfirmed,
                    $actionArgs,
                    $message,
                    $threadId,
                    $companyId,
                    $userId,
                );
            }
        }

        if ($this->intentRoutingSettingService->isAiFirst()) {
            $llmIntent = $this->routeWithLlm($message, $role, $threadId, $companyId, $userId);
            if ($llmIntent !== null) {
                return $this->buildResult($llmIntent, $actionConfirmed, $actionArgs, $message, $threadId, $companyId, $userId);
            }
        }

        $intent = $this->resolveWithRules(
            $message,
            $role,
            $threadId,
            $companyId,
            $userId,
            skipHybridEnhance: $this->intentRoutingSettingService->isAiFirst(),
        );
        $resolvedActionTool = $this->resolveActionToolFromMessagePrivate($message, $threadId, $companyId, $userId);
        $resolvedReadTool = $this->resolveReadToolFromMessage($message);

        return $this->buildResult(
            $intent,
            $actionConfirmed,
            $actionArgs,
            $message,
            $threadId,
            $companyId,
            $userId,
            $resolvedActionTool,
            $resolvedReadTool,
        );
    }

    public function looksLikeActionRequest(string $message): bool
    {
        return $this->looksLikeActionRequestPrivate($message);
    }

    public function resolveActionToolFromMessage(
        string $message,
        ?string $threadId,
        int $companyId,
        int $userId,
    ): ?string {
        return $this->resolveActionToolFromMessagePrivate($message, $threadId, $companyId, $userId);
    }

    /**
     * @param  array{type: string, tool: ?string, confidence: float}  $intent
     * @param  array<string, mixed>  $actionArgs
     * @return array{
     *   intent: array{type: string, tool: ?string, confidence: float},
     *   action_confirmed: bool,
     *   action_args: array<string, mixed>,
     *   action_message: string,
     *   resolved_action_tool: ?string,
     *   resolved_read_tool: ?string
     * }
     */
    private function buildResult(
        array $intent,
        bool $actionConfirmed,
        array $actionArgs,
        string $message,
        ?string $threadId,
        int $companyId,
        int $userId,
        ?string $resolvedActionTool = null,
        ?string $resolvedReadTool = null,
    ): array {
        return [
            'intent' => $intent,
            'action_confirmed' => $actionConfirmed,
            'action_args' => $actionArgs,
            'action_message' => $this->buildActionableMessage(
                $message,
                $threadId,
                $companyId,
                $userId,
                is_string($intent['tool'] ?? null) ? (string) $intent['tool'] : $resolvedActionTool,
            ),
            'resolved_action_tool' => $resolvedActionTool,
            'resolved_read_tool' => $resolvedReadTool,
        ];
    }

    /**
     * @return array{type: string, tool: ?string, confidence: float}|null
     */
    private function routeWithLlm(
        string $message,
        string $role,
        ?string $threadId,
        int $companyId,
        int $userId,
    ): ?array {
        if (preg_match('/\b(delete|remove|cancel|archive)\b/i', $message) === 1) {
            return null;
        }

        $promptContext = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $recentMessages = is_array($promptContext['recent_messages'] ?? null) ? $promptContext['recent_messages'] : [];
        $route = $this->llmIntentRouter->route($message, $role, $recentMessages, $companyId, $userId, $threadId);
        if ($route === null) {
            return null;
        }

        $routeConfidence = (float) ($route['confidence'] ?? 0.0);
        if ($routeConfidence < 0.7) {
            return null;
        }

        $routeType = (string) ($route['type'] ?? 'chat');
        if ($routeType === 'chat') {
            return [
                'type' => 'general',
                'tool' => null,
                'confidence' => $routeConfidence,
            ];
        }

        $routeTool = is_string($route['tool'] ?? null) ? trim((string) $route['tool']) : '';
        if ($routeTool === '') {
            return null;
        }

        return [
            'type' => $routeType,
            'tool' => $routeTool,
            'confidence' => $routeConfidence,
        ];
    }

    /**
     * @return array{type: string, tool: ?string, confidence: float}
     */
    private function resolveWithRules(
        string $message,
        string $role,
        ?string $threadId,
        int $companyId,
        int $userId,
        bool $skipHybridEnhance,
    ): array {
        $intent = $this->intentClassifier->classify($message);
        $resolvedActionTool = $this->resolveActionToolFromMessagePrivate($message, $threadId, $companyId, $userId);

        if (
            preg_match('/\bproject\b/i', $message) === 1
            && preg_match('/\b(delete|remove|cancel|archive)\b/i', $message) === 1
        ) {
            $intent = ['type' => 'general', 'tool' => null, 'confidence' => 0.4];
        }

        if (($intent['type'] ?? 'general') === 'general' && $resolvedActionTool !== null) {
            $intent = ['type' => 'action', 'tool' => $resolvedActionTool, 'confidence' => 0.85];
        } elseif (($intent['type'] ?? 'general') === 'action' && ! is_string($intent['tool'] ?? null) && $resolvedActionTool !== null) {
            $intent['tool'] = $resolvedActionTool;
        }

        $resolvedReadTool = $this->resolveReadToolFromMessage($message);
        if (($intent['type'] ?? 'general') === 'general' && $resolvedReadTool !== null) {
            $intent = ['type' => 'tool', 'tool' => $resolvedReadTool, 'confidence' => 0.85];
        }

        if (($intent['type'] ?? 'general') === 'general' && $this->isTaskConversationFollowUp($message, $threadId, $companyId, $userId)) {
            $intent = ['type' => 'action', 'tool' => 'tasks.create', 'confidence' => 0.85];
        }

        if (! $skipHybridEnhance) {
            $intent = $this->maybeEnhanceIntentWithLlmRouter(
                intent: $intent,
                message: $message,
                role: $role,
                threadId: $threadId,
                companyId: $companyId,
                userId: $userId,
                resolvedActionTool: $resolvedActionTool,
                resolvedReadTool: $resolvedReadTool,
            );
        }

        return $intent;
    }

    private function maybeEnhanceIntentWithLlmRouter(
        array $intent,
        string $message,
        string $role,
        ?string $threadId,
        int $companyId,
        int $userId,
        ?string $resolvedActionTool,
        ?string $resolvedReadTool,
    ): array {
        if ($this->intentRoutingSettingService->isAiFirst() || ! (bool) config('services.ai.enable_hybrid_router', true)) {
            return $intent;
        }

        // Do not let the LLM remap unsupported destructive verbs onto create tools.
        if (preg_match('/\b(delete|remove|cancel|archive)\b/i', $message) === 1) {
            return $intent;
        }

        $confidence = (float) ($intent['confidence'] ?? 0.4);
        $intentType = (string) ($intent['type'] ?? 'general');
        $needsRouter = ($intentType === 'general' && $resolvedActionTool === null && $resolvedReadTool === null)
            || ($confidence < 0.9 && in_array($intentType, ['general', 'tool', 'action'], true))
            || ($this->looksLikeActionRequest($message) && $resolvedActionTool === null);

        if (! $needsRouter) {
            return $intent;
        }

        $promptContext = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $recentMessages = is_array($promptContext['recent_messages'] ?? null) ? $promptContext['recent_messages'] : [];
        $route = $this->llmIntentRouter->route($message, $role, $recentMessages, $companyId, $userId, $threadId);
        if ($route === null) {
            return $intent;
        }

        $routeConfidence = (float) ($route['confidence'] ?? 0.0);
        if ($routeConfidence < 0.7) {
            return $intent;
        }

        $routeType = (string) ($route['type'] ?? 'chat');
        if ($routeType === 'chat') {
            return [
                'type' => 'general',
                'tool' => null,
                'confidence' => $routeConfidence,
            ];
        }

        $routeTool = is_string($route['tool'] ?? null) ? trim((string) $route['tool']) : '';
        if ($routeTool === '') {
            return $intent;
        }

        return [
            'type' => $routeType,
            'tool' => $routeTool,
            'confidence' => max($confidence, $routeConfidence),
        ];
    }
    private function looksLikeActionRequestPrivate(string $message): bool
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return false;
        }

        return preg_match('/\b(create|add|start|open|schedule|book|setup|set\s*up|arrange|plan|send|notify|assign|reassign|transfer|move|update|change|cancel|delete|register|save|define|invite|onboard)\b/i', $normalized) === 1
            && preg_match('/\b(task|project|meeting|notification|alert|lead|crm|business|kpi|user|member|staff|agent|supervisor|admin)\b/i', $normalized) === 1;
    }

    private function resolveReadToolFromMessage(string $message): ?string
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return null;
        }

        if ($this->looksLikeActionRequest($message)) {
            return null;
        }

        if (
            preg_match('/\b(lead|leads|crm|pipeline)\b/i', $normalized) === 1
            && preg_match('/\b(list|show|get|give|provide|pull|fetch|display|retrieve|view|how many|crm|leads?)\b/i', $normalized) === 1
        ) {
            return 'crm.top_leads';
        }

        if (
            preg_match('/\b(user|users|member|members|staff|workforce|team|agents?)\b/i', $normalized) === 1
            && preg_match('/\b(list|show|get|who|under|organization|organisation|company|members?)\b/i', $normalized) === 1
        ) {
            return 'org.users';
        }

        if (
            preg_match('/\bcompany\s+drive\b/i', $normalized) === 1
            || (
                preg_match('/\b(files?|documents?|drive)\b/i', $normalized) === 1
                && preg_match('/\b(list|show|find|get|open|view|search|browse|display|pull|fetch|what|which|do\s+i|do\s+we|have|summar|according|contents?|read|inside|say|says|explain|describe)\b/i', $normalized) === 1
            )
            || preg_match('/\b(what\s+does|according\s+to|summar(?:y|ize|ise)|contents?\s+of|read\s+the)\b.{0,40}\b(report|document|pdf|sheet|spreadsheet|policy|manual|memo|proposal|contract|invoice)\b/i', $normalized) === 1
        ) {
            return 'drive.files';
        }

        return null;
    }

    private function resolveActionToolFromMessagePrivate(
        string $message,
        ?string $threadId,
        int $companyId,
        int $userId,
    ): ?string {
        $rawNormalized = strtolower(trim($message));
        if (
            preg_match('/\bproject\b/i', $rawNormalized) === 1
            && preg_match('/\b(delete|remove|cancel|archive)\b/i', $rawNormalized) === 1
        ) {
            return null;
        }

        $actionableMessage = $this->buildActionableMessage($message, $threadId, $companyId, $userId);
        $intent = $this->intentClassifier->classify($actionableMessage);
        if (($intent['type'] ?? '') === 'action' && is_string($intent['tool'] ?? null)) {
            return (string) $intent['tool'];
        }

        $normalized = strtolower(trim($actionableMessage));
        if ($normalized === '') {
            return null;
        }

        if (preg_match('/\b(task)\b/i', $normalized) && preg_match('/\b(create|add|new|open|assign|set|give)\b/i', $normalized) === 1) {
            return 'tasks.create';
        }

        if (preg_match('/\btask\b/i', $normalized) && preg_match('/\bfor\b/i', $normalized) === 1) {
            return 'tasks.create';
        }

        if (preg_match('/\bproject\b/i', $normalized) === 1 && preg_match('/\b(delete|remove|cancel|archive)\b/i', $normalized) === 1) {
            return null;
        }

        if (preg_match('/\bmeeting\b/i', $normalized) && preg_match('/\b(create|schedule|book|setup|set\s*up|arrange|plan|with|at|on|for|\d{1,2}\s*(?:am|pm)|reminder)\b/i', $normalized) === 1) {
            return 'meetings.schedule';
        }

        if (preg_match('/\b(task)\b/i', $normalized) && preg_match('/\b(create|add|new|open|assign)\b/i', $normalized) === 1) {
            return 'tasks.create';
        }

        if (preg_match('/\b(project)\b/i', $normalized) && preg_match('/\b(create|start|new|open)\b/i', $normalized) === 1) {
            return 'projects.create';
        }

        if (preg_match('/\b(notification|alert|reminder)\b/i', $normalized) && preg_match('/\b(send|notify|broadcast|remind)\b/i', $normalized) === 1) {
            return 'notifications.send';
        }

        if (preg_match('/\b(remind|notify)\b/i', $normalized) && preg_match('/\b(agents?|team|them|these)\b/i', $normalized) === 1) {
            return 'notifications.send';
        }

        if (preg_match('/\b(lead|crm)\b/i', $normalized) && preg_match('/\b(create|add|new|register|save)\b/i', $normalized) === 1) {
            return 'crm.create_lead';
        }

        if (preg_match('/\b(user|member|staff|agent|supervisor|admin)\b/i', $normalized) === 1
            && preg_match('/\b(create|add|invite|onboard|register|new)\b/i', $normalized) === 1) {
            return 'org.users.create';
        }

        if (preg_match('/\b(email|mail|message)\b/i', $normalized) && preg_match('/\b(send|draft|write|follow[\s-]?up)\b/i', $normalized) === 1) {
            return 'crm.send_email';
        }

        if (preg_match('/\b(send|write|draft)\s+(?:a\s+)?follow[\s-]?up\b/i', $normalized) === 1
            || preg_match('/\bfollow[\s-]?up\s+(?:to|with)\b/i', $normalized) === 1) {
            return 'crm.send_email';
        }

        if (preg_match('/\bkpi\b/i', $normalized) && preg_match('/\b(create|add|new|set|define)\b/i', $normalized) === 1) {
            return 'kpis.create';
        }

        if (
            preg_match('/\b(name|objective|target\s*value|expected\s*outcome|kpi\s*name)\s*:/i', $normalized) === 1
            && preg_match('/\bkpi\b/i', $normalized) === 1
        ) {
            return 'kpis.create';
        }

        if (preg_match('/\b(business\s+name|business\/lead\s+name|lead\s+name|phone\s+number|phone|location)\s*:/i', $normalized) === 1) {
            return 'crm.create_lead';
        }

        if (preg_match('/^\s*confirm\b/i', $normalized) === 1 || $this->isNaturalLanguageConfirmation($message)) {
            $pendingTool = $this->resolvePendingActionToolFromThread($threadId, $companyId, $userId);
            if ($pendingTool === null
                && ! $this->readToolArgsResolver->latestAssistantTurnOffersListExpansion($threadId, $companyId, $userId)
            ) {
                $pendingTool = $this->resolveContextualActionToolFromThread($threadId, $companyId, $userId);
            }
            if ($pendingTool !== null) {
                return $pendingTool;
            }
        }

        return null;
    }

    private function isNaturalLanguageConfirmation(string $message): bool
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return false;
        }

        return preg_match('/^\s*(go\s+ahead|yes|yeah|yep|sure|ok|okay|proceed|do\s+it|create\s+it|please\s+create|please\s+proceed|confirm|approved?)\b/i', $normalized) === 1
            || preg_match('/\b(go\s+ahead|please\s+create|create\s+it\s+now|proceed\s+to\s+create)\b/i', $normalized) === 1;
    }

    private function resolveContextualActionToolFromThread(?string $threadId, int $companyId, int $userId): ?string
    {
        $lines = $this->collectRecentConversationLines($threadId, $companyId, $userId, 16);
        if ($lines === []) {
            return null;
        }

        $blob = strtolower(implode(' ', $lines));

        if (
            preg_match('/\b(task|assign)\b/i', $blob) === 1
            && preg_match('/\b(set|create|assign|visit|due|tomorrow|priority|description|title)\b/i', $blob) === 1
        ) {
            return 'tasks.create';
        }

        if (preg_match('/\bkpi\b/i', $blob) === 1 && preg_match('/\b(create|set|define|target|objective|assign)\b/i', $blob) === 1) {
            return 'kpis.create';
        }

        if (preg_match('/\bmeeting\b/i', $blob) === 1 && preg_match('/\b(schedule|create|book|setup|set\s*up|arrange|attendee|calendar)\b/i', $blob) === 1) {
            return 'meetings.schedule';
        }

        if (preg_match('/\b(lead|crm|business\s+name)\b/i', $blob) === 1 && preg_match('/\b(create|add|register|phone|location)\b/i', $blob) === 1) {
            return 'crm.create_lead';
        }

        if (preg_match('/\b(remind|reminder|notify)\b/i', $blob) === 1 && preg_match('/\b(agents?|team|them|these|overdue)\b/i', $blob) === 1) {
            return 'notifications.send';
        }

        if (preg_match('/\b(user|member|staff|agent|supervisor|admin)\b/i', $blob) === 1 && preg_match('/\b(create|add|invite|onboard)\b/i', $blob) === 1) {
            return 'org.users.create';
        }

        return null;
    }

    private function isTaskConversationFollowUp(string $message, ?string $threadId, int $companyId, int $userId): bool
    {
        $lines = $this->collectRecentConversationLines($threadId, $companyId, $userId, 16);
        $blob = strtolower(implode(' ', [...$lines, $message]));

        if (preg_match('/\b(task|set\s+a\s+task|assign)\b/i', $blob) !== 1) {
            return false;
        }

        return preg_match('/\b(for\s+[a-z]|visit|tomorrow|priority|description|due|title|shoprite|kelvin)\b/i', $blob) === 1;
    }

    /**
     * @return array<int, string>
     */
    private function collectRecentConversationLines(?string $threadId, int $companyId, int $userId, int $limit = 12): array
    {
        if (! is_string($threadId) || trim($threadId) === '') {
            return [];
        }

        $context = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $recentMessages = is_array($context['recent_messages'] ?? null) ? $context['recent_messages'] : [];

        return collect($recentMessages)
            ->take(-$limit)
            ->map(static fn(array $entry): string => trim((string) ($entry['content'] ?? '')))
            ->filter(static fn(string $line): bool => $line !== '')
            ->values()
            ->all();
    }

    private function resolvePendingActionToolFromThread(?string $threadId, int $companyId, int $userId): ?string
    {
        if (! is_string($threadId) || trim($threadId) === '') {
            return null;
        }

        if ($this->readToolArgsResolver->latestAssistantTurnOffersListExpansion($threadId, $companyId, $userId)) {
            return null;
        }

        $thread = $this->conversationMemoryService->getThread($companyId, $userId, $threadId);
        if (! is_array($thread)) {
            return null;
        }

        $messages = is_array($thread['messages'] ?? null) ? $thread['messages'] : [];
        for ($i = count($messages) - 1; $i >= 0; $i--) {
            $msg = $messages[$i] ?? null;
            if (! is_array($msg) || (string) ($msg['role'] ?? '') !== 'assistant') {
                continue;
            }

            $payload = is_array($msg['payload'] ?? null) ? $msg['payload'] : [];
            if (($payload['confirmation_required'] ?? false) === true && is_string($payload['tool'] ?? null)) {
                return (string) $payload['tool'];
            }

            // Latest assistant turn is not an action confirmation — do not dig for older ones.
            return null;
        }

        return null;
    }

    private function buildActionableMessage(
        string $message,
        ?string $threadId,
        int $companyId,
        int $userId,
        ?string $resolvedTool = null,
    ): string {
        // Email drafts must stay grounded in the current ask — do not prepend meeting/task history.
        if ($resolvedTool === 'crm.send_email'
            || preg_match('/\b(send|write|draft|compose|generate)\b.{0,40}\b(email|mail|message|follow[\s-]?up)\b/i', $message) === 1
            || preg_match('/\b(email|mail)\s+(to|for)\b/i', $message) === 1
        ) {
            return trim($message);
        }

        $promptContext = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $recentMessages = is_array($promptContext['recent_messages'] ?? null) ? $promptContext['recent_messages'] : [];
        $userLines = collect($recentMessages)
            ->filter(static fn(array $entry): bool => (string) ($entry['role'] ?? '') === 'user')
            ->map(static fn(array $entry): string => trim((string) ($entry['content'] ?? '')))
            ->filter(static fn(string $line): bool => $line !== '')
            ->values()
            ->all();

        if ($userLines === []) {
            return trim($message);
        }

        $normalized = strtolower(trim($message));

        // Conversational corrections patch the pending draft; do not concatenate prior task text.
        if ($this->taskInferenceService->looksLikeCorrection($message)) {
            return trim($message);
        }

        $isFollowUp = preg_match('/\b(setup|set\s*up|schedule|use\s+this|here\s+are|the\s+details|confirm|proceed|using\s+this|go\s+ahead|tomorrow|priority|description|medium|high|low)\b/i', $normalized) === 1
            || preg_match('/^\s*meeting\s+(is\s+)?(at|on|for)\b/i', $normalized) === 1
            || (str_contains($normalized, 'meeting') && preg_match('/\b\d{1,2}\s*(?:am|pm)\b/i', $normalized) === 1);

        $meetingContext = collect($userLines)
            ->filter(static fn(string $line): bool => preg_match('/\bmeeting\b/i', $line) === 1)
            ->implode(' ');

        $leadContext = collect($userLines)
            ->filter(static fn(string $line): bool => preg_match('/\b(lead|business\s+name|phone\s+number|location|crm)\b/i', $line) === 1)
            ->implode(' ');

        $taskContext = collect($userLines)
            ->filter(static fn(string $line): bool => preg_match('/\b(task|assign|visit|due|priority|tomorrow|title|description|overdue)\b/i', $line) === 1)
            ->implode(' ');

        $reminderContext = collect($userLines)
            ->filter(static fn(string $line): bool => preg_match('/\b(overdue|assigned|agents?|tasks?)\b/i', $line) === 1)
            ->implode(' ');

        $hasReminderIntent = preg_match('/\b(remind|reminder|notify)\b/i', $message) === 1
            && preg_match('/\b(agents?|them|these|team)\b/i', $message) === 1;

        $hasLeadDetails = preg_match('/\b(business\s+name|business\/lead\s+name|lead\s+name|phone\s+number|phone|location)\s*:/i', $message) === 1;
        $hasTaskIntent = preg_match('/\b(create|add|new)\s+(a\s+)?task\b/i', $message) === 1
            || preg_match('/\b(set\s+a\s+task|assign\s+a\s+task)\b/i', $message) === 1;

        if ($hasLeadDetails) {
            $leadLines = collect($userLines)
                ->filter(static fn(string $line): bool => preg_match('/\b(lead|business\s+name|phone|location|crm)\b/i', $line) === 1 || preg_match('/\b(business\s+name|phone|location)\s*:/i', $line) === 1)
                ->push($message)
                ->unique()
                ->implode(' ');

            return trim($leadLines);
        }

        if ($hasTaskIntent) {
            return trim($message);
        }

        if ($hasReminderIntent && $reminderContext !== '') {
            return trim($reminderContext . ' ' . $message);
        }

        if ($isFollowUp && $meetingContext !== '') {
            return trim($meetingContext . ' ' . $message);
        }

        if ($isFollowUp && $leadContext !== '') {
            return trim($leadContext . ' ' . $message);
        }

        if ($isFollowUp && $taskContext !== '') {
            return trim($taskContext . ' ' . $message);
        }

        return trim($message);
    }
}
