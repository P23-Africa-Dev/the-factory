<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Str;

class TaskReassignInferenceService
{
    /**
     * @param  array<string, string>  $entities
     * @return array<string, mixed>
     */
    public function infer(string $message, int $companyId, array $entities = []): array
    {
        $taskId = $this->resolveTaskId($message, $companyId, $entities);
        $toUserId = $this->resolveToUserId($message, $companyId, $entities);
        $reason = $this->extractLabeledValue($message, ['reason', 'because', 'note'])
            ?? (preg_match('/\bbecause\s+(.+)$/i', $message, $m) === 1 ? trim((string) $m[1]) : null);

        return [
            'task_id' => $taskId,
            'to_user_id' => $toUserId,
            'reason' => is_string($reason) ? Str::limit(trim($reason), 2000, '') : null,
            '__inference' => [
                'task_unresolved' => $taskId === null,
                'assignee_unresolved' => $toUserId === null,
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

        if (isset($normalized['task_id']) && is_numeric($normalized['task_id'])) {
            $taskId = (int) $normalized['task_id'];
            $exists = Task::query()->where('company_id', $companyId)->where('id', $taskId)->exists();
            $normalized['task_id'] = $exists ? $taskId : null;
        }

        if (is_string($normalized['to_user_id'] ?? null) && ! is_numeric($normalized['to_user_id'])) {
            $resolved = $this->resolveUserByNameOrEmail((string) $normalized['to_user_id'], $companyId);
            $normalized['to_user_id'] = $resolved;
        } elseif (isset($normalized['to_user_id']) && is_numeric($normalized['to_user_id'])) {
            $normalized['to_user_id'] = (int) $normalized['to_user_id'];
        }

        if (is_string($normalized['reason'] ?? null)) {
            $normalized['reason'] = Str::limit(trim((string) $normalized['reason']), 2000, '');
        }

        $normalized['__inference'] = [
            'task_unresolved' => ($normalized['task_id'] ?? null) === null,
            'assignee_unresolved' => ($normalized['to_user_id'] ?? null) === null,
        ];

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<int, string>
     */
    public function warningCodes(array $args): array
    {
        $codes = [];
        if (($args['task_id'] ?? null) === null) {
            $codes[] = 'task_unresolved';
        }
        if (($args['to_user_id'] ?? null) === null) {
            $codes[] = 'assignee_unresolved';
        }

        return $codes;
    }

    /**
     * @param  array<string, string>  $entities
     */
    private function resolveTaskId(string $message, int $companyId, array $entities): ?int
    {
        if (isset($entities['task_id']) && is_numeric($entities['task_id'])) {
            $id = (int) $entities['task_id'];

            return Task::query()->where('company_id', $companyId)->where('id', $id)->exists() ? $id : null;
        }

        if (preg_match('/\btask\s*(?:id|#)?\s*(\d+)\b/i', $message, $m) === 1) {
            $id = (int) $m[1];

            return Task::query()->where('company_id', $companyId)->where('id', $id)->exists() ? $id : null;
        }

        return null;
    }

    /**
     * @param  array<string, string>  $entities
     */
    private function resolveToUserId(string $message, int $companyId, array $entities): ?int
    {
        if (isset($entities['agent']) && is_string($entities['agent'])) {
            $resolved = $this->resolveUserByNameOrEmail($entities['agent'], $companyId);
            if ($resolved !== null) {
                return $resolved;
            }
        }

        if (preg_match('/\b(?:reassign|assign)\s+(?:to\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|\S+@\S+)\b/i', $message, $m) === 1) {
            return $this->resolveUserByNameOrEmail(trim((string) $m[1]), $companyId);
        }

        return null;
    }

    private function resolveUserByNameOrEmail(string $token, int $companyId): ?int
    {
        $candidate = trim($token);
        if ($candidate === '') {
            return null;
        }

        $query = User::query()->whereHas('companies', static fn ($q) => $q->where('companies.id', $companyId));

        if (str_contains($candidate, '@')) {
            $id = (clone $query)->where('email', $candidate)->value('id');

            return is_numeric($id) ? (int) $id : null;
        }

        $matches = (clone $query)->where('name', 'like', '%' . $candidate . '%')->limit(2)->pluck('id');

        return $matches->count() === 1 ? (int) $matches->first() : null;
    }

    /**
     * @param  array<int, string>  $labels
     */
    private function extractLabeledValue(string $message, array $labels): ?string
    {
        foreach ($labels as $label) {
            $escaped = preg_quote($label, '/');
            if (preg_match('/\b' . $escaped . '\b\s*:\s*(.+?)(?=\s*(?:[a-z][a-z\s&\/]{1,30}\s*:|\.|;|\n|$))/i', $message, $m) === 1) {
                $value = trim((string) $m[1]);
                if ($value !== '') {
                    return $value;
                }
            }
        }

        return null;
    }
}
