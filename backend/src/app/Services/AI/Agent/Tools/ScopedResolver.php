<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Checks that every record id a tool receives belongs to the acting company.
 * Replaces the global `exists:` rules, which accept ids from any company.
 * Role-level checks (e.g. agents only on their own leads) stay in the services.
 */
final class ScopedResolver
{
    /** kind => table with a company_id column */
    private const TABLES = [
        'lead' => 'leads',
        'task' => 'tasks',
        'project' => 'projects',
        'kpi' => 'kpis',
        'pipeline' => 'lead_pipelines',
        'meeting' => 'meetings',
        'zone' => 'company_zones',
        'subtask' => 'task_subtasks',
        'reassignment' => 'task_reassignments',
        'drive_file' => 'drive_files',
        'label' => 'lead_labels',
    ];

    private const LABELS = [
        'lead' => 'lead',
        'task' => 'task',
        'project' => 'project',
        'kpi' => 'KPI',
        'pipeline' => 'pipeline',
        'meeting' => 'meeting',
        'zone' => 'zone',
        'subtask' => 'subtask',
        'reassignment' => 'reassignment request',
        'drive_file' => 'file',
        'label' => 'stage',
        'user' => 'team member',
    ];

    /**
     * Validate the id fields in $args.
     *
     * @param  array<string, mixed>  $args
     * @param  array<string, string>  $fieldKinds  e.g. ['lead_id' => 'lead', 'assigned_agent_ids' => 'user']
     */
    public function assertArgs(array $args, array $fieldKinds, int $companyId): void
    {
        foreach ($fieldKinds as $field => $kind) {
            if (! array_key_exists($field, $args) || $args[$field] === null || $args[$field] === '') {
                continue;
            }

            $ids = is_array($args[$field]) ? $args[$field] : [$args[$field]];
            foreach ($ids as $id) {
                if (! is_numeric($id) || ! $this->belongs($kind, (int) $id, $companyId)) {
                    $label = self::LABELS[$kind] ?? $kind;
                    throw ValidationException::withMessages([
                        $field => ["That {$label} was not found in your organization."],
                    ]);
                }
            }
        }
    }

    public function belongs(string $kind, int $id, int $companyId): bool
    {
        if ($id <= 0) {
            return false;
        }

        if ($kind === 'user') {
            return DB::table('company_users')
                ->where('company_id', $companyId)
                ->where('user_id', $id)
                ->exists();
        }

        $table = self::TABLES[$kind] ?? null;
        if ($table === null) {
            return false;
        }

        return DB::table($table)
            ->where('company_id', $companyId)
            ->where('id', $id)
            ->exists();
    }
}
