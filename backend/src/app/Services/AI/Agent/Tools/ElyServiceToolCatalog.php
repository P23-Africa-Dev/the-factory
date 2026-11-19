<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools;

use App\Enums\KpiStatus;
use App\Enums\ProjectPriority;
use App\Enums\ProjectStatus;
use App\Enums\ProjectType;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Kpi;
use App\Models\Lead;
use App\Models\Meeting;
use App\Models\Project;
use App\Models\Task;
use App\Services\AI\Agent\Help\HelpLibrary;
use App\Services\AI\Agent\Tools\ElyToolCatalog as S;
use App\Services\Calendar\MeetingService;
use App\Services\Crm\LeadService;
use App\Services\Kpi\KpiService;
use App\Services\Project\ProjectService;
use App\Services\Task\TaskCommentService;
use App\Services\Task\TaskService;
use Closure;
use Illuminate\Validation\Rule;

/**
 * Capabilities added for the agent engine (plan §3), each a thin call into the
 * existing domain service so the app's own permission checks apply.
 *
 * To add one: append a DefinedTool here (or write an ElyTool class and tag it
 * 'ely.tools'), then add a help article and eval cases.
 */
final class ElyServiceToolCatalog
{
    private const ALL = ['owner', 'admin', 'supervisor', 'agent'];

    private const MANAGERS = ['owner', 'admin', 'supervisor'];

    public function __construct(
        private readonly ScopedResolver $scoped,
        private readonly TaskService $tasks,
        private readonly TaskCommentService $taskComments,
        private readonly KpiService $kpis,
        private readonly ProjectService $projects,
        private readonly MeetingService $meetings,
        private readonly LeadService $leads,
        private readonly HelpLibrary $help,
    ) {}

    /**
     * @return array<int, ElyTool>
     */
    public function tools(): array
    {
        return [
            ...$this->taskTools(),
            ...$this->kpiTools(),
            ...$this->projectAndMeetingTools(),
            ...$this->crmSetupTools(),
            ...$this->helpTools(),
        ];
    }

    /**
     * @return array<int, ElyTool>
     */
    private function helpTools(): array
    {
        return [
            $this->tool(
                name: 'help.search',
                description: 'Search the Factory23 help articles. Use it for any "how do I", "where do I" or "can I" question about using the app, and answer from the results.',
                schema: S::object(['query' => S::str('The question, in English keywords')], ['query']),
                risk: ToolRisk::Safe,
                roles: self::ALL,
                label: 'Searching help',
                scoped: [],
                rules: ['query' => ['required', 'string', 'max:300']],
                kind: ToolKind::Read,
                handler: function (ToolContext $context, array $args): ToolResult {
                    $results = $this->help->search((string) $args['query'], $context->role, (string) ($context->page['path'] ?? ''));

                    return new ToolResult(
                        $results === [] ? 'No help article matched. Say you are not sure and point to the closest area of the app.' : count($results).' help article(s) found.',
                        ['articles' => array_map(static fn (array $r): array => ['slug' => $r['slug'], 'title' => $r['title'], 'content' => $r['snippet']], $results)],
                        ['help.search'],
                    );
                },
            ),
            $this->tool(
                name: 'help.get',
                description: 'Read one full help article by slug (from help.search).',
                schema: S::object(['slug' => S::str()], ['slug']),
                risk: ToolRisk::Safe,
                roles: self::ALL,
                label: 'Reading help',
                scoped: [],
                rules: ['slug' => ['required', 'string', 'max:120']],
                kind: ToolKind::Read,
                handler: function (ToolContext $context, array $args): ToolResult {
                    $article = $this->help->get((string) $args['slug']);
                    if ($article === null || ($article['roles'] !== [] && ! in_array($context->role, $article['roles'], true))) {
                        return new ToolResult('No such help article.', [], ['help.get']);
                    }

                    return new ToolResult($article['title'], ['title' => $article['title'], 'content' => $article['body']], ['help.get']);
                },
            ),
        ];
    }

