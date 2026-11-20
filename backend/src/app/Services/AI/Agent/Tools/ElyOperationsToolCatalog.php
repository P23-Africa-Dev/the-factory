<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools;

use App\Models\CompanyZone;
use App\Models\Lead;
use App\Services\AI\Agent\Attachments\ChatAttachmentStore;
use App\Models\Meeting;
use App\Models\Task;
use App\Models\TaskReassignment;
use App\Models\TaskSubtask;
use App\Models\User;
use App\Services\AI\Agent\Tools\ElyToolCatalog as S;
use App\Services\Attendance\AttendanceSettingsService;
use App\Services\Calendar\MeetingService;
use App\Services\Crm\LeadService;
use App\Services\Drive\CompanyDriveService;
use App\Services\Internal\CompanyZoneService;
use App\Services\Internal\InternalUserLifecycleService;
use App\Services\Internal\InternalUserOnboardingService;
use App\Services\Payroll\PayrollService;
use App\Services\Task\TaskReassignmentService;
use App\Services\Task\TaskSubtaskService;
use App\Support\CountryCatalog;
use Closure;
use Illuminate\Validation\Rule;

/**
 * Remaining capabilities from plan §3: subtasks, reassignment replies, meeting
 * edits, CRM setup, bulk lead delete, people and zones, payroll, attendance
 * settings and Drive. Each is a thin call into the domain service.
 */
final class ElyOperationsToolCatalog
{
    private const ALL = ['owner', 'admin', 'supervisor', 'agent'];

    private const MANAGERS = ['owner', 'admin', 'supervisor'];

    private const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    public function __construct(
        private readonly ScopedResolver $scoped,
        private readonly TaskSubtaskService $subtasks,
        private readonly TaskReassignmentService $reassignments,
        private readonly MeetingService $meetings,
        private readonly LeadService $leads,
        private readonly InternalUserOnboardingService $onboarding,
        private readonly InternalUserLifecycleService $lifecycle,
        private readonly CompanyZoneService $zones,
        private readonly PayrollService $payroll,
        private readonly AttendanceSettingsService $attendanceSettings,
        private readonly CompanyDriveService $drive,
        private readonly ChatAttachmentStore $attachments,
    ) {}

    private function pipelineId(ToolContext $context, mixed $requested): int
    {
        if (is_numeric($requested) && (int) $requested > 0) {
            return (int) $requested;
        }

        $pipelines = $this->leads->listPipelines($context->user, $context->companyId);

        return (int) ($pipelines->firstWhere('is_default', true)?->id ?? $pipelines->first()?->id ?? 0);
    }

    /**
     * @return array<int, ElyTool>
     */
    public function tools(): array
    {
        return [
            ...$this->taskTools(),
            ...$this->crmTools(),
            ...$this->peopleTools(),
            ...$this->operationsTools(),
        ];
    }

