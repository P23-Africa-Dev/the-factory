<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Enums\NotificationCategory;
use App\Enums\NotificationDeliveryType;
use App\Enums\NotificationPriority;
use App\Services\AI\Context\ConversationMemoryService;
use App\Support\UserDisplayNameResolver;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class NotificationInferenceService
{
    public function __construct(
        private readonly ConversationMemoryService $conversationMemoryService,
        private readonly UserDisplayNameResolver $userDisplayNameResolver,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function infer(
        string $message,
        int $companyId,
        int $userId,
        ?string $threadId,
        string $conversationSummary = '',
        string $companyName = 'your organization',
    ): array {
        $context = $this->resolveRecipientsFromThread($threadId, $companyId, $userId);
        $userIds = $context['user_ids'];
        $recipientNames = $context['recipient_names'];
        $overdueItems = $context['overdue_items'];

        $title = 'Overdue task reminder';
        $body = $overdueItems !== []
            ? $this->buildReminderMessage($overdueItems, $companyName)
            : $this->buildGenericReminderMessage($message, $recipientNames, $companyName);

        if ($overdueItems === [] && $this->messageLooksLikeFullConversation($message)) {
            $body = $this->buildGenericReminderMessage(
                $this->extractReminderIntentLine($message),
                $recipientNames,
                $companyName,
            );
        }

        return [
            'title' => $title,
            'message' => Str::limit($body, 4000, ''),
            'type' => $overdueItems !== [] ? 'task.overdue_reminder' : 'copilot.manual',
            'category' => NotificationCategory::TASK->value,
            'priority' => NotificationPriority::HIGH->value,
            'user_ids' => $userIds,
            'recipient_names' => $recipientNames,
            'delivery_types' => [
                NotificationDeliveryType::IN_APP->value,
                NotificationDeliveryType::PUSH->value,
                NotificationDeliveryType::EMAIL->value,
            ],
            '__inference' => [
                'recipients_unresolved' => $userIds === [],
                'message_too_generic' => $this->messageLooksLikeFullConversation($body),
                'from_overdue_context' => $overdueItems !== [],
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

        foreach (['title', 'message', 'type'] as $field) {
            if (is_string($normalized[$field] ?? null)) {
                $normalized[$field] = trim((string) $normalized[$field]);
            }
        }

        if (is_string($normalized['title'] ?? null) && $normalized['title'] !== '') {
            $normalized['title'] = Str::limit((string) $normalized['title'], 255, '');
        }

        if (is_string($normalized['message'] ?? null) && $normalized['message'] !== '') {
            $normalized['message'] = Str::limit((string) $normalized['message'], 4000, '');
        }

        $normalized['user_ids'] = $this->coerceUserIds($normalized['user_ids'] ?? null);

        if (isset($normalized['recipient_names']) && is_array($normalized['recipient_names'])) {
            $normalized['recipient_names'] = array_values(array_filter(
                array_map(static fn (mixed $name): string => trim((string) $name), $normalized['recipient_names']),
                static fn (string $name): bool => $name !== '',
            ));
        }

        if (isset($normalized['delivery_types'])) {
            $normalized['delivery_types'] = $this->coerceDeliveryTypes($normalized['delivery_types']);
        }

        $userIds = $normalized['user_ids'];
        if ($userIds !== []) {
            $count = DB::table('company_users')
                ->where('company_id', $companyId)
                ->whereIn('user_id', $userIds)
                ->count();

            if ($count !== count($userIds)) {
                $normalized['__inference'] = array_merge(
                    is_array($normalized['__inference'] ?? null) ? $normalized['__inference'] : [],
                    ['recipients_unresolved' => true],
                );
            }
        }

        if (($normalized['recipient_names'] ?? []) === [] && $userIds !== []) {
            $nameMap = $this->userDisplayNameResolver->resolveMap($userIds);
            $normalized['recipient_names'] = $this->userDisplayNameResolver->labelsForIds($userIds, $nameMap);
        }

        unset($normalized['recipient_labels']);

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<int, string>
     */
    public function warningCodes(array $args): array
    {
        $inference = is_array($args['__inference'] ?? null) ? $args['__inference'] : [];
        $codes = [];

        $userIds = $this->coerceUserIds($args['user_ids'] ?? null);
        if ($userIds === [] || ($inference['recipients_unresolved'] ?? false) === true) {
            $codes[] = 'recipients_unresolved';
        }

        $message = trim((string) ($args['message'] ?? ''));
        if ($message === '' || strlen($message) < 10 || $this->messageLooksLikeFullConversation($message)) {
            $codes[] = 'message_too_generic';
        }

        return $codes;
    }

    /**
     * @param  array<string, mixed>  $args
     */
    public function buildPreviewSummary(array $args, array $warnings = [], bool $blockingConfirmation = false): string
    {
        $names = is_array($args['recipient_names'] ?? null) ? $args['recipient_names'] : [];
        $recipientLabel = $names !== []
            ? implode(', ', array_map(static fn (mixed $name): string => (string) $name, $names))
            : 'selected recipients';

        $title = (string) ($args['title'] ?? 'Notification');
        $base = sprintf(
            'ELY action ready: notify %s with "%s". Review the details below and click Confirm Action to send the reminder.',
            $recipientLabel,
            $title,
        );

        if ($warnings !== []) {
            $base .= ' Notes: ' . implode(' ', array_map(static fn (string $w): string => '[' . $w . ']', $warnings));
        }

        if ($blockingConfirmation) {
            $base .= ' Confirmation is blocked until recipients and message are corrected.';
        }

        return $base;
    }

    /**
     * @return array{user_ids: array<int, int>, recipient_names: array<int, string>, overdue_items: array<int, array<string, mixed>>}
     */
    public function resolveRecipientsFromThread(?string $threadId, int $companyId, int $userId): array
    {
        if (! is_string($threadId) || trim($threadId) === '') {
            return ['user_ids' => [], 'recipient_names' => [], 'overdue_items' => []];
        }

        $thread = $this->conversationMemoryService->getThread($companyId, $userId, $threadId);
        if (! is_array($thread)) {
            return ['user_ids' => [], 'recipient_names' => [], 'overdue_items' => []];
        }

        $messages = is_array($thread['messages'] ?? null) ? $thread['messages'] : [];
        for ($i = count($messages) - 1; $i >= 0; $i--) {
            $msg = $messages[$i] ?? null;
            if (! is_array($msg) || (string) ($msg['role'] ?? '') !== 'assistant') {
                continue;
            }

            $tool = (string) ($msg['tool'] ?? '');
            $payload = is_array($msg['payload'] ?? null) ? $msg['payload'] : [];
            $innerPayload = is_array($payload['payload'] ?? null) ? $payload['payload'] : $payload;

            if ($tool !== 'tasks.overdue' && ($innerPayload['tool'] ?? null) !== 'tasks.overdue') {
                continue;
            }

            $items = is_array($innerPayload['items'] ?? null) ? $innerPayload['items'] : [];
            if ($items === []) {
                continue;
            }

            return $this->extractRecipientsFromOverdueItems($items);
        }

        return ['user_ids' => [], 'recipient_names' => [], 'overdue_items' => []];
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    public function buildReminderMessage(array $items, string $companyName): string
    {
        $grouped = [];

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $label = trim((string) ($item['assignees_label'] ?? ''));
            if ($label === '' || $label === 'Unassigned') {
                $agentName = trim((string) ($item['assigned_agent_name'] ?? ''));
                $label = $agentName !== '' ? $agentName : 'Unassigned';
            }

            $title = trim((string) ($item['title'] ?? 'Task'));
            if ($label === 'Unassigned') {
                continue;
            }

            $grouped[$label] ??= [];
            $grouped[$label][] = '"' . $title . '"';
        }

        if ($grouped === []) {
            return 'You have overdue tasks that need attention. Please review your assigned tasks in the app.';
        }

        $segments = [];
        foreach ($grouped as $agentName => $titles) {
            $uniqueTitles = array_values(array_unique($titles));
            if (count($uniqueTitles) === 1) {
                $segments[] = sprintf('%s — %s', $agentName, $uniqueTitles[0]);
                continue;
            }

            $last = array_pop($uniqueTitles);
            $segments[] = sprintf('%s — %s and %s', $agentName, implode(', ', $uniqueTitles), $last);
        }

        return sprintf(
            'Reminder from %s: you have overdue tasks assigned — %s. Please complete or update them in the app.',
            $companyName,
            implode('; ', $segments),
        );
    }

    /**
     * @param  array<int, string>  $recipientNames
     */
    private function buildGenericReminderMessage(string $message, array $recipientNames, string $companyName): string
    {
        $intent = trim($message);
        if ($intent === '' || $this->messageLooksLikeFullConversation($intent)) {
            $intent = 'Please review your pending assignments.';
        }

        $names = $recipientNames !== [] ? implode(', ', $recipientNames) : 'team member';

        return sprintf(
            'Reminder from %s for %s: %s',
            $companyName,
            $names,
            Str::limit($intent, 500, ''),
        );
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array{user_ids: array<int, int>, recipient_names: array<int, string>, overdue_items: array<int, array<string, mixed>>}
     */
    private function extractRecipientsFromOverdueItems(array $items): array
    {
        $userIds = [];
        $nameByUserId = [];

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $agentId = is_numeric($item['assigned_agent_id'] ?? null) ? (int) $item['assigned_agent_id'] : 0;
            if ($agentId > 0) {
                $userIds[] = $agentId;
                $agentName = trim((string) ($item['assigned_agent_name'] ?? ''));
                if ($agentName !== '') {
                    $nameByUserId[$agentId] = $agentName;
                }
            }
        }

        $userIds = array_values(array_unique(array_filter($userIds, static fn (int $id): bool => $id > 0)));
        $missingIds = array_values(array_diff($userIds, array_keys($nameByUserId)));
        if ($missingIds !== []) {
            $nameMap = $this->userDisplayNameResolver->resolveMap($missingIds);
            foreach ($missingIds as $id) {
                $nameByUserId[$id] = $this->userDisplayNameResolver->label($id, $nameMap);
            }
        }

        $recipientNames = array_values(array_filter(
            array_map(static fn (int $id): string => (string) ($nameByUserId[$id] ?? ''), $userIds),
            static fn (string $name): bool => $name !== '' && $name !== 'Unassigned',
        ));

        return [
            'user_ids' => $userIds,
            'recipient_names' => $recipientNames,
            'overdue_items' => $items,
        ];
    }

    /**
     * @return array<int, int>
     */
    public function coerceUserIds(mixed $value): array
    {
        if (is_int($value)) {
            return $value > 0 ? [$value] : [];
        }

        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '') {
                return [];
            }

            if (str_starts_with($trimmed, '[')) {
                $decoded = json_decode($trimmed, true);
                if (is_array($decoded)) {
                    return $this->coerceUserIds($decoded);
                }
            }

            return collect(preg_split('/\s*,\s*/', $trimmed) ?: [])
                ->map(static fn (string $part): int => (int) $part)
                ->filter(static fn (int $id): bool => $id > 0)
                ->unique()
                ->values()
                ->all();
        }

        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->map(static fn (mixed $id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @return array<int, string>
     */
    private function coerceDeliveryTypes(mixed $value): array
    {
        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '') {
                return [
                    NotificationDeliveryType::IN_APP->value,
                    NotificationDeliveryType::PUSH->value,
                    NotificationDeliveryType::EMAIL->value,
                ];
            }

            if (str_starts_with($trimmed, '[')) {
                $decoded = json_decode($trimmed, true);
                if (is_array($decoded)) {
                    return $this->coerceDeliveryTypes($decoded);
                }
            }

            $value = preg_split('/\s*,\s*/', $trimmed) ?: [];
        }

        if (! is_array($value)) {
            return [
                NotificationDeliveryType::IN_APP->value,
                NotificationDeliveryType::PUSH->value,
                NotificationDeliveryType::EMAIL->value,
            ];
        }

        $allowed = NotificationDeliveryType::values();
        $types = collect($value)
            ->map(static fn (mixed $type): string => strtolower(trim((string) $type)))
            ->filter(static fn (string $type): bool => in_array($type, $allowed, true))
            ->unique()
            ->values()
            ->all();

        return $types !== [] ? $types : [
            NotificationDeliveryType::IN_APP->value,
            NotificationDeliveryType::PUSH->value,
            NotificationDeliveryType::EMAIL->value,
        ];
    }

    private function messageLooksLikeFullConversation(string $message): bool
    {
        $normalized = trim($message);
        if ($normalized === '') {
            return true;
        }

        $lineCount = substr_count($normalized, "\n") + 1;

        return $lineCount >= 3
            || preg_match('/\bwhat do i have pending\b/i', $normalized) === 1
            || preg_match('/\bwhat are the agents assigned\b/i', $normalized) === 1;
    }

    private function extractReminderIntentLine(string $message): string
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($message)) ?: [];
        for ($i = count($lines) - 1; $i >= 0; $i--) {
            $line = trim((string) ($lines[$i] ?? ''));
            if ($line === '') {
                continue;
            }

            if (preg_match('/\b(remind|reminder|notify)\b/i', $line) === 1) {
                return $line;
            }
        }

        return 'Please review your overdue tasks.';
    }
}
