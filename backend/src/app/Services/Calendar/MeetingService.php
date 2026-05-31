<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Jobs\SendMeetingLifecycleEmailJob;
use App\Models\CompanyCalendarConnection;
use App\Models\Meeting;
use App\Models\MeetingAttendee;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use App\Services\Notification\NotificationService;
use App\Support\AvatarUrlResolver;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * @method array{items: array<int,array<string,mixed>>} listAttendeeCandidates(User $user, ?int $companyId = null)
 */
class MeetingService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly MeetingSyncService $meetingSyncService,
        private readonly MeetingReminderService $meetingReminderService,
        private readonly NotificationService $notificationService,
    ) {}

    public function listForUser(User $user, array $filters): Paginator
    {
        $context = $this->companyContextService->resolve($user, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $this->ensureMeetingAccessRole((string) $context['role']);

        $query = Meeting::query()
            ->with(['attendees', 'creator', 'reminders'])
            ->where('company_id', $companyId)
            ->latest('start_at');

        $this->applyMeetingVisibilityScope($query, $user, (string) $context['role']);

        if (! empty($filters['status'])) {
            $query->where('status', (string) $filters['status']);
        }

        if (! empty($filters['project_id'])) {
            $query->where('project_id', (int) $filters['project_id']);
        }

        if (! empty($filters['task_id'])) {
            $query->where('task_id', (int) $filters['task_id']);
        }

        if (! empty($filters['from'])) {
            $query->where('start_at', '>=', (string) $filters['from']);
        }

        if (! empty($filters['to'])) {
            $query->where('start_at', '<=', (string) $filters['to']);
        }

        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 20)));

        return $query->simplePaginate($perPage)->withQueryString();
    }

    public function create(User $user, array $data): array
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $this->ensureMeetingAccessRole((string) $context['role']);

        $connection = $this->activeConnection($companyId);

        // Block meeting creation until an admin has connected Google Calendar.
        if ($connection === null) {
            throw ValidationException::withMessages([
                'google_calendar' => [
                    'Google Calendar has not been configured for this organization. '
                        . 'Please contact your Account Administrator (Owner or Admin) to complete the Google Calendar setup before creating meetings.',
                ],
            ]);
        }

        $meeting = DB::transaction(function () use ($data, $companyId, $user, $connection): Meeting {
            $meeting = Meeting::create([
                'company_id' => $companyId,
                'created_by_user_id' => $user->id,
                'project_id' => $data['project_id'] ?? null,
                'task_id' => $data['task_id'] ?? null,
                'title' => $data['title'],
                'description' => $data['description'] ?? null,
                'location' => $data['location'] ?? null,
                'timezone' => $data['timezone'],
                'start_at' => $data['start_at'],
                'end_at' => $data['end_at'],
                'status' => 'scheduled',
                'source_page' => $data['source_page'] ?? 'api',
                'meeting_settings' => $data['meeting_settings'] ?? null,
                'sync_status' => 'pending',
            ]);

            $this->syncAttendees(
                meeting: $meeting,
                attendees: $data['attendees'] ?? [],
                organizerEmail: $connection?->organizer_email,
            );

            $this->meetingReminderService->syncForMeeting(
                meeting: $meeting,
                reminders: isset($data['reminders']) && is_array($data['reminders']) ? $data['reminders'] : [],
            );

            return $meeting;
        });

        $this->meetingSyncService->syncMeeting((int) $meeting->id);

        $meeting = $this->loadMeeting($meeting->fresh());
        $this->dispatchLifecycleEmails('created', $meeting, (string) $context['company']->name);
        $this->notifyInternalAttendees($meeting, $companyId, 'created', $user->id);

        return [
            'meeting' => $meeting,
            'integration' => [
                'connected' => true,
                'status' => 'active',
                'requires_owner_action' => false,
            ],
            'warnings' => [],
        ];
    }

    public function findForUser(User $user, Meeting $meeting, ?int $companyId = null): Meeting
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->ensureMeetingAccessRole((string) $context['role']);

        $this->assertMeetingBelongsToCompany($meeting, $resolvedCompanyId);
        $this->assertCanViewMeeting($user, $meeting, (string) $context['role']);

        return $this->loadMeeting($meeting);
    }

    public function update(User $user, Meeting $meeting, array $data): array
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $this->assertCanManageMeeting($user, $meeting, (string) $context['role']);
        $this->assertEditableByActor($user, $meeting, (string) $context['role']);

        $this->assertMeetingBelongsToCompany($meeting, $companyId);
        $connection = $this->activeConnection($companyId);
        $hasActiveIntegration = $connection !== null;

        DB::transaction(function () use ($meeting, $data, $hasActiveIntegration, $connection): void {
            $meeting->update([
                'project_id' => array_key_exists('project_id', $data) ? $data['project_id'] : $meeting->project_id,
                'task_id' => array_key_exists('task_id', $data) ? $data['task_id'] : $meeting->task_id,
                'title' => $data['title'] ?? $meeting->title,
                'description' => array_key_exists('description', $data) ? $data['description'] : $meeting->description,
                'location' => array_key_exists('location', $data) ? $data['location'] : $meeting->location,
                'timezone' => $data['timezone'] ?? $meeting->timezone,
                'start_at' => $data['start_at'] ?? $meeting->start_at,
                'end_at' => $data['end_at'] ?? $meeting->end_at,
                'status' => $data['status'] ?? $meeting->status,
                'meeting_settings' => array_key_exists('meeting_settings', $data) ? $data['meeting_settings'] : $meeting->meeting_settings,
                'sync_status' => $hasActiveIntegration ? 'pending' : 'pending_setup',
                'sync_error_message' => null,
            ]);

            if (array_key_exists('attendees', $data)) {
                $this->syncAttendees(
                    meeting: $meeting,
                    attendees: is_array($data['attendees']) ? $data['attendees'] : [],
                    organizerEmail: $connection?->organizer_email,
                );
            }

            if (array_key_exists('reminders', $data)) {
                $this->meetingReminderService->syncForMeeting(
                    meeting: $meeting,
                    reminders: is_array($data['reminders']) ? $data['reminders'] : [],
                );
            }
        });

        if ($hasActiveIntegration) {
            $this->meetingSyncService->syncMeeting((int) $meeting->id);
        }

        $freshMeeting = $this->loadMeeting($meeting->fresh());
        $this->dispatchLifecycleEmails('updated', $freshMeeting, (string) $context['company']->name);
        $this->notifyInternalAttendees($freshMeeting, $companyId, 'updated', $user->id);

        return [
            'meeting' => $freshMeeting,
            'integration' => [
                'connected' => $hasActiveIntegration,
                'status' => $hasActiveIntegration ? 'active' : 'not_connected',
                'requires_owner_action' => ! $hasActiveIntegration,
            ],
            'warnings' => $hasActiveIntegration
                ? []
                : ['Owner must connect Google Calendar to enable sync.'],
        ];
    }

    public function cancel(User $user, Meeting $meeting, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertCanManageMeeting($user, $meeting, (string) $context['role']);

        $this->assertMeetingBelongsToCompany($meeting, $resolvedCompanyId);
        $connection = $this->activeConnection($resolvedCompanyId);
        $hasActiveIntegration = $connection !== null;

        $meeting->update([
            'status' => 'cancelled',
            'sync_status' => $hasActiveIntegration ? 'pending' : 'pending_setup',
            'sync_error_message' => null,
        ]);

        if ($hasActiveIntegration) {
            $this->meetingSyncService->cancelMeeting((int) $meeting->id);
        }

        $this->meetingReminderService->cancelForMeeting($meeting, 'Meeting cancelled.');

        $freshMeeting = $this->loadMeeting($meeting->fresh());
        $this->dispatchLifecycleEmails('cancelled', $freshMeeting, (string) $context['company']->name);
        $this->notifyInternalAttendees($freshMeeting, $resolvedCompanyId, 'cancelled', $user->id);

        return [
            'meeting' => $freshMeeting,
            'integration' => [
                'connected' => $hasActiveIntegration,
                'status' => $hasActiveIntegration ? 'active' : 'not_connected',
                'requires_owner_action' => ! $hasActiveIntegration,
            ],
            'warnings' => $hasActiveIntegration
                ? []
                : ['Owner must connect Google Calendar to enable sync.'],
        ];
    }

    public function resync(User $user, Meeting $meeting, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertCanManageMeeting($user, $meeting, (string) $context['role']);

        $this->assertMeetingBelongsToCompany($meeting, $resolvedCompanyId);
        $connection = $this->activeConnection($resolvedCompanyId);
        $hasActiveIntegration = $connection !== null;

        $meeting->update([
            'sync_status' => $hasActiveIntegration ? 'pending' : 'pending_setup',
            'sync_error_message' => null,
        ]);

        if ($hasActiveIntegration) {
            $this->meetingSyncService->syncMeeting((int) $meeting->id);
        }

        return [
            'meeting' => $this->loadMeeting($meeting->fresh()),
            'integration' => [
                'connected' => $hasActiveIntegration,
                'status' => $hasActiveIntegration ? 'active' : 'not_connected',
                'requires_owner_action' => ! $hasActiveIntegration,
            ],
            'warnings' => $hasActiveIntegration
                ? []
                : ['Owner must connect Google Calendar to enable sync.'],
        ];
    }

    public function delete(User $user, Meeting $meeting, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        $this->assertMeetingBelongsToCompany($meeting, $resolvedCompanyId);
        $this->assertCanManageMeeting($user, $meeting, $role);

        $connection = $this->activeConnection($resolvedCompanyId);
        if ($connection !== null) {
            $this->meetingSyncService->cancelMeeting((int) $meeting->id);
        }

        $snapshot = $this->loadMeeting($meeting);
        $this->meetingReminderService->deleteForMeeting($meeting);

        if ((string) config('meetings.deletion_mode', 'soft') === 'hard') {
            $meeting->forceDelete();
        } else {
            $meeting->delete();
        }

        $this->dispatchLifecycleEmails('deleted', $snapshot, (string) $context['company']->name);
        $this->notifyInternalAttendees($snapshot, $resolvedCompanyId, 'deleted', $user->id);

        return [
            'meeting' => $snapshot,
            'integration' => [
                'connected' => $connection !== null,
                'status' => $connection !== null ? 'active' : 'not_connected',
                'requires_owner_action' => $connection === null,
            ],
            'warnings' => [],
        ];
    }

    /**
     * @return array{items: array<int,array<string,mixed>>}
     */
    public function listAttendeeCandidates(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $this->ensureMeetingAccessRole((string) $context['role']);

        $company = $context['company'];

        $members = $company->users()
            ->select([
                'users.id',
                'users.name',
                'users.email',
                'users.avatar',
                'users.gender',
                'users.internal_role',
                'users.is_active',
            ])
            ->orderByRaw("CASE company_users.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'supervisor' THEN 2 WHEN 'agent' THEN 3 ELSE 4 END")
            ->orderBy('users.name')
            ->get();

        return [
            'items' => $members->map(static function (User $member): array {
                $companyRole = (string) ($member->pivot?->role ?? 'member');

                return [
                    'id' => $member->id,
                    'name' => $member->name,
                    'email' => $member->email,
                    'avatar_url' => AvatarUrlResolver::resolve($member->avatar, $member->gender),
                    'company_role' => $companyRole,
                    'internal_role' => $member->internal_role,
                    'display_role' => ucfirst(str_replace('_', ' ', $companyRole)),
                    'is_active' => (bool) $member->is_active,
                ];
            })->values()->all(),
        ];
    }

    private function ensureManagementRole(string $role): void
    {
        if (in_array($role, ['owner', 'admin', 'supervisor'], true)) {
            return;
        }

        throw ValidationException::withMessages([
            'authorization' => ['Only owners, admins, and supervisors can manage meetings.'],
        ]);
    }

    private function ensureMeetingAccessRole(string $role): void
    {
        if (in_array($role, ['owner', 'admin', 'supervisor', 'agent'], true)) {
            return;
        }

        throw ValidationException::withMessages([
            'authorization' => ['Only company members can access meetings.'],
        ]);
    }

    private function applyMeetingVisibilityScope($query, User $user, string $role): void
    {
        if (in_array($role, ['owner', 'admin'], true)) {
            return;
        }

        $query->where(function ($innerQuery) use ($user): void {
            $innerQuery->where('created_by_user_id', $user->id)
                ->orWhereHas('attendees', function ($attendeeQuery) use ($user): void {
                    $attendeeQuery
                        ->where('user_id', $user->id)
                        ->orWhere('email', $user->email);
                });
        });
    }

    private function assertCanViewMeeting(User $user, Meeting $meeting, string $role): void
    {
        if (in_array($role, ['owner', 'admin'], true)) {
            return;
        }

        $isCreator = (int) $meeting->created_by_user_id === (int) $user->id;
        $isInvited = $meeting->attendees()
            ->where(function ($query) use ($user): void {
                $query->where('user_id', $user->id)
                    ->orWhere('email', $user->email);
            })
            ->exists();

        if ($isCreator || $isInvited) {
            return;
        }

        throw ValidationException::withMessages([
            'authorization' => ['You can only view meetings you created or were invited to.'],
        ]);
    }

    private function assertCanManageMeeting(User $user, Meeting $meeting, string $role): void
    {
        if (in_array($role, ['owner', 'admin'], true)) {
            return;
        }

        if ((int) $meeting->created_by_user_id === (int) $user->id) {
            return;
        }

        throw ValidationException::withMessages([
            'authorization' => ['Only owners/admins or the meeting creator can manage this meeting.'],
        ]);
    }

    private function assertEditableByActor(User $user, Meeting $meeting, string $role): void
    {
        if (in_array($role, ['owner', 'admin'], true)) {
            return;
        }

        if ((int) $meeting->created_by_user_id === (int) $user->id && $meeting->start_at?->isFuture()) {
            return;
        }

        throw ValidationException::withMessages([
            'authorization' => ['Meeting creators can only edit meetings before the start time.'],
        ]);
    }

    private function activeConnection(int $companyId): ?CompanyCalendarConnection
    {
        return CompanyCalendarConnection::query()
            ->where('company_id', $companyId)
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->first();
    }

    /**
     * @param  array<int,array<string,mixed>>  $attendees
     */
    private function syncAttendees(Meeting $meeting, array $attendees, ?string $organizerEmail): void
    {
        $meeting->attendees()->delete();

        $normalized = collect($attendees)
            ->filter(static fn(mixed $item): bool => is_array($item))
            ->map(static fn(array $attendee): array => [
                'user_id' => isset($attendee['user_id']) ? (int) $attendee['user_id'] : null,
                'email' => strtolower(trim((string) ($attendee['email'] ?? ''))),
                'display_name' => isset($attendee['display_name']) ? (string) $attendee['display_name'] : null,
                'response_status' => 'needs_action',
                'is_optional' => (bool) ($attendee['is_optional'] ?? false),
                'is_organizer' => false,
            ])
            ->filter(static fn(array $attendee): bool => $attendee['email'] !== '')
            ->unique('email')
            ->values();

        if ($organizerEmail !== null && trim($organizerEmail) !== '') {
            $organizerNormalized = strtolower(trim($organizerEmail));

            $alreadyIncluded = $normalized->contains(
                static fn(array $attendee): bool => $attendee['email'] === $organizerNormalized,
            );

            if (! $alreadyIncluded) {
                $normalized->push([
                    'user_id' => null,
                    'email' => $organizerNormalized,
                    'display_name' => null,
                    'response_status' => 'accepted',
                    'is_optional' => false,
                    'is_organizer' => true,
                ]);
            } else {
                $normalized = $normalized->map(static function (array $attendee) use ($organizerNormalized): array {
                    if ($attendee['email'] !== $organizerNormalized) {
                        return $attendee;
                    }

                    $attendee['is_organizer'] = true;
                    $attendee['response_status'] = 'accepted';

                    return $attendee;
                });
            }
        }

        $normalized->each(function (array $attendee) use ($meeting): void {
            MeetingAttendee::create([
                'meeting_id' => $meeting->id,
                'user_id' => $attendee['user_id'],
                'email' => $attendee['email'],
                'display_name' => $attendee['display_name'],
                'response_status' => $attendee['response_status'],
                'is_optional' => (bool) $attendee['is_optional'],
                'is_organizer' => (bool) $attendee['is_organizer'],
            ]);
        });
    }

    private function assertMeetingBelongsToCompany(Meeting $meeting, int $companyId): void
    {
        if ((int) $meeting->company_id === $companyId) {
            return;
        }

        throw ValidationException::withMessages([
            'meeting' => ['Meeting does not belong to the active company context.'],
        ]);
    }

    private function loadMeeting(Meeting $meeting): Meeting
    {
        return $meeting->load(['attendees', 'creator', 'reminders']);
    }

    private function dispatchLifecycleEmails(string $eventType, Meeting $meeting, string $organizationName): void
    {
        $emails = collect($meeting->attendees)
            ->pluck('email')
            ->filter(static fn($email): bool => is_string($email) && trim($email) !== '')
            ->map(static fn($email): string => strtolower(trim((string) $email)))
            ->unique()
            ->values()
            ->all();

        if ($emails === []) {
            return;
        }

        SendMeetingLifecycleEmailJob::dispatch(
            eventType: $eventType,
            organizationName: $organizationName,
            meeting: [
                'id' => $meeting->id,
                'title' => $meeting->title,
                'description' => $meeting->description,
                'timezone' => $meeting->timezone,
                'start_at' => $meeting->start_at?->toIso8601String(),
                'end_at' => $meeting->end_at?->toIso8601String(),
                'google_meet_url' => $meeting->google_meet_url,
                'organizer_name' => $meeting->creator?->name,
                'organizer_email' => $meeting->creator?->email,
            ],
            attendees: $meeting->attendees
                ->map(static fn($attendee): array => [
                    'email' => $attendee->email,
                    'display_name' => $attendee->display_name,
                ])
                ->values()
                ->all(),
            recipientEmails: $emails,
        );
    }

    private function notifyInternalAttendees(Meeting $meeting, int $companyId, string $eventType, int $actorUserId): void
    {
        $recipientUserIds = collect($meeting->attendees)
            ->pluck('user_id')
            ->filter(static fn($id): bool => $id !== null)
            ->map(static fn($id): int => (int) $id)
            ->filter(static fn($id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($recipientUserIds === []) {
            return;
        }

        $title = match ($eventType) {
            'created' => 'Meeting scheduled',
            'updated' => 'Meeting updated',
            'cancelled' => 'Meeting cancelled',
            'deleted' => 'Meeting deleted',
            default => 'Meeting update',
        };

        $message = match ($eventType) {
            'created' => "A meeting titled '{$meeting->title}' has been scheduled.",
            'updated' => "Meeting '{$meeting->title}' has been updated.",
            'cancelled' => "Meeting '{$meeting->title}' has been cancelled.",
            'deleted' => "Meeting '{$meeting->title}' has been deleted.",
            default => "Meeting '{$meeting->title}' has changed.",
        };

        $this->notificationService->notifyUsers($recipientUserIds, [
            'company_id' => $companyId,
            'type' => 'meeting.' . $eventType,
            'category' => NotificationCategory::SYSTEM->value,
            'title' => $title,
            'message' => $message,
            'reference_type' => Meeting::class,
            'reference_id' => (int) $meeting->id,
            'action_url' => '/dashboard',
            'action_route' => 'dashboard',
            'priority' => NotificationPriority::HIGH->value,
            'metadata' => [
                'meeting_id' => (int) $meeting->id,
                'event_type' => $eventType,
                'start_at' => $meeting->start_at?->toIso8601String(),
                'status' => $meeting->status,
            ],
            'created_by_user_id' => $actorUserId,
            'dedupe_key' => 'meeting:' . $eventType . ':' . $meeting->id . ':' . now()->format('YmdHi'),
        ]);
    }
}