    /**
     * @return array<int, ElyTool>
     */
    private function taskTools(): array
    {
        return [
            $this->tool('tasks.subtasks.add', 'Add a checklist item (subtask) to a task. Only the task creator can add subtasks.',
                S::object(['task_id' => S::int(), 'title' => S::str(), 'assigned_user_id' => S::int(), 'due_at' => S::str('ISO 8601')], ['task_id', 'title']),
                ToolRisk::Safe, self::ALL, 'Adding the subtask', ['task_id' => 'task', 'assigned_user_id' => 'user'],
                ['task_id' => ['required', 'integer'], 'title' => ['required', 'string', 'max:255'], 'assigned_user_id' => ['nullable', 'integer'], 'due_at' => ['nullable', 'date']],
                function (ToolContext $c, array $a): ToolResult {
                    $task = Task::query()->where('company_id', $c->companyId)->findOrFail((int) $a['task_id']);
                    $this->subtasks->add($c->user, $task, [...collect($a)->except('task_id')->all(), 'company_id' => $c->companyId]);

                    return new ToolResult("Subtask '{$a['title']}' added to '{$task->title}'.", ['task_id' => (int) $task->id], ['tasks.subtasks.add']);
                }),
            $this->tool('tasks.subtasks.complete', 'Tick (or untick) a subtask on a task.',
                S::object(['task_id' => S::int(), 'subtask_id' => S::int(), 'completed' => ['type' => 'boolean']], ['task_id', 'subtask_id']),
                ToolRisk::Safe, self::ALL, 'Updating the subtask', ['task_id' => 'task', 'subtask_id' => 'subtask'],
                ['task_id' => ['required', 'integer'], 'subtask_id' => ['required', 'integer'], 'completed' => ['nullable', 'boolean']],
                function (ToolContext $c, array $a): ToolResult {
                    $task = Task::query()->where('company_id', $c->companyId)->findOrFail((int) $a['task_id']);
                    $subtask = TaskSubtask::query()->where('task_id', $task->id)->findOrFail((int) $a['subtask_id']);
                    $done = (bool) ($a['completed'] ?? true);
                    $this->subtasks->setCompleted($c->user, $task, $subtask, $done, $c->companyId);

                    return new ToolResult("Subtask '{$subtask->title}' marked ".($done ? 'done' : 'not done').'.', ['subtask_id' => (int) $subtask->id], ['tasks.subtasks.complete']);
                }),
            $this->tool('tasks.reassignment.respond', 'Accept or reject a task reassignment request sent to the user.',
                S::object(['reassignment_id' => S::int(), 'decision' => S::enum(['accept', 'reject']), 'note' => S::str()], ['reassignment_id', 'decision']),
                ToolRisk::Confirm, self::ALL, 'Preparing your reply', ['reassignment_id' => 'reassignment'],
                ['reassignment_id' => ['required', 'integer'], 'decision' => ['required', Rule::in(['accept', 'reject'])], 'note' => ['nullable', 'string', 'max:1000']],
                function (ToolContext $c, array $a): ToolResult {
                    $request = TaskReassignment::query()->where('company_id', $c->companyId)->findOrFail((int) $a['reassignment_id']);
                    $result = $a['decision'] === 'accept'
                        ? $this->reassignments->accept($c->user, $request, $c->companyId, $a['note'] ?? null)
                        : $this->reassignments->reject($c->user, $request, $c->companyId, $a['note'] ?? null);

                    return new ToolResult('Reassignment request '.($a['decision'] === 'accept' ? 'accepted' : 'rejected').'.', ['reassignment_id' => (int) $result->id, 'status' => $result->status?->value], ['tasks.reassignment.respond']);
                }),
            $this->tool('meetings.update', 'Change a meeting (title, time, location, description). Attendees are notified of changes, so this needs confirmation.',
                S::object(['meeting_id' => S::int(), 'title' => S::str(), 'description' => S::str(), 'location' => S::str(), 'start_at' => S::str('ISO 8601'), 'end_at' => S::str('ISO 8601'), 'timezone' => S::str('IANA timezone')], ['meeting_id']),
                ToolRisk::Confirm, self::ALL, 'Preparing the meeting change', ['meeting_id' => 'meeting'],
                [
                    'meeting_id' => ['required', 'integer'], 'title' => ['sometimes', 'string', 'min:3', 'max:255'], 'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
                    'location' => ['sometimes', 'nullable', 'string', 'max:255'], 'start_at' => ['sometimes', 'date'], 'end_at' => ['sometimes', 'date'], 'timezone' => ['sometimes', 'timezone'],
                ],
                function (ToolContext $c, array $a): ToolResult {
                    $meeting = Meeting::query()->where('company_id', $c->companyId)->findOrFail((int) $a['meeting_id']);
                    $changes = collect($a)->except('meeting_id')->all();
                    $this->meetings->update($c->user, $meeting, [...$changes, 'company_id' => $c->companyId]);

                    return new ToolResult("Meeting '{$meeting->title}' was updated.", ['meeting_id' => (int) $meeting->id, 'changed_fields' => array_keys($changes)], ['meetings.update']);
                }),
        ];
    }

