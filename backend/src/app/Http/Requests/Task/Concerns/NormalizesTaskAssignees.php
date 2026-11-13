<?php

declare(strict_types=1);

namespace App\Http\Requests\Task\Concerns;

/**
 * Clients send assignees in several shapes: `assigned_agent_ids` (web),
 * `assignee_ids` or `assigned_to` (PWA), or a single `assigned_agent_id`.
 * Fold them into one `assigned_agent_ids` list so validation and the
 * service see a single field.
 */
trait NormalizesTaskAssignees
{
    /**
     * @return array<string, mixed>
     */
    protected function normalizedAssigneeInput(): array
    {
        if ($this->has('assigned_agent_ids')) {
            return [];
        }

        $candidates = [
            $this->input('assignee_ids'),
            $this->input('assigned_to'),
        ];

        foreach ($candidates as $value) {
            if (is_array($value)) {
                return ['assigned_agent_ids' => array_values($value)];
            }

            if (is_int($value) || (is_string($value) && ctype_digit($value))) {
                return ['assigned_agent_ids' => [(int) $value]];
            }
        }

        if ($this->filled('assigned_agent_id')) {
            return ['assigned_agent_ids' => [(int) $this->input('assigned_agent_id')]];
        }

        return [];
    }
}