    /**
     * @return array<int, ElyTool>
     */
    private function taskTools(): array
    {
        return [
            $this->tool(
                name: 'tasks.update',
                description: 'Change fields on an existing task (title, description, due date, priority, location, assignees). Send only the fields that change. Find the task id with tasks.list. Agents can only edit tasks assigned to them and cannot reassign them.',
                schema: S::object([
                    'task_id' => S::int(),
                    'title' => S::str(),
                    'description' => S::str(),
                    'type' => S::enum(TaskType::values()),
                    'priority' => S::enum(TaskPriority::values()),
                    'due_date' => S::str('ISO 8601'),
                    'location' => S::str(),
                    'address' => S::str(),
                    'assigned_agent_ids' => S::intList('Replace assignees (managers only)'),
                ], ['task_id']),
                risk: ToolRisk::Safe,
                roles: self::ALL,
                label: 'Updating the task',
                scoped: ['task_id' => 'task', 'assigned_agent_ids' => 'user'],
                rules: [
                    'task_id' => ['required', 'integer'],
                    'title' => ['sometimes', 'required', 'string', 'max:255'],
                    'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
                    'type' => ['sometimes', 'nullable', 'string', Rule::in(TaskType::values())],
                    'priority' => ['sometimes', 'nullable', 'string', Rule::in(TaskPriority::values())],
                    'due_date' => ['sometimes', 'nullable', 'date'],
                    'location' => ['sometimes', 'nullable', 'string', 'max:255'],
                    'address' => ['sometimes', 'nullable', 'string', 'max:1000'],
                    'assigned_agent_ids' => ['sometimes', 'array', 'min:1', 'max:20'],
                    'assigned_agent_ids.*' => ['integer', 'distinct'],
                ],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $task = $this->task($context, (int) $args['task_id']);
                    $changes = collect($args)->except('task_id')->all();
                    $updated = $this->tasks->update($context->user, $task, [...$changes, 'company_id' => $context->companyId]);

                    return new ToolResult(
                        "Task '{$updated->title}' was updated (".implode(', ', array_keys($changes)).').',
                        ['task_id' => (int) $updated->id, 'title' => (string) $updated->title, 'status' => $updated->status?->value],
                        ['tasks.update'],
                    );
                },
            ),
            $this->tool(
                name: 'tasks.set_status',
                description: 'Move a task to another status (pending, in_progress, paused, resumed, completed, cancelled). Managers can move any task; agents can only move tasks assigned to them, following the normal flow.',
                schema: S::object(['task_id' => S::int(), 'status' => S::enum(TaskStatus::values())], ['task_id', 'status']),
                risk: ToolRisk::Safe,
                roles: self::ALL,
                label: 'Updating the task status',
                scoped: ['task_id' => 'task'],
                rules: ['task_id' => ['required', 'integer'], 'status' => ['required', 'string', Rule::in(TaskStatus::values())]],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $task = $this->task($context, (int) $args['task_id']);
                    $previous = (string) $task->status?->value;
                    $updated = $context->isManager()
                        ? $this->tasks->updateStatusForManager($context->user, $task, (string) $args['status'], $context->companyId)
                        : $this->tasks->updateStatus($context->user, $task, (string) $args['status'], $context->companyId);

                    $result = new ToolResult(
                        "Task '{$updated->title}' is now ".str_replace('_', ' ', (string) $updated->status?->value).'.',
                        ['task_id' => (int) $updated->id, 'status' => $updated->status?->value],
                        ['tasks.set_status'],
                        link: '/tasks',
                    );

                    // Managers can move a task back to any column; agents follow the flow.
                    return $context->isManager() && $previous !== ''
                        ? $result->withUndo('tasks.set_status', ['task_id' => (int) $updated->id, 'status' => $previous], 'Move it back')
                        : $result;
                },
            ),
            $this->tool(
                name: 'tasks.add_comment',
                description: 'Add a comment to a task (visible to people on the task).',
                schema: S::object(['task_id' => S::int(), 'body' => S::str('Comment text')], ['task_id', 'body']),
                risk: ToolRisk::Safe,
                roles: self::ALL,
                label: 'Adding the comment',
                scoped: ['task_id' => 'task'],
                rules: ['task_id' => ['required', 'integer'], 'body' => ['required', 'string', 'min:1', 'max:5000']],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $task = $this->task($context, (int) $args['task_id']);
                    $this->taskComments->create($context->user, $task, trim((string) $args['body']), $context->companyId);

                    return new ToolResult("Comment added to task '{$task->title}'.", ['task_id' => (int) $task->id], ['tasks.add_comment']);
                },
            ),
            $this->tool(
                name: 'tasks.delete',
                description: 'Delete a task permanently. Always needs the user\'s confirmation.',
                schema: S::object(['task_id' => S::int()], ['task_id']),
                risk: ToolRisk::Confirm,
                roles: self::ALL,
                label: 'Preparing the deletion',
                scoped: ['task_id' => 'task'],
                rules: ['task_id' => ['required', 'integer']],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $task = $this->task($context, (int) $args['task_id']);
                    $title = (string) $task->title;
                    $this->tasks->delete($context->user, $task, $context->companyId);

                    return new ToolResult("Task '{$title}' was deleted.", ['task_id' => (int) $args['task_id']], ['tasks.delete']);
                },
            ),
        ];
    }

    /**
     * @return array<int, ElyTool>
     */
    private function kpiTools(): array
    {
        return [
            $this->tool(
                name: 'kpis.set_status',
                description: 'Move a KPI to another status (pending, in_progress, completed, cancelled). Agents can only move KPIs assigned to them.',
                schema: S::object(['kpi_id' => S::int(), 'status' => S::enum(KpiStatus::values())], ['kpi_id', 'status']),
                risk: ToolRisk::Safe,
                roles: self::ALL,
                label: 'Updating the KPI status',
                scoped: ['kpi_id' => 'kpi'],
                rules: ['kpi_id' => ['required', 'integer'], 'status' => ['required', 'string', Rule::in(KpiStatus::values())]],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $kpi = Kpi::query()->where('company_id', $context->companyId)->findOrFail((int) $args['kpi_id']);
                    $previous = (string) $kpi->status?->value;
                    $updated = $context->isManager()
                        ? $this->kpis->updateStatusForManager($context->user, $kpi, (string) $args['status'], $context->companyId)
                        : $this->kpis->updateStatus($context->user, $kpi, (string) $args['status'], $context->companyId);

                    $result = new ToolResult(
                        "KPI '{$updated->name}' is now ".str_replace('_', ' ', (string) $updated->status?->value).'.',
                        ['kpi_id' => (int) $updated->id, 'status' => $updated->status?->value],
                        ['kpis.set_status'],
                    );

                    return $context->isManager() && $previous !== ''
                        ? $result->withUndo('kpis.set_status', ['kpi_id' => (int) $updated->id, 'status' => $previous], 'Move it back')
                        : $result;
                },
            ),
            $this->tool(
                name: 'kpis.delete',
                description: 'Delete a KPI permanently. Always needs the user\'s confirmation.',
                schema: S::object(['kpi_id' => S::int()], ['kpi_id']),
                risk: ToolRisk::Confirm,
                roles: self::MANAGERS,
                label: 'Preparing the deletion',
                scoped: ['kpi_id' => 'kpi'],
                rules: ['kpi_id' => ['required', 'integer']],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $kpi = Kpi::query()->where('company_id', $context->companyId)->findOrFail((int) $args['kpi_id']);
                    $name = (string) $kpi->name;
                    $this->kpis->delete($context->user, $kpi, $context->companyId);

                    return new ToolResult("KPI '{$name}' was deleted.", ['kpi_id' => (int) $args['kpi_id']], ['kpis.delete']);
                },
            ),
        ];
    }

    /**
     * @return array<int, ElyTool>
     */
    private function projectAndMeetingTools(): array
    {
        return [
            $this->tool(
                name: 'projects.update',
                description: 'Change fields on a project (name, status, priority, dates, manager, team). Managers only. Send only the fields that change.',
                schema: S::object([
                    'project_id' => S::int(),
                    'name' => S::str(),
                    'description' => S::str(),
                    'type' => S::enum(ProjectType::values()),
                    'status' => S::enum(ProjectStatus::values()),
                    'priority' => S::enum(ProjectPriority::values()),
                    'start_date' => S::str('YYYY-MM-DD'),
                    'end_date' => S::str('YYYY-MM-DD'),
                    'project_manager_user_id' => S::int(),
                    'assigned_team' => S::intList('Replaces the team'),
                    'territory_zone' => S::str(),
                ], ['project_id']),
                risk: ToolRisk::Safe,
                roles: self::MANAGERS,
                label: 'Updating the project',
                scoped: ['project_id' => 'project', 'project_manager_user_id' => 'user', 'assigned_team' => 'user'],
                rules: [
                    'project_id' => ['required', 'integer'],
                    'name' => ['sometimes', 'required', 'string', 'min:3', 'max:255'],
                    'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
                    'type' => ['sometimes', 'nullable', 'string', Rule::in(ProjectType::values())],
                    'status' => ['sometimes', 'required', 'string', Rule::in(ProjectStatus::values())],
                    'priority' => ['sometimes', 'nullable', 'string', Rule::in(ProjectPriority::values())],
                    'start_date' => ['sometimes', 'required', 'date'],
                    'end_date' => ['sometimes', 'nullable', 'date'],
                    'project_manager_user_id' => ['sometimes', 'nullable', 'integer'],
                    'assigned_team' => ['sometimes', 'nullable', 'array', 'max:100'],
                    'assigned_team.*' => ['integer', 'distinct'],
                    'territory_zone' => ['sometimes', 'nullable', 'string', 'max:255'],
                ],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $project = Project::query()->where('company_id', $context->companyId)->findOrFail((int) $args['project_id']);
                    $changes = collect($args)->except('project_id')->all();
                    $updated = $this->projects->update($context->user, $project, [...$changes, 'company_id' => $context->companyId]);

                    return new ToolResult(
                        "Project '{$updated->name}' was updated (".implode(', ', array_keys($changes)).').',
                        ['project_id' => (int) $updated->id, 'name' => (string) $updated->name, 'status' => $updated->status?->value],
                        ['projects.update'],
                    );
                },
            ),
            $this->tool(
                name: 'meetings.cancel',
                description: 'Cancel a scheduled meeting. Attendees are notified, so this always needs the user\'s confirmation. Find the meeting id with meetings.today.',
                schema: S::object(['meeting_id' => S::int()], ['meeting_id']),
                risk: ToolRisk::Confirm,
                roles: self::ALL,
                label: 'Preparing the cancellation',
                scoped: ['meeting_id' => 'meeting'],
                rules: ['meeting_id' => ['required', 'integer']],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $meeting = Meeting::query()->where('company_id', $context->companyId)->findOrFail((int) $args['meeting_id']);
                    $this->meetings->cancel($context->user, $meeting, $context->companyId);

                    return new ToolResult("Meeting '{$meeting->title}' was cancelled.", ['meeting_id' => (int) $meeting->id], ['meetings.cancel']);
                },
            ),
        ];
    }

    /**
     * @return array<int, ElyTool>
     */
    private function crmSetupTools(): array
    {
        return [
            $this->tool(
                name: 'crm.pipelines.list',
                description: 'List the CRM pipelines with their ids.',
                schema: S::object([]),
                risk: ToolRisk::Safe,
                roles: self::ALL,
                label: 'Reading pipelines',
                scoped: [],
                rules: [],
                kind: ToolKind::Read,
                handler: function (ToolContext $context): ToolResult {
                    $items = $this->leads->listPipelines($context->user, $context->companyId)
                        ->map(static fn ($p): array => ['id' => (int) $p->id, 'name' => (string) $p->name, 'is_default' => (bool) $p->is_default])
                        ->values()->all();

                    return new ToolResult(count($items).' pipeline(s).', ['items' => $items], ['crm.pipelines.list']);
                },
            ),
            $this->tool(
                name: 'crm.labels.list',
                description: 'List the CRM lead stages/labels with their slugs (use the slug as a lead status).',
                schema: S::object([]),
                risk: ToolRisk::Safe,
                roles: self::ALL,
                label: 'Reading stages',
                scoped: [],
                rules: [],
                kind: ToolKind::Read,
                handler: function (ToolContext $context): ToolResult {
                    $items = $this->leads->listLabels($context->user, $context->companyId)
                        ->map(static fn ($l): array => ['id' => (int) $l->id, 'name' => (string) $l->name, 'slug' => (string) $l->slug, 'is_won' => (bool) ($l->is_won ?? false)])
                        ->values()->all();

                    return new ToolResult(count($items).' stage(s).', ['items' => $items], ['crm.labels.list']);
                },
            ),
            $this->tool(
                name: 'crm.labels.create',
                description: 'Add a new CRM stage (label / board column). Managers only.',
                schema: S::object(['name' => S::str(), 'color' => S::str('Hex color, e.g. #2563EB'), 'is_won' => ['type' => 'boolean', 'description' => 'Marks a won stage']], ['name']),
                risk: ToolRisk::Safe,
                roles: self::MANAGERS,
                label: 'Adding the stage',
                scoped: [],
                rules: [
                    'name' => ['required', 'string', 'max:100'],
                    'color' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
                    'is_won' => ['nullable', 'boolean'],
                ],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $label = $this->leads->createLabel($context->user, [...$args, 'company_id' => $context->companyId]);

                    return (new ToolResult("Stage '{$label->name}' was added.", ['label_id' => (int) $label->id, 'slug' => (string) $label->slug], ['crm.labels.create'], link: '/crm'))
                        ->withUndo('crm.labels.delete', ['label_id' => (int) $label->id], 'Remove this stage');
                },
            ),
            $this->tool(
                name: 'crm.pipelines.create',
                description: 'Create a new CRM pipeline. Managers only.',
                schema: S::object(['name' => S::str()], ['name']),
                risk: ToolRisk::Safe,
                roles: self::MANAGERS,
                label: 'Creating the pipeline',
                scoped: [],
                rules: ['name' => ['required', 'string', 'max:120']],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $pipeline = $this->leads->createPipeline($context->user, [...$args, 'company_id' => $context->companyId]);

                    return (new ToolResult("Pipeline '{$pipeline->name}' was created.", ['pipeline_id' => (int) $pipeline->id], ['crm.pipelines.create'], link: '/crm'))
                        ->withUndo('crm.pipelines.delete', ['pipeline_id' => (int) $pipeline->id], 'Delete this pipeline');
                },
            ),
            $this->tool(
                name: 'crm.delete_lead',
                description: 'Delete a CRM lead permanently. Managers only; always needs the user\'s confirmation.',
                schema: S::object(['lead_id' => S::int()], ['lead_id']),
                risk: ToolRisk::Confirm,
                roles: self::MANAGERS,
                label: 'Preparing the deletion',
                scoped: ['lead_id' => 'lead'],
                rules: ['lead_id' => ['required', 'integer']],
                handler: function (ToolContext $context, array $args): ToolResult {
                    $lead = Lead::query()->where('company_id', $context->companyId)->findOrFail((int) $args['lead_id']);
                    $name = (string) $lead->name;
                    $this->leads->delete($context->user, $lead, $context->companyId);

                    return new ToolResult("Lead '{$name}' was deleted.", ['lead_id' => (int) $args['lead_id']], ['crm.delete_lead']);
                },
            ),
        ];
    }

    private function task(ToolContext $context, int $taskId): Task
    {
        return Task::query()->where('company_id', $context->companyId)->findOrFail($taskId);
    }

    /**
     * @param  array<string, mixed>  $schema
     * @param  array<int, string>  $roles
     * @param  array<string, string>  $scoped
     * @param  array<string, mixed>  $rules
     */
    private function tool(
        string $name,
        string $description,
        array $schema,
        ToolRisk $risk,
        array $roles,
        string $label,
        array $scoped,
        array $rules,
        Closure $handler,
        ToolKind $kind = ToolKind::Write,
    ): DefinedTool {
        return new DefinedTool(
            name: $name,
            description: $description,
            schema: $schema,
            kind: $kind,
            risk: $risk,
            roles: $roles,
            label: $label,
            scoped: $scoped,
            rules: $rules,
            handler: $handler,
            scopedResolver: $this->scoped,
        );
    }
}