    /**
     * @return array<int, ElyTool>
     */
    private function crmTools(): array
    {
        $payload = static fn (ToolContext $c, array $extra = []): array => [...$extra, 'company_id' => $c->companyId];

        return [
            $this->tool('crm.pipelines.update', 'Rename a CRM pipeline. Managers only.',
                S::object(['pipeline_id' => S::int(), 'name' => S::str()], ['pipeline_id', 'name']),
                ToolRisk::Safe, self::MANAGERS, 'Renaming the pipeline', ['pipeline_id' => 'pipeline'],
                ['pipeline_id' => ['required', 'integer'], 'name' => ['required', 'string', 'max:120']],
                function (ToolContext $c, array $a) use ($payload): ToolResult {
                    $p = $this->leads->updatePipeline($c->user, (int) $a['pipeline_id'], $payload($c, ['name' => $a['name']]));

                    return new ToolResult("Pipeline renamed to '{$p->name}'.", ['pipeline_id' => (int) $p->id], ['crm.pipelines.update']);
                }),
            $this->tool('crm.pipelines.set_default', 'Make a pipeline the company default for new leads. Changes it for everyone, so it needs confirmation.',
                S::object(['pipeline_id' => S::int()], ['pipeline_id']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the change', ['pipeline_id' => 'pipeline'],
                ['pipeline_id' => ['required', 'integer']],
                function (ToolContext $c, array $a) use ($payload): ToolResult {
                    $p = $this->leads->setCompanyDefaultPipeline($c->user, (int) $a['pipeline_id'], $payload($c));

                    return new ToolResult("'{$p->name}' is now the default pipeline.", ['pipeline_id' => (int) $p->id], ['crm.pipelines.set_default']);
                }),
            $this->tool('crm.pipelines.delete', 'Delete a CRM pipeline (not the default one). Needs confirmation.',
                S::object(['pipeline_id' => S::int()], ['pipeline_id']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the deletion', ['pipeline_id' => 'pipeline'],
                ['pipeline_id' => ['required', 'integer']],
                function (ToolContext $c, array $a) use ($payload): ToolResult {
                    $result = $this->leads->deletePipeline($c->user, (int) $a['pipeline_id'], $payload($c));

                    return new ToolResult('Pipeline deleted.', is_array($result) ? $result : [], ['crm.pipelines.delete']);
                }),
            $this->tool('crm.labels.update', 'Rename or recolor a CRM stage, or mark it as the won stage. Managers only.',
                S::object(['label_id' => S::int('Stage id from crm.labels.list'), 'name' => S::str(), 'color' => S::str('#RRGGBB'), 'is_won' => ['type' => 'boolean']], ['label_id']),
                ToolRisk::Safe, self::MANAGERS, 'Updating the stage', ['label_id' => 'label'],
                ['label_id' => ['required', 'integer'], 'name' => ['sometimes', 'string', 'max:100'], 'color' => ['sometimes', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'], 'is_won' => ['sometimes', 'boolean']],
                function (ToolContext $c, array $a) use ($payload): ToolResult {
                    $label = $this->leads->updateLabel($c->user, (int) $a['label_id'], $payload($c, collect($a)->except('label_id')->all()));

                    return new ToolResult("Stage '{$label->name}' was updated.", ['label_id' => (int) $label->id], ['crm.labels.update']);
                }),
            $this->tool('crm.labels.reorder', 'Reorder the CRM stages (board columns). Give every stage id in the new order. Managers only.',
                S::object(['ordered_label_ids' => S::intList('All stage ids, first column first')], ['ordered_label_ids']),
                ToolRisk::Safe, self::MANAGERS, 'Reordering stages', ['ordered_label_ids' => 'label'],
                ['ordered_label_ids' => ['required', 'array', 'min:1'], 'ordered_label_ids.*' => ['integer', 'distinct']],
                function (ToolContext $c, array $a) use ($payload): ToolResult {
                    $this->leads->reorderLabels($c->user, $payload($c, ['ordered_label_ids' => $a['ordered_label_ids']]));

                    return new ToolResult('Stages reordered.', ['ordered_label_ids' => $a['ordered_label_ids']], ['crm.labels.reorder']);
                }),
            $this->tool('crm.labels.delete', 'Delete a CRM stage. Leads in it must be moved first unless force is set. Needs confirmation.',
                S::object(['label_id' => S::int(), 'force' => ['type' => 'boolean']], ['label_id']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the deletion', ['label_id' => 'label'],
                ['label_id' => ['required', 'integer'], 'force' => ['nullable', 'boolean']],
                function (ToolContext $c, array $a) use ($payload): ToolResult {
                    $result = $this->leads->deleteLabel($c->user, (int) $a['label_id'], $payload($c, ['force' => (bool) ($a['force'] ?? false)]));

                    return new ToolResult('Stage deleted.', is_array($result) ? $result : [], ['crm.labels.delete']);
                }),
            new DefinedTool('crm.import_preview', 'Check a CSV file the user attached in the chat before importing it: how many rows are valid, duplicates, errors, and which columns map to lead fields. The attachment id is in the current context.',
                S::object(['attachment_id' => S::str(), 'pipeline_id' => S::int('Omit for the default pipeline')], ['attachment_id']),
                ToolKind::Read, ToolRisk::Safe, self::ALL, 'Checking the file', ['pipeline_id' => 'pipeline'],
                ['attachment_id' => ['required', 'string', 'max:40'], 'pipeline_id' => ['nullable', 'integer']],
                function (ToolContext $c, array $a): ToolResult {
                    $file = $this->attachments->leadRows((string) $a['attachment_id'], $c->companyId, (int) $c->user->id);
                    $preview = $this->leads->previewImportLeads($c->user, [
                        'company_id' => $c->companyId,
                        'pipeline_id' => $this->pipelineId($c, $a['pipeline_id'] ?? null),
                        'rows' => $file['rows'],
                    ]);

                    return new ToolResult(
                        "{$file['name']}: {$preview['valid_count']} of {$preview['total_rows']} row(s) can be imported, {$preview['duplicate_count']} look like existing leads, ".count($preview['error_rows']).' have errors.',
                        [
                            'file' => $file['name'],
                            'column_mapping' => $file['mapped'],
                            'ignored_columns' => $file['unmapped'],
                            'total_rows' => $preview['total_rows'],
                            'valid_count' => $preview['valid_count'],
                            'duplicate_count' => $preview['duplicate_count'],
                            'error_rows' => array_slice($preview['error_rows'], 0, 10),
                            'duplicate_rows' => array_slice($preview['duplicate_rows'], 0, 10),
                        ],
                        ['crm.import_preview'],
                        untrusted: true,
                    );
                }, $this->scoped),
            $this->tool('crm.import_leads', 'Import the leads from a CSV file the user attached in the chat. Run crm.import_preview first and tell the user the counts. duplicate_policy: skip (default) keeps existing leads, update fills them in, create adds duplicates anyway. Needs confirmation.',
                S::object(['attachment_id' => S::str(), 'pipeline_id' => S::int('Omit for the default pipeline'), 'duplicate_policy' => S::enum(['skip', 'update', 'create'])], ['attachment_id']),
                ToolRisk::Confirm, self::ALL, 'Preparing the import', ['pipeline_id' => 'pipeline'],
                ['attachment_id' => ['required', 'string', 'max:40'], 'pipeline_id' => ['nullable', 'integer'], 'duplicate_policy' => ['nullable', Rule::in(['skip', 'update', 'create'])]],
                function (ToolContext $c, array $a): ToolResult {
                    $file = $this->attachments->leadRows((string) $a['attachment_id'], $c->companyId, (int) $c->user->id);
                    $result = $this->leads->importLeads($c->user, [
                        'company_id' => $c->companyId,
                        'pipeline_id' => $this->pipelineId($c, $a['pipeline_id'] ?? null),
                        'rows' => $file['rows'],
                        'duplicate_policy' => (string) ($a['duplicate_policy'] ?? 'skip'),
                    ]);

                    return new ToolResult(
                        "Imported {$result['imported_count']} lead(s) from {$file['name']}"
                            .($result['updated_count'] > 0 ? ", updated {$result['updated_count']}" : '')
                            .($result['skipped_count'] > 0 ? ", skipped {$result['skipped_count']}" : '')
                            .(count($result['failed_rows']) > 0 ? ', '.count($result['failed_rows']).' row(s) failed' : '').'.',
                        [
                            'imported_count' => $result['imported_count'],
                            'updated_count' => $result['updated_count'],
                            'skipped_count' => $result['skipped_count'],
                            'failed_rows' => array_slice($result['failed_rows'], 0, 10),
                        ],
                        ['crm.import_leads'],
                        link: '/crm/leads',
                    );
                }),
            $this->tool('crm.merge_leads', 'Merge a duplicate lead into another: details missing on the kept lead are filled from the duplicate, then the duplicate is deleted. Managers only; needs confirmation.',
                S::object(['keep_lead_id' => S::int('The lead to keep'), 'duplicate_lead_id' => S::int('The lead to merge in and delete')], ['keep_lead_id', 'duplicate_lead_id']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the merge', ['keep_lead_id' => 'lead', 'duplicate_lead_id' => 'lead'],
                ['keep_lead_id' => ['required', 'integer'], 'duplicate_lead_id' => ['required', 'integer', 'different:keep_lead_id']],
                function (ToolContext $c, array $a): ToolResult {
                    $keep = Lead::query()->where('company_id', $c->companyId)->findOrFail((int) $a['keep_lead_id']);
                    $duplicate = Lead::query()->where('company_id', $c->companyId)->findOrFail((int) $a['duplicate_lead_id']);

                    $data = ['company_id' => $c->companyId];
                    foreach (['email', 'phone', 'location', 'company_name', 'company_email', 'website', 'position', 'industry', 'next_action', 'profile_urls'] as $field) {
                        $value = $duplicate->getAttribute($field);
                        if ($value !== null && $value !== '' && $value !== []) {
                            $data[$field] = $value;
                        }
                    }

                    $merge = $this->leads->merge($c->user, $keep, $data);
                    $duplicateName = (string) $duplicate->name;
                    $this->leads->delete($c->user, $duplicate, $c->companyId);

                    $changed = is_array($merge['fields_changed'] ?? null) ? $merge['fields_changed'] : [];

                    return new ToolResult(
                        "Merged '{$duplicateName}' into '{$keep->name}'".($changed !== [] ? ' (filled: '.implode(', ', $changed).')' : '').' and removed the duplicate.',
                        ['lead_id' => (int) $keep->id, 'fields_changed' => $changed],
                        ['crm.merge_leads'],
                        link: '/crm/leads/'.$keep->id,
                    );
                }),
            $this->tool('crm.bulk_delete_leads', 'Delete several CRM leads at once. Managers only; always needs confirmation.',
                S::object(['lead_ids' => S::intList()], ['lead_ids']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the deletion', ['lead_ids' => 'lead'],
                ['lead_ids' => ['required', 'array', 'min:1', 'max:500'], 'lead_ids.*' => ['integer', 'distinct']],
                function (ToolContext $c, array $a): ToolResult {
                    $result = $this->leads->bulkDelete($c->user, $a['lead_ids'], $c->companyId);

                    return new ToolResult(count($a['lead_ids']).' lead(s) deleted.', is_array($result) ? $result : [], ['crm.bulk_delete_leads']);
                }),
        ];
    }

    /**
     * @return array<int, ElyTool>
     */
    private function peopleTools(): array
    {
        $member = fn (ToolContext $c, int $id): User => User::query()->findOrFail($id);
        $userSchema = static fn (array $extra = [], array $required = []): array => S::object(['user_id' => S::int('Team member user id'), ...$extra], ['user_id', ...$required]);

        return [
            $this->tool('org.users.update', 'Change a team member: name, role, phone or zones. Only owners and admins can grant admin or supervisor. Needs confirmation.',
                $userSchema(['full_name' => S::str(), 'role' => S::enum(['admin', 'supervisor', 'agent']), 'phone_number' => S::str('E.164'), 'assigned_zone_ids' => S::intList()]),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the change', ['user_id' => 'user', 'assigned_zone_ids' => 'zone'],
                [
                    'user_id' => ['required', 'integer'], 'full_name' => ['sometimes', 'string', 'min:2', 'max:255'], 'role' => ['sometimes', Rule::in(['admin', 'supervisor', 'agent'])],
                    'phone_number' => ['sometimes', 'nullable', 'regex:/^\+[1-9][0-9]{7,14}$/'], 'assigned_zone_ids' => ['sometimes', 'nullable', 'array', 'max:50'], 'assigned_zone_ids.*' => ['integer'],
                ],
                function (ToolContext $c, array $a) use ($member): ToolResult {
                    $target = $member($c, (int) $a['user_id']);
                    $updated = $this->onboarding->updateByManager($c->user, $target, [...collect($a)->except('user_id')->all(), 'company_id' => $c->companyId]);

                    return new ToolResult("{$updated->name} was updated.", ['user_id' => (int) $updated->id], ['org.users.update']);
                }),
            $this->tool('org.users.suspend', 'Suspend a team member for a number of days, until a date, or permanently. Needs confirmation.',
                $userSchema(['suspend_type' => S::enum(['duration', 'date', 'permanent']), 'suspend_days' => S::int(), 'suspend_until' => S::str('YYYY-MM-DD')], ['suspend_type']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the suspension', ['user_id' => 'user'],
                [
                    'user_id' => ['required', 'integer'], 'suspend_type' => ['required', 'in:duration,date,permanent'],
                    'suspend_days' => ['required_if:suspend_type,duration', 'nullable', 'integer', 'min:1', 'max:365'],
                    'suspend_until' => ['required_if:suspend_type,date', 'nullable', 'date', 'after:today'],
                ],
                function (ToolContext $c, array $a) use ($member): ToolResult {
                    $target = $member($c, (int) $a['user_id']);
                    $this->lifecycle->suspend($c->user, $target, $a, $c->companyId);

                    return new ToolResult("{$target->name} was suspended.", ['user_id' => (int) $target->id], ['org.users.suspend']);
                }),
            $this->tool('org.users.reactivate', 'Lift a suspension on a team member. Needs confirmation.',
                $userSchema(), ToolRisk::Confirm, self::MANAGERS, 'Preparing the reactivation', ['user_id' => 'user'], ['user_id' => ['required', 'integer']],
                function (ToolContext $c, array $a) use ($member): ToolResult {
                    $target = $member($c, (int) $a['user_id']);
                    $this->lifecycle->reactivate($c->user, $target, $c->companyId);

                    return new ToolResult("{$target->name} was reactivated.", ['user_id' => (int) $target->id], ['org.users.reactivate']);
                }),
            $this->tool('org.users.delete', 'Remove a team member from the organization. Cannot be undone; needs confirmation.',
                $userSchema(), ToolRisk::Confirm, self::MANAGERS, 'Preparing the removal', ['user_id' => 'user'], ['user_id' => ['required', 'integer']],
                function (ToolContext $c, array $a) use ($member): ToolResult {
                    $target = $member($c, (int) $a['user_id']);
                    $name = (string) $target->name;
                    $this->lifecycle->delete($c->user, $target, $c->companyId);

                    return new ToolResult("{$name} was removed from the organization.", ['user_id' => (int) $a['user_id']], ['org.users.delete']);
                }),
            $this->tool('org.users.assign_supervisor', 'Put an agent under a supervisor (owners and admins can supervise too). Needs confirmation.',
                $userSchema(['supervisor_user_id' => S::int()], ['supervisor_user_id']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the change', ['user_id' => 'user', 'supervisor_user_id' => 'user'],
                ['user_id' => ['required', 'integer'], 'supervisor_user_id' => ['required', 'integer']],
                function (ToolContext $c, array $a) use ($member): ToolResult {
                    $agent = $member($c, (int) $a['user_id']);
                    $this->onboarding->assignSupervisor($c->user, $agent, (int) $a['supervisor_user_id'], $c->companyId);

                    return new ToolResult("{$agent->name} now reports to the selected supervisor.", ['user_id' => (int) $agent->id], ['org.users.assign_supervisor']);
                }),
            $this->tool('org.users.resend_invite', 'Send a new invitation email to a team member who has not finished setting up their account. Needs confirmation.',
                $userSchema(), ToolRisk::Confirm, self::MANAGERS, 'Preparing the invitation', ['user_id' => 'user'], ['user_id' => ['required', 'integer']],
                function (ToolContext $c, array $a) use ($member): ToolResult {
                    $target = $member($c, (int) $a['user_id']);
                    $this->onboarding->resendInvite($c->user, $target, $c->companyId);

                    return new ToolResult("A new invitation was sent to {$target->name}.", ['user_id' => (int) $target->id], ['org.users.resend_invite']);
                }),
            $this->tool('zones.create', 'Create a territory zone (country, state/region and local area). Managers only.',
                S::object(['country_code' => S::str('ISO 3166 alpha-2, e.g. GB'), 'state_name' => S::str(), 'lga_name' => S::str('Local area / borough'), 'name' => S::str('Optional display name')], ['country_code', 'state_name', 'lga_name']),
                ToolRisk::Safe, self::MANAGERS, 'Creating the zone', [],
                [
                    'country_code' => ['required', 'string', 'size:2', Rule::in(CountryCatalog::codes())], 'state_name' => ['required', 'string', 'min:2', 'max:120'],
                    'lga_name' => ['required', 'string', 'min:2', 'max:120'], 'name' => ['nullable', 'string', 'min:2', 'max:120'],
                ],
                function (ToolContext $c, array $a): ToolResult {
                    $zone = $this->zones->create($c->user, [...$a, 'country_code' => strtoupper((string) $a['country_code']), 'company_id' => $c->companyId]);

                    return new ToolResult("Zone '{$zone->name}' was created.", ['zone_id' => (int) $zone->id], ['zones.create']);
                }),
            $this->tool('zones.delete', 'Delete a territory zone. Needs confirmation.',
                S::object(['zone_id' => S::int()], ['zone_id']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the deletion', ['zone_id' => 'zone'], ['zone_id' => ['required', 'integer']],
                function (ToolContext $c, array $a): ToolResult {
                    $zone = CompanyZone::query()->where('company_id', $c->companyId)->findOrFail((int) $a['zone_id']);
                    $name = (string) $zone->name;
                    $this->zones->delete($c->user, $zone, $c->companyId);

                    return new ToolResult("Zone '{$name}' was deleted.", ['zone_id' => (int) $a['zone_id']], ['zones.delete']);
                }),
        ];
    }

    /**
     * @return array<int, ElyTool>
     */
    private function operationsTools(): array
    {
        return [
            $this->tool('payroll.approve', "Approve (or revoke approval of) an agent's payroll for the period containing a date. Managers only; needs confirmation.",
                S::object(['agent_id' => S::int(), 'action' => S::enum(['approve', 'revoke']), 'date' => S::str('YYYY-MM-DD in the pay period'), 'reason' => S::str()], ['agent_id', 'action']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the payroll approval', ['agent_id' => 'user'],
                ['agent_id' => ['required', 'integer'], 'action' => ['required', Rule::in(['approve', 'revoke'])], 'date' => ['nullable', 'date'], 'reason' => ['nullable', 'string', 'max:1000']],
                function (ToolContext $c, array $a): ToolResult {
                    $result = $this->payroll->approveAgentPayroll($c->user, (int) $a['agent_id'], [
                        'company_id' => $c->companyId,
                        'action' => $a['action'],
                        'date' => $a['date'] ?? now()->toDateString(),
                        'reason' => $a['reason'] ?? null,
                    ]);

                    return new ToolResult('Payroll '.($a['action'] === 'approve' ? 'approved' : 'approval revoked').'.', is_array($result) ? $result : [], ['payroll.approve']);
                }),
            $this->tool('attendance.settings.update', 'Change the company working hours: opening and closing time (HH:MM), working days, clock-in window, auto clock-out and timezone. Affects everyone; needs confirmation.',
                S::object([
                    'opening_time' => S::str('HH:MM'), 'closing_time' => S::str('HH:MM'),
                    'working_days' => ['type' => 'array', 'items' => S::enum(self::WEEKDAYS)],
                    'clockin_window_minutes' => S::int(), 'auto_clockout_enabled' => ['type' => 'boolean'], 'timezone' => S::str('IANA timezone'),
                ], ['opening_time', 'closing_time', 'working_days']),
                ToolRisk::Confirm, ['owner', 'admin'], 'Preparing the settings change', [],
                [
                    'opening_time' => ['required', 'date_format:H:i'], 'closing_time' => ['required', 'date_format:H:i'],
                    'working_days' => ['required', 'array', 'min:1', 'max:7'], 'working_days.*' => [Rule::in(self::WEEKDAYS)],
                    'clockin_window_minutes' => ['nullable', 'integer', 'min:0', 'max:240'], 'auto_clockout_enabled' => ['nullable', 'boolean'], 'timezone' => ['nullable', 'timezone'],
                ],
                function (ToolContext $c, array $a): ToolResult {
                    $this->attendanceSettings->upsert($c->user, [...$a, 'company_id' => $c->companyId]);

                    return new ToolResult("Working hours set to {$a['opening_time']}–{$a['closing_time']}.", $a, ['attendance.settings.update']);
                }),
            $this->tool('drive.share_file', 'Share a Drive file with specific team members, or with everyone. Replaces the current sharing. Needs confirmation.',
                S::object(['file_id' => S::int(), 'user_ids' => S::intList(), 'share_with_all' => ['type' => 'boolean']], ['file_id']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the sharing change', ['file_id' => 'drive_file', 'user_ids' => 'user'],
                ['file_id' => ['required', 'integer'], 'user_ids' => ['nullable', 'array', 'max:500'], 'user_ids.*' => ['integer'], 'share_with_all' => ['nullable', 'boolean']],
                function (ToolContext $c, array $a): ToolResult {
                    $this->drive->syncFileGrants($c->user, (int) $a['file_id'], array_map('intval', $a['user_ids'] ?? []), (bool) ($a['share_with_all'] ?? false), $c->companyId);

                    return new ToolResult('File sharing updated.', ['file_id' => (int) $a['file_id']], ['drive.share_file']);
                }),
            $this->tool('drive.delete_file', 'Delete a file from the company Drive. Needs confirmation.',
                S::object(['file_id' => S::int()], ['file_id']),
                ToolRisk::Confirm, self::MANAGERS, 'Preparing the deletion', ['file_id' => 'drive_file'], ['file_id' => ['required', 'integer']],
                function (ToolContext $c, array $a): ToolResult {
                    $this->drive->deleteFile($c->user, (int) $a['file_id'], $c->companyId);

                    return new ToolResult('File deleted.', ['file_id' => (int) $a['file_id']], ['drive.delete_file']);
                }),
        ];
    }

    /**
     * @param  array<string, mixed>  $schema
     * @param  array<int, string>  $roles
     * @param  array<string, string>  $scoped
     * @param  array<string, mixed>  $rules
     */
    private function tool(string $name, string $description, array $schema, ToolRisk $risk, array $roles, string $label, array $scoped, array $rules, Closure $handler): DefinedTool
    {
        return new DefinedTool($name, $description, $schema, ToolKind::Write, $risk, $roles, $label, $scoped, $rules, $handler, $this->scoped);
    }
}
