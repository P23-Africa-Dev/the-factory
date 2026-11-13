<?php

declare(strict_types=1);

namespace App\Services\AI;

/**
 * Canonical field catalogs for ELY write actions.
 * Used to keep inference, preview, and editable confirmation forms aligned.
 */
final class ActionFieldCatalog
{
    /**
     * @return array<string, array{editable: array<int, string>, preview: array<int, string>, required: array<int, string>}>
     */
    public static function all(): array
    {
        return [
            'tasks.create' => [
                'editable' => [
                    'title', 'type', 'description', 'due_date', 'assignee', 'location', 'address',
                    'priority', 'required_actions', 'minimum_photos_required', 'visit_verification_required',
                    'latitude', 'longitude',
                ],
                'preview' => ['title', 'type', 'due_date', 'location', 'address', 'assigned_agent_id'],
                'required' => ['title'],
            ],
            'tasks.reassign' => [
                'editable' => ['task_id', 'to_user_id', 'reason'],
                'preview' => ['task_id', 'to_user_id', 'reason'],
                'required' => ['task_id', 'to_user_id'],
            ],
            'meetings.schedule' => [
                'editable' => [
                    'title', 'description', 'location', 'timezone', 'start_at', 'end_at',
                    'attendees', 'reminders',
                ],
                'preview' => ['title', 'description', 'start_at', 'end_at', 'timezone', 'location', 'attendees', 'reminders'],
                'required' => ['title', 'timezone', 'start_at', 'end_at'],
                'preserve_hidden' => ['project_id', 'task_id', 'lead_ids', 'meeting_settings'],
            ],
            'notifications.send' => [
                'editable' => ['user_ids', 'title', 'message', 'category', 'priority', 'delivery_types', 'roles', 'action_url'],
                'preview' => ['recipients', 'title', 'message', 'category', 'priority', 'delivery_types'],
                'required' => ['title', 'message'],
            ],
            'projects.create' => [
                'editable' => [
                    'name', 'description', 'type', 'status', 'priority', 'start_date', 'end_date',
                    'project_manager_user_id', 'assigned_team', 'territory_zone', 'notes',
                ],
                'preview' => ['name', 'type', 'status', 'priority', 'start_date', 'end_date', 'project_manager_user_id'],
                'required' => ['name', 'start_date'],
            ],
            'crm.log_visit' => [
                'editable' => ['lead_id', 'summary', 'outcomes', 'opportunities', 'objections', 'follow_up_actions'],
                'preview' => ['lead_id', 'summary', 'outcomes', 'follow_up_actions'],
                'required' => ['lead_id', 'summary'],
            ],
            'crm.create_lead' => [
                'editable' => [
                    'name', 'phone', 'location', 'email', 'industry', 'contact_person',
                    'status', 'priority', 'next_action', 'notes', 'assigned_to_user_id',
                ],
                'preview' => ['name', 'phone', 'location', 'email', 'industry', 'contact_person', 'status', 'priority'],
                'required' => ['name'],
            ],
            'crm.send_email' => [
                'editable' => ['lead_id', 'to_email', 'subject', 'body_text', 'cc', 'bcc'],
                'preview' => ['lead', 'to', 'subject', 'body_text'],
                'required' => ['lead_id', 'to_email', 'subject', 'body_text'],
            ],
            'kpis.create' => [
                'editable' => [
                    'name', 'category', 'objective', 'target_value', 'expected_outcome',
                    'priority', 'start_date', 'end_date', 'assigned_to_user_id',
                ],
                'preview' => [
                    'name', 'category', 'objective', 'target_value', 'expected_outcome',
                    'priority', 'start_date', 'end_date', 'assigned_to_user_id',
                ],
                'required' => ['name', 'objective', 'target_value', 'expected_outcome'],
            ],
            'org.users.create' => [
                'editable' => [
                    'full_name', 'email', 'role', 'assigned_zone_ids', 'work_days',
                    'salary_type', 'base_salary', 'commission_enabled', 'supervisor_user_id',
                    'phone_number', 'currency_code',
                ],
                'preview' => ['full_name', 'email', 'role', 'assigned_zone_ids', 'supervisor_user_id'],
                'required' => ['full_name', 'email', 'role'],
            ],
        ];
    }

    /**
     * @return array{editable: array<int, string>, preview: array<int, string>, required: array<int, string>}
     */
    public static function forTool(string $tool): array
    {
        return self::all()[$tool] ?? [
            'editable' => [],
            'preview' => [],
            'required' => [],
        ];
    }

    public static function label(string $field): string
    {
        return self::labels()[$field] ?? str_replace('_', ' ', $field);
    }

    /**
     * Required catalog fields that are empty on the confirmation payload.
     *
     * @param  array<string, mixed>  $args
     * @return array<int, string>
     */
    public static function missingRequired(string $tool, array $args): array
    {
        $missing = [];

        foreach (self::forTool($tool)['required'] as $field) {
            if (! self::valuePresent($args[$field] ?? null)) {
                $missing[] = $field;
            }
        }

        return $missing;
    }

    /**
     * @return array<string, string>
     */
    private static function labels(): array
    {
        return [
            'title' => 'Title',
            'type' => 'Type',
            'description' => 'Description',
            'due_date' => 'Due date',
            'location' => 'Location',
            'address' => 'Address',
            'assignee' => 'Assignee',
            'name' => 'Name',
            'phone' => 'Phone',
            'objective' => 'Objective',
            'target_value' => 'Target value',
            'expected_outcome' => 'Expected outcome',
            'start_at' => 'Start',
            'end_at' => 'End',
            'timezone' => 'Timezone',
            'start_date' => 'Start date',
            'full_name' => 'Full name',
            'email' => 'Email',
            'role' => 'Role',
            'lead_id' => 'Lead',
            'summary' => 'Summary',
            'to_email' => 'Recipient email',
            'subject' => 'Subject',
            'body_text' => 'Message',
            'message' => 'Message',
            'task_id' => 'Task',
            'to_user_id' => 'Assignee',
        ];
    }

    private static function valuePresent(mixed $value): bool
    {
        if ($value === null) {
            return false;
        }

        if (is_string($value)) {
            return trim($value) !== '';
        }

        if (is_array($value)) {
            return $value !== [];
        }

        return true;
    }
}
