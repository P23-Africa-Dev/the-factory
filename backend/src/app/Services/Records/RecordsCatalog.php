<?php

declare(strict_types=1);

namespace App\Services\Records;

final class RecordsCatalog
{
    /**
     * @return array<string, array{title: string, description: string, slices: array<string, string>}>
     */
    public static function reports(): array
    {
        return [
            'security-events' => [
                'title' => 'Security events',
                'description' => 'Sign-in, sign-out, and password reset activity written from the day this log started.',
                'slices' => [],
            ],
            'control-actions' => [
                'title' => 'Control actions',
                'description' => 'Changes made by control-dashboard operators, including database manager, support access, account status, billing, and map credits.',
                'slices' => [],
            ],
            'workforce-changes' => [
                'title' => 'Workforce changes',
                'description' => 'Company-side invites, privilege changes, suspensions, and deletions.',
                'slices' => [],
            ],
            'support-access' => [
                'title' => 'Support access',
                'description' => 'When a super admin entered a customer account, the reason, and when that session ended.',
                'slices' => [],
            ],
            'people' => [
                'title' => 'People and companies',
                'description' => 'Accounts created in the selected dates, with membership, role, suspension, and deletion state.',
                'slices' => [],
            ],
            'attendance' => [
                'title' => 'Attendance',
                'description' => 'Clock-in and clock-out records by person and day.',
                'slices' => [],
            ],
            'location' => [
                'title' => 'Location',
                'description' => 'Task journeys and field-day movement still inside the retention window.',
                'slices' => [
                    'task-sessions' => 'Task journeys',
                    'task-points' => 'Task GPS points',
                    'field-sessions' => 'Field-day sessions',
                    'field-points' => 'Field GPS points',
                    'field-stops' => 'Field stops',
                ],
            ],
            'work' => [
                'title' => 'Work',
                'description' => 'Tasks, assignments, reassignments, and proof metadata.',
                'slices' => [
                    'tasks' => 'Tasks',
                    'assignments' => 'Assignments',
                    'reassignments' => 'Reassignments',
                    'proofs' => 'Proof metadata',
                ],
            ],
            'crm' => [
                'title' => 'CRM',
                'description' => 'Lead timeline and email actions. Message bodies stay in CRM and are not copied here.',
                'slices' => [
                    'activities' => 'Lead timeline',
                    'email' => 'Email actions',
                ],
            ],
            'payroll' => [
                'title' => 'Payroll',
                'description' => 'Generated payroll cycles, including who approved or revoked them.',
                'slices' => [],
            ],
            'billing' => [
                'title' => 'Billing and map credits',
                'description' => 'Subscription state and the map-credit ledger.',
                'slices' => [
                    'credits' => 'Map credit ledger',
                    'subscriptions' => 'Subscription state',
                ],
            ],
            'ai-usage' => [
                'title' => 'AI usage',
                'description' => 'Copilot runs with company, person, status, and token totals. Prompt text stays on the AI log detail page.',
                'slices' => [],
            ],
            'disclosures' => [
                'title' => 'Disclosure register',
                'description' => 'Every time a records report was opened or exported, who released it, and who asked for it.',
                'slices' => [],
            ],
        ];
    }

    public static function has(string $report): bool
    {
        return array_key_exists($report, self::reports());
    }

    /**
     * @return array{title: string, description: string, slices: array<string, string>}
     */
    public static function get(string $report): array
    {
        return self::reports()[$report];
    }

    public static function defaultSlice(string $report): ?string
    {
        $slices = self::get($report)['slices'];

        if ($slices === []) {
            return null;
        }

        return (string) array_key_first($slices);
    }

    public static function normalizeSlice(string $report, ?string $slice): ?string
    {
        $slices = self::get($report)['slices'];
        if ($slices === []) {
            return null;
        }

        if ($slice !== null && array_key_exists($slice, $slices)) {
            return $slice;
        }

        return (string) array_key_first($slices);
    }
}
