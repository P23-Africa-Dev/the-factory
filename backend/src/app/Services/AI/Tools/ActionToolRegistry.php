<?php

declare(strict_types=1);

namespace App\Services\AI\Tools;

use App\Enums\LeadPriority;
use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Enums\ProjectPriority;
use App\Enums\ProjectStatus;
use App\Enums\ProjectType;
use App\Enums\TaskPriority;
use App\Enums\TaskType;
use App\Models\Lead;
use App\Models\Task;
use App\Models\User;
use App\Services\AI\Crm\VisitAssistantService;
use App\Services\Crm\CrmEmailService;
use App\Services\Crm\LeadService;
use App\Services\Calendar\MeetingService;
use App\Services\Kpi\KpiService;
use App\Services\Notification\NotificationService;
use App\Services\Company\CompanyContextService;
use App\Services\Project\ProjectService;
use App\Services\Task\TaskReassignmentService;
use App\Services\Task\TaskService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ActionToolRegistry
{
    public function __construct(
        private readonly TaskService $taskService,
        private readonly TaskReassignmentService $taskReassignmentService,
        private readonly MeetingService $meetingService,
        private readonly NotificationService $notificationService,
        private readonly ProjectService $projectService,
        private readonly VisitAssistantService $visitAssistantService,
        private readonly LeadService $leadService,
        private readonly CrmEmailService $crmEmailService,
        private readonly KpiService $kpiService,
        private readonly CompanyContextService $companyContextService,
    ) {}

    public function execute(string $tool, User $user, int $companyId, array $args = []): array
    {
        return match ($tool) {
            'tasks.create' => $this->createTask($user, $companyId, $args),
            'tasks.reassign' => $this->reassignTask($user, $companyId, $args),
            'meetings.schedule' => $this->scheduleMeeting($user, $companyId, $args),
            'notifications.send' => $this->sendNotification($user, $companyId, $args),
            'projects.create' => $this->createProject($user, $companyId, $args),
            'crm.log_visit' => $this->visitAssistantService->logVisit($user, $companyId, $args),
            'crm.create_lead' => $this->createLead($user, $companyId, $args),
            'crm.send_email' => $this->sendLeadEmail($user, $companyId, $args),
            'kpis.create' => $this->createKpi($user, $companyId, $args),
            default => [
                'tool' => $tool,
                'summary' => 'Unsupported action tool requested.',
                'payload' => [],
                'sources' => [],
            ],
        };
    }

    private function createTask(User $user, int $companyId, array $args): array
    {
        $role = (string) $this->companyContextService->resolve($user, $companyId)['role'];
        $isAgent = $role === 'agent';

        $validated = Validator::make($args, [
            'title' => ['required', 'string', 'min:3', 'max:255'],
            'type' => ['required', 'string', Rule::in(TaskType::values())],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'assigned_agent_id' => $isAgent
                ? ['prohibited']
                : ['nullable', 'integer', 'exists:users,id'],
            'assigned_agent_ids' => ['prohibited'],
            'location' => ['nullable', 'string', 'min:2', 'max:255'],
            'address' => ['nullable', 'string', 'min:5', 'max:1000'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'due_date' => ['required', 'date', 'after:now'],
            'required_actions' => ['nullable', 'array', 'max:20'],
            'required_actions.*' => ['string', 'max:255'],
            'priority' => ['nullable', 'string', Rule::in(TaskPriority::values())],
            'minimum_photos_required' => ['nullable', 'integer', 'min:0', 'max:20'],
            'visit_verification_required' => ['nullable', 'boolean'],
        ])->validate();

        // Agents cannot assign tasks to others; managers/admins may assign,
        // and TaskService will enforce tenant membership for assigned_agent_id.
        if ($isAgent) {
            unset($validated['assigned_agent_id']);
        }
        unset($validated['assigned_agent_ids']);

        $payload = [
            ...$validated,
            'company_id' => $companyId,
        ];

        $task = $isAgent
            ? $this->taskService->createSelf($user, $payload)
            : $this->taskService->create($user, $payload);

        return [
            'tool' => 'tasks.create',
            'summary' => "Task '{$task->title}' was created successfully.",
            'payload' => [
                'task_id' => (int) $task->id,
                'title' => (string) $task->title,
                'status' => $task->status?->value,
                'assigned_agent_id' => $task->assigned_agent_id,
            ],
            'sources' => ['tasks.create'],
        ];
    }

    private function reassignTask(User $user, int $companyId, array $args): array
    {
        $validated = Validator::make($args, [
            'task_id' => ['required', 'integer', 'exists:tasks,id'],
            'to_user_id' => ['required', 'integer', 'exists:users,id'],
            'reason' => ['nullable', 'string', 'min:3', 'max:2000'],
        ])->validate();

        $task = Task::query()->findOrFail((int) $validated['task_id']);

        $reassignment = $this->taskReassignmentService->request(
            user: $user,
            task: $task,
            toUserId: (int) $validated['to_user_id'],
            companyId: $companyId,
            reason: $validated['reason'] ?? null,
        );

        return [
            'tool' => 'tasks.reassign',
            'summary' => 'Task reassignment request was created successfully.',
            'payload' => [
                'reassignment_id' => (int) $reassignment->id,
                'task_id' => (int) $reassignment->task_id,
                'to_user_id' => (int) $reassignment->to_user_id,
                'status' => $reassignment->status?->value,
            ],
            'sources' => ['tasks.reassign'],
        ];
    }

    private function scheduleMeeting(User $user, int $companyId, array $args): array
    {
        $validated = Validator::make($args, [
            'title' => ['required', 'string', 'min:3', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'location' => ['nullable', 'string', 'max:255'],
            'timezone' => ['required', 'string', 'max:64', 'timezone'],
            'start_at' => ['required', 'date'],
            'end_at' => ['required', 'date', 'after:start_at'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'task_id' => ['nullable', 'integer', 'exists:tasks,id'],
            'meeting_settings' => ['nullable', 'array'],
            'reminders' => ['nullable', 'array', 'max:20'],
            'reminders.*.offset_minutes' => ['nullable', 'integer', 'min:1'],
            'reminders.*.remind_at' => ['nullable', 'date'],
            'attendees' => ['nullable', 'array', 'max:100'],
            'attendees.*.email' => ['required', 'email', 'max:255'],
            'attendees.*.display_name' => ['nullable', 'string', 'max:255'],
            'attendees.*.user_id' => ['nullable', 'integer', 'exists:users,id'],
            'attendees.*.is_optional' => ['nullable', 'boolean'],
            'lead_ids' => ['nullable', 'array', 'max:50'],
            'lead_ids.*' => ['integer', 'distinct', 'exists:leads,id'],
        ])->validate();

        $result = $this->meetingService->create($user, [
            ...$validated,
            'company_id' => $companyId,
            'source_page' => 'api',
        ]);

        /** @var \App\Models\Meeting $meeting */
        $meeting = $result['meeting'];

        return [
            'tool' => 'meetings.schedule',
            'summary' => "ELY scheduled meeting '{$meeting->title}' successfully.",
            'payload' => [
                'meeting_id' => (int) $meeting->id,
                'title' => (string) $meeting->title,
                'start_at' => $meeting->start_at?->toIso8601String(),
                'end_at' => $meeting->end_at?->toIso8601String(),
                'integration' => $result['integration'] ?? null,
            ],
            'sources' => ['meetings.schedule'],
        ];
    }

    private function sendNotification(User $user, int $companyId, array $args): array
    {
        $validated = Validator::make($args, [
            'title' => ['required', 'string', 'min:3', 'max:255'],
            'message' => ['required', 'string', 'min:3', 'max:4000'],
            'type' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', Rule::in(NotificationCategory::values())],
            'priority' => ['nullable', 'string', Rule::in(NotificationPriority::values())],
            'user_ids' => ['nullable', 'array', 'min:1', 'max:200'],
            'user_ids.*' => ['integer', 'distinct', 'exists:users,id'],
            'roles' => ['nullable', 'array', 'min:1', 'max:4'],
            'roles.*' => ['string', Rule::in(['owner', 'admin', 'supervisor', 'agent'])],
        ])->validate();

        $hasUsers = ! empty($validated['user_ids']);
        $hasRoles = ! empty($validated['roles']);

        if (! $hasUsers && ! $hasRoles) {
            throw ValidationException::withMessages([
                'user_ids' => ['Provide at least one recipient user_id or role.'],
            ]);
        }

        $payload = [
            'company_id' => $companyId,
            'type' => (string) ($validated['type'] ?? 'copilot.manual'),
            'category' => (string) ($validated['category'] ?? NotificationCategory::SYSTEM->value),
            'title' => (string) $validated['title'],
            'message' => (string) $validated['message'],
            'priority' => (string) ($validated['priority'] ?? NotificationPriority::NORMAL->value),
            'created_by_user_id' => (int) $user->id,
        ];

        if ($hasUsers) {
            $userIds = array_map('intval', $validated['user_ids']);
            $count = DB::table('company_users')
                ->where('company_id', $companyId)
                ->whereIn('user_id', $userIds)
                ->count();

            if ($count !== count($userIds)) {
                throw ValidationException::withMessages([
                    'user_ids' => ['All recipients must belong to the active company context.'],
                ]);
            }

            $created = $this->notificationService->notifyUsers($userIds, $payload);
        } else {
            $created = $this->notificationService->notifyCompanyRoles(
                companyId: $companyId,
                roles: $validated['roles'],
                payload: $payload,
                excludeUserIds: [],
            );
        }

        return [
            'tool' => 'notifications.send',
            'summary' => 'Notifications were sent successfully.',
            'payload' => [
                'count' => $created->count(),
            ],
            'sources' => ['notifications.send'],
        ];
    }

    private function createLead(User $user, int $companyId, array $args): array
    {
        $validated = Validator::make($args, [
            'name' => ['required', 'string', 'min:2', 'max:255'],
            'pipeline_id' => ['required', 'integer', 'exists:lead_pipelines,id'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'location' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'max:120'],
            'status' => ['required', 'string', 'max:120'],
            'priority' => ['required', 'string', Rule::in(LeadPriority::values())],
            'next_action' => ['nullable', 'string', 'max:255'],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'meta' => ['nullable', 'array'],
            'industry' => ['nullable', 'string', 'max:120'],
            'contact_person' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:500'],
        ])->validate();

        $meta = is_array($validated['meta'] ?? null) ? $validated['meta'] : [];
        $noteText = isset($validated['notes']) && is_string($validated['notes'])
            ? trim($validated['notes'])
            : '';
        unset($validated['notes']);

        foreach (['industry', 'contact_person'] as $metaField) {
            if (isset($validated[$metaField]) && is_string($validated[$metaField]) && trim($validated[$metaField]) !== '') {
                $meta[$metaField] = trim($validated[$metaField]);
            }
            unset($validated[$metaField]);
        }
        if ($meta !== []) {
            $validated['meta'] = $meta;
        }

        $lead = $this->leadService->create($user, [
            ...$validated,
            'company_id' => $companyId,
        ]);

        if ($noteText !== '') {
            $this->leadService->addNote($user, $lead, $noteText, $companyId);
        }

        return [
            'tool' => 'crm.create_lead',
            'summary' => "CRM lead '{$lead->name}' was created successfully.",
            'payload' => [
                'lead_id' => (int) $lead->id,
                'name' => (string) $lead->name,
                'phone' => $lead->phone,
                'location' => $lead->location,
                'status' => (string) $lead->status,
                'priority' => $lead->priority?->value,
            ],
            'sources' => ['crm.create_lead'],
        ];
    }

    private function sendLeadEmail(User $user, int $companyId, array $args): array
    {
        $validated = Validator::make($args, [
            'lead_id' => ['required', 'integer', 'exists:leads,id'],
            'to' => ['required', 'array', 'min:1'],
            'to.*.email' => ['required', 'email', 'max:255'],
            'cc' => ['sometimes', 'array'],
            'bcc' => ['sometimes', 'array'],
            'subject' => ['required', 'string', 'max:255'],
            'body_text' => ['required', 'string', 'min:10', 'max:50000'],
            'body_html' => ['nullable', 'string', 'max:50000'],
            'attachment_ids' => ['sometimes', 'array'],
        ])->validate();

        $lead = Lead::query()->where('company_id', $companyId)->findOrFail((int) $validated['lead_id']);
        $message = $this->crmEmailService->queueSend($user, $lead, [
            ...$validated,
            'company_id' => $companyId,
        ]);

        return [
            'tool' => 'crm.send_email',
            'summary' => "Email to lead '{$lead->name}' was queued for sending.",
            'payload' => [
                'message_id' => (int) $message->id,
                'lead_id' => (int) $lead->id,
                'subject' => (string) $message->subject,
                'status' => $message->status?->value,
            ],
            'sources' => ['crm.send_email'],
        ];
    }

    private function createKpi(User $user, int $companyId, array $args): array
    {
        $validated = Validator::make($args, [
            'name' => ['required', 'string', 'min:3', 'max:255'],
            'category' => ['required', 'string', Rule::in(KpiCategory::values())],
            'objective' => ['required', 'string', 'min:10', 'max:5000'],
            'target_value' => ['required', 'string', 'max:255'],
            'expected_outcome' => ['required', 'string', 'min:10', 'max:5000'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'priority' => ['required', 'string', Rule::in(KpiPriority::values())],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ])->validate();

        $kpi = $this->kpiService->create($user, [
            ...$validated,
            'company_id' => $companyId,
        ]);

        return [
            'tool' => 'kpis.create',
            'summary' => "KPI '{$kpi->name}' was created successfully.",
            'payload' => [
                'kpi_id' => (int) $kpi->id,
                'name' => (string) $kpi->name,
                'category' => $kpi->category?->value,
                'priority' => $kpi->priority?->value,
                'assigned_to_user_id' => $kpi->assigned_to_user_id,
                'status' => $kpi->status?->value,
            ],
            'sources' => ['kpis.create'],
        ];
    }

    private function createProject(User $user, int $companyId, array $args): array
    {
        $validated = Validator::make($args, [
            'name' => ['required', 'string', 'min:3', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'type' => ['nullable', 'string', Rule::in(ProjectType::values())],
            'status' => ['nullable', 'string', Rule::in(ProjectStatus::values())],
            'priority' => ['nullable', 'string', Rule::in(ProjectPriority::values())],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'project_manager_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_team' => ['nullable', 'array', 'max:100'],
            'assigned_team.*' => ['integer', 'distinct', 'exists:users,id'],
            'territory_zone' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ])->validate();

        $project = $this->projectService->create($user, [
            ...$validated,
            'company_id' => $companyId,
            'status' => $validated['status'] ?? ProjectStatus::PLANNING->value,
        ]);

        return [
            'tool' => 'projects.create',
            'summary' => "Project '{$project->name}' was created successfully.",
            'payload' => [
                'project_id' => (int) $project->id,
                'name' => (string) $project->name,
                'status' => $project->status?->value,
            ],
            'sources' => ['projects.create'],
        ];
    }
}
