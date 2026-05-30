<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Jobs\CancelMeetingInGoogleJob;
use App\Jobs\SyncMeetingToGoogleJob;
use App\Models\CompanyCalendarConnection;
use App\Models\Meeting;
use App\Models\MeetingAttendee;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use App\Support\AvatarUrlResolver;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * @method array{items: array<int,array<string,mixed>>} listAttendeeCandidates(User $user, ?int $companyId = null)
 */
class MeetingService
{
    public function __construct(private readonly CompanyContextService $companyContextService) {}

    public function listForUser(User $user, array $filters): Paginator
    {
        $context = $this->companyContextService->resolve($user, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $this->ensureManagementRole((string) $context['role']);

        $query = Meeting::query()
            ->with(['attendees', 'creator'])
            ->where('company_id', $companyId)
            ->latest('start_at');

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
        $this->ensureManagementRole((string) $context['role']);

        $connection = $this->activeConnection($companyId);
        $hasActiveIntegration = $connection !== null;

        $meeting = DB::transaction(function () use ($data, $companyId, $user, $connection, $hasActiveIntegration): Meeting {
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
                'sync_status' => $hasActiveIntegration ? 'pending' : 'pending_setup',
            ]);

            $this->syncAttendees(
                meeting: $meeting,
                attendees: $data['attendees'] ?? [],
                organizerEmail: $connection?->organizer_email,
            );

            return $meeting;
        });

        if ($hasActiveIntegration) {
            SyncMeetingToGoogleJob::dispatch((int) $meeting->id);
        }

        return [
            'meeting' => $this->loadMeeting($meeting),
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

    public function findForUser(User $user, Meeting $meeting, ?int $companyId = null): Meeting
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->ensureManagementRole((string) $context['role']);

        $this->assertMeetingBelongsToCompany($meeting, $resolvedCompanyId);

        return $this->loadMeeting($meeting);
    }

    public function update(User $user, Meeting $meeting, array $data): array
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $this->ensureManagementRole((string) $context['role']);

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
        });

        if ($hasActiveIntegration) {
            SyncMeetingToGoogleJob::dispatch((int) $meeting->id);
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

    public function cancel(User $user, Meeting $meeting, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->ensureManagementRole((string) $context['role']);

        $this->assertMeetingBelongsToCompany($meeting, $resolvedCompanyId);
        $connection = $this->activeConnection($resolvedCompanyId);
        $hasActiveIntegration = $connection !== null;

        $meeting->update([
            'status' => 'cancelled',
            'sync_status' => $hasActiveIntegration ? 'pending' : 'pending_setup',
            'sync_error_message' => null,
        ]);

        if ($hasActiveIntegration) {
            CancelMeetingInGoogleJob::dispatch((int) $meeting->id);
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

    public function resync(User $user, Meeting $meeting, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->ensureManagementRole((string) $context['role']);

        $this->assertMeetingBelongsToCompany($meeting, $resolvedCompanyId);
        $connection = $this->activeConnection($resolvedCompanyId);
        $hasActiveIntegration = $connection !== null;

        $meeting->update([
            'sync_status' => $hasActiveIntegration ? 'pending' : 'pending_setup',
            'sync_error_message' => null,
        ]);

        if ($hasActiveIntegration) {
            SyncMeetingToGoogleJob::dispatch((int) $meeting->id);
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

    /**
     * @return array{items: array<int,array<string,mixed>>}
     */
    public function listAttendeeCandidates(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $this->ensureManagementRole((string) $context['role']);

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
        return $meeting->load(['attendees', 'creator']);
    }
}
