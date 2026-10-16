<?php

declare(strict_types=1);

namespace App\Services\Records;

use App\Models\Admin;
use App\Models\AdminActionLog;
use App\Models\AiLog;
use App\Models\AttendancePayrollSummary;
use App\Models\AttendanceRecord;
use App\Models\Company;
use App\Models\CrmEmailActivityLog;
use App\Models\FieldActivitySession;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Models\InternalUserAuditLog;
use App\Models\LeadActivity;
use App\Models\MapCreditTransaction;
use App\Models\RecordDisclosure;
use App\Models\SecurityAuditEvent;
use App\Models\SupportAccessSession;
use App\Models\Task;
use App\Models\TaskAssignment;
use App\Models\TaskLocationPoint;
use App\Models\TaskProof;
use App\Models\TaskReassignment;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use InvalidArgumentException;

class RecordsReportService
{
    /**
     * @return array{columns: list<string>, rows: LengthAwarePaginator<int, array<string, string>>}
     */
    public function page(string $report, RecordFilters $filters, int $perPage = 50): array
    {
        $variant = $this->variant($report, $filters);
        $query = $this->query($variant, $filters);
        $paginator = $query->paginate($perPage)->withQueryString();
        $paginator->setCollection(
            $paginator->getCollection()->map(fn (Model $model): array => $this->row($variant, $model)),
        );

        return [
            'columns' => $this->headers($variant),
            'rows' => $paginator,
        ];
    }

    public function count(string $report, RecordFilters $filters): int
    {
        return $this->query($this->variant($report, $filters), $filters)->count();
    }

    /**
     * @return list<string>
     */
    public function columns(string $report, RecordFilters $filters): array
    {
        return $this->headers($this->variant($report, $filters));
    }

    /**
     * @return \Generator<int, array<string, string>>
     */
    public function cursor(string $report, RecordFilters $filters): \Generator
    {
        $variant = $this->variant($report, $filters);
        foreach ($this->query($variant, $filters)->lazy(500) as $model) {
            yield $this->row($variant, $model);
        }
    }

    /**
     * @param  resource  $handle
     */
    public function writeCsv($handle, string $report, RecordFilters $filters): void
    {
        $columns = $this->columns($report, $filters);
        fputcsv($handle, $columns);
        foreach ($this->cursor($report, $filters) as $row) {
            $line = [];
            foreach ($columns as $column) {
                $line[] = $row[$column] ?? '';
            }
            fputcsv($handle, $line);
        }
    }

    /**
     * @param  resource  $handle
     * @param  array{user: User, memberships: list<array<string, string>>, sections: list<array{key: string, title: string, columns: list<string>, rows: list<array<string, string>>, total: int}>}  $pack
     */
    public function writePersonCsv($handle, array $pack): void
    {
        $user = $pack['user'];
        fputcsv($handle, ['Identity']);
        fputcsv($handle, ['Name', 'Email', 'Internal role', 'Active', 'Suspended until', 'Deleted at']);
        fputcsv($handle, [
            $this->present($user->name),
            $this->present($user->email),
            $this->present($user->internal_role),
            $user->is_active ? 'yes' : 'no',
            $this->present($user->suspended_until),
            $this->present($user->deleted_at),
        ]);
        fputcsv($handle, []);
        fputcsv($handle, ['Company memberships']);
        fputcsv($handle, ['Company', 'Role', 'Joined at']);
        foreach ($pack['memberships'] as $membership) {
            fputcsv($handle, [
                $membership['Company'] ?? '',
                $membership['Role'] ?? '',
                $membership['Joined at'] ?? '',
            ]);
        }

        foreach ($pack['sections'] as $section) {
            fputcsv($handle, []);
            fputcsv($handle, [$section['title']]);
            fputcsv($handle, $section['columns']);
            foreach ($section['rows'] as $row) {
                $line = [];
                foreach ($section['columns'] as $column) {
                    $line[] = $row[$column] ?? '';
                }
                fputcsv($handle, $line);
            }
        }
    }

    /**
     * @return array{user: User, memberships: list<array<string, string>>, sections: list<array{key: string, title: string, columns: list<string>, rows: list<array<string, string>>, total: int}>}|null
     */
    public function personPack(RecordFilters $filters, bool $limited = true): ?array
    {
        $user = $this->resolvePerson($filters);
        if (! $user instanceof User) {
            return null;
        }

        $scoped = new RecordFilters(
            from: $filters->from,
            to: $filters->to,
            companyId: $filters->companyId,
            person: null,
            slice: null,
            userId: (int) $user->id,
        );

        $sections = [];
        foreach ($this->personSections() as $definition) {
            $sectionFilters = new RecordFilters(
                from: $scoped->from,
                to: $scoped->to,
                companyId: $scoped->companyId,
                person: null,
                slice: $definition['slice'],
                userId: $scoped->userId,
            );
            $sections[] = $this->packSection($definition['report'], $definition['title'], $sectionFilters, $limited);
        }

        return [
            'user' => $user,
            'memberships' => $this->membershipRows($user),
            'sections' => $sections,
        ];
    }

    /**
     * @return list<array{name: string, email: string, id: int}>
     */
    public function personMatches(string $person): array
    {
        $like = $this->like($person);

        return User::query()
            ->withTrashed()
            ->where(function (Builder $query) use ($like): void {
                $query->where('name', 'like', $like)->orWhere('email', 'like', $like);
            })
            ->orderBy('name')
            ->limit(20)
            ->get(['id', 'name', 'email'])
            ->map(fn (User $user): array => [
                'id' => (int) $user->id,
                'name' => (string) $user->name,
                'email' => (string) $user->email,
            ])
            ->all();
    }

    /**
     * @return list<array{report: string, title: string, slice: ?string}>
     */
    private function personSections(): array
    {
        return [
            ['report' => 'security-events', 'title' => 'Security events', 'slice' => null],
            ['report' => 'attendance', 'title' => 'Attendance', 'slice' => null],
            ['report' => 'location', 'title' => 'Task journeys', 'slice' => 'task-sessions'],
            ['report' => 'location', 'title' => 'Field-day sessions', 'slice' => 'field-sessions'],
            ['report' => 'work', 'title' => 'Tasks', 'slice' => 'tasks'],
            ['report' => 'workforce-changes', 'title' => 'Workforce changes', 'slice' => null],
        ];
    }

    /**
     * @return array{key: string, title: string, columns: list<string>, rows: list<array<string, string>>, total: int}
     */
    private function packSection(string $report, string $title, RecordFilters $filters, bool $limited): array
    {
        $variant = $this->variant($report, $filters);
        $query = $this->query($variant, $filters);
        $total = (clone $query)->count();
        $models = $limited ? $query->limit(50)->get() : $query->lazy(500);
        $rows = [];
        foreach ($models as $model) {
            $rows[] = $this->row($variant, $model);
        }

        return [
            'key' => $report,
            'title' => $title,
            'columns' => $this->headers($variant),
            'rows' => $rows,
            'total' => $total,
        ];
    }

    private function resolvePerson(RecordFilters $filters): ?User
    {
        if ($filters->userId !== null) {
            return User::query()->withTrashed()->find($filters->userId);
        }

        if ($filters->person === null) {
            return null;
        }

        $matches = User::query()
            ->withTrashed()
            ->where('email', strtolower($filters->person))
            ->limit(2)
            ->get();

        return $matches->count() === 1 ? $matches->first() : null;
    }

    /**
     * @return list<array<string, string>>
     */
    private function membershipRows(User $user): array
    {
        $user->loadMissing(['companies:id,name']);

        if ($user->companies->isEmpty()) {
            return [[
                'Company' => '',
                'Role' => '',
                'Joined at' => '',
            ]];
        }

        return $user->companies->map(fn (Company $company): array => [
            'Company' => (string) $company->name,
            'Role' => (string) ($company->pivot->role ?? ''),
            'Joined at' => $this->present($company->pivot->joined_at ?? null),
        ])->all();
    }

    private function variant(string $report, RecordFilters $filters): string
    {
        if (! RecordsCatalog::has($report)) {
            throw new InvalidArgumentException('Unknown records report.');
        }

        $slice = RecordsCatalog::normalizeSlice($report, $filters->slice);
        if ($report === 'location' && $filters->userId !== null && ($filters->slice === null || $filters->slice === '')) {
            $slice = 'task-sessions';
        }

        return $slice === null ? $report : $report.'.'.$slice;
    }

    /**
     * @return Builder<Model>
     */
    private function query(string $variant, RecordFilters $filters): Builder
    {
        return match ($variant) {
            'security-events' => $this->securityEvents($filters),
            'control-actions' => $this->controlActions($filters),
            'workforce-changes' => $this->workforceChanges($filters),
            'support-access' => $this->supportAccess($filters),
            'people' => $this->people($filters),
            'attendance' => $this->attendance($filters),
            'location.task-sessions' => $this->taskSessions($filters),
            'location.task-points' => $this->taskPoints($filters),
            'location.field-sessions' => $this->fieldSessions($filters),
            'location.field-points' => $this->fieldPoints($filters),
            'location.field-stops' => $this->fieldStops($filters),
            'work.tasks' => $this->tasks($filters),
            'work.assignments' => $this->assignments($filters),
            'work.reassignments' => $this->reassignments($filters),
            'work.proofs' => $this->proofs($filters),
            'crm.activities' => $this->leadActivities($filters),
            'crm.email' => $this->emailActivity($filters),
            'payroll' => $this->payroll($filters),
            'billing.credits' => $this->mapCredits($filters),
            'billing.subscriptions' => $this->subscriptions($filters),
            'ai-usage' => $this->aiUsage($filters),
            'disclosures' => $this->disclosures($filters),
            default => throw new InvalidArgumentException('Unknown records report.'),
        };
    }

    /**
     * @return list<string>
     */
    private function headers(string $variant): array
    {
        return match ($variant) {
            'security-events' => ['Occurred at', 'Result', 'Action', 'Channel', 'Person', 'Admin', 'Company', 'Email', 'IP address', 'User agent', 'Context'],
            'control-actions' => ['Occurred at', 'Admin', 'Action', 'Target type', 'Target id', 'IP address', 'User agent', 'Context'],
            'workforce-changes' => ['Occurred at', 'Company', 'Action', 'Actor', 'Target', 'Metadata'],
            'support-access' => ['Opened at', 'Admin', 'Target', 'Company', 'Access level', 'Reason', 'Reference', 'Exchanged at', 'Ended at', 'Revoked at', 'Expires at', 'IP address'],
            'people' => ['Created at', 'Name', 'Email', 'Internal role', 'Active', 'Suspended until', 'Deleted at', 'Companies'],
            'attendance' => ['Date', 'Company', 'Person', 'Clock in', 'Clock out', 'Status', 'Work minutes', 'Late', 'Auto clocked out'],
            'location.task-sessions' => ['Started at', 'Ended at', 'Company', 'Started by', 'Completed by', 'Task id', 'Start latitude', 'Start longitude', 'End latitude', 'End longitude', 'Arrival at'],
            'location.task-points' => ['Recorded at', 'Company', 'Person', 'Task id', 'Session id', 'Latitude', 'Longitude', 'Accuracy meters', 'Speed m/s', 'Heading', 'Event', 'Checkpoint'],
            'location.field-sessions' => ['Started at', 'Ended at', 'Company', 'Person', 'Status', 'Distance meters', 'Travel seconds', 'Stop count', 'Last latitude', 'Last longitude'],
            'location.field-points' => ['Recorded at', 'Company', 'Person', 'Session id', 'Task id', 'Latitude', 'Longitude', 'Accuracy meters', 'Speed m/s', 'Movement', 'Distance from previous'],
            'location.field-stops' => ['Arrived at', 'Departed at', 'Company', 'Person', 'Latitude', 'Longitude', 'Address', 'Duration seconds', 'Classification', 'Task id', 'Lead id', 'Meeting id'],
            'work.tasks' => ['Created at', 'Company', 'Title', 'Status', 'Priority', 'Type', 'Created by', 'Assigned to', 'Due at', 'Started at', 'Completed at', 'Latitude', 'Longitude', 'Address'],
            'work.assignments' => ['Assigned at', 'Unassigned at', 'Company', 'Task', 'Assigned by', 'Assigned to', 'Current'],
            'work.reassignments' => ['Requested at', 'Company', 'Task id', 'Status', 'Requested by', 'From', 'To', 'Reason', 'Responded at'],
            'work.proofs' => ['Captured at', 'Uploaded at', 'Company', 'Task id', 'Uploaded by', 'Mime type', 'Size bytes', 'Latitude', 'Longitude', 'Notes'],
            'crm.activities' => ['Happened at', 'Company', 'Lead id', 'Type', 'Title', 'Description', 'Created by'],
            'crm.email' => ['Occurred at', 'Company', 'Person', 'Action', 'Lead id', 'Message id', 'Subject', 'Metadata'],
            'payroll' => ['Generated at', 'Company', 'Person', 'Cycle', 'Period start', 'Period end', 'Status', 'Salary payable', 'Currency', 'Approved at', 'Approved by', 'Revoked at', 'Revoked by', 'Reason'],
            'billing.credits' => ['Occurred at', 'Company', 'Type', 'SKU', 'Credits', 'USD amount', 'Balance after', 'Source'],
            'billing.subscriptions' => ['Updated at', 'Company', 'Company code', 'Status', 'Plan', 'Interval', 'Subscription status', 'Period start', 'Period end', 'Grace ends', 'Demo'],
            'ai-usage' => ['Started at', 'Company', 'Person', 'Provider', 'Model', 'Status', 'Intent', 'Tool', 'Input tokens', 'Output tokens', 'Total tokens', 'Estimated cost USD', 'Execution ms', 'Error code'],
            'disclosures' => ['Occurred at', 'Admin', 'Report', 'Action', 'Requester', 'Reference', 'Note', 'From', 'To', 'Row count', 'IP address', 'Filters'],
            default => throw new InvalidArgumentException('Unknown records report.'),
        };
    }

    /**
     * @return array<string, string>
     */
    private function row(string $variant, Model $model): array
    {
        $values = match ($variant) {
            'security-events' => $this->securityEventRow($model),
            'control-actions' => $this->controlActionRow($model),
            'workforce-changes' => $this->workforceRow($model),
            'support-access' => $this->supportAccessRow($model),
            'people' => $this->peopleRow($model),
            'attendance' => $this->attendanceRow($model),
            'location.task-sessions' => $this->taskSessionRow($model),
            'location.task-points' => $this->taskPointRow($model),
            'location.field-sessions' => $this->fieldSessionRow($model),
            'location.field-points' => $this->fieldPointRow($model),
            'location.field-stops' => $this->fieldStopRow($model),
            'work.tasks' => $this->taskRow($model),
            'work.assignments' => $this->assignmentRow($model),
            'work.reassignments' => $this->reassignmentRow($model),
            'work.proofs' => $this->proofRow($model),
            'crm.activities' => $this->leadActivityRow($model),
            'crm.email' => $this->emailActivityRow($model),
            'payroll' => $this->payrollRow($model),
            'billing.credits' => $this->creditRow($model),
            'billing.subscriptions' => $this->subscriptionRow($model),
            'ai-usage' => $this->aiRow($model),
            'disclosures' => $this->disclosureRow($model),
            default => throw new InvalidArgumentException('Unknown records report.'),
        };

        $combined = array_combine($this->headers($variant), $values);
        if ($combined === false) {
            throw new InvalidArgumentException('Records row does not match its columns.');
        }

        return $combined;
    }

    /**
     * @return Builder<SecurityAuditEvent>
     */
    private function securityEvents(RecordFilters $filters): Builder
    {
        return SecurityAuditEvent::query()
            ->with(['user', 'admin', 'company:id,name'])
            ->whereBetween('created_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('user_id', $userId))
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->where(function (Builder $inner) use ($like): void {
                    $inner->where('email', 'like', $like)
                        ->orWhereHas('user', fn (Builder $user) => $this->constrainPerson($user, $like))
                        ->orWhereHas('admin', fn (Builder $admin) => $admin->where('name', 'like', $like)->orWhere('email', 'like', $like));
                });
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<AdminActionLog>
     */
    private function controlActions(RecordFilters $filters): Builder
    {
        return AdminActionLog::query()
            ->with('admin')
            ->whereBetween('created_at', [$filters->from, $filters->to])
            ->when($filters->companyId, function (Builder $query, int $companyId): void {
                $query->where(function (Builder $inner) use ($companyId): void {
                    $inner->where('context->company_id', $companyId)
                        ->orWhere('context->company_id', (string) $companyId);
                });
            })
            ->when($filters->userId, function (Builder $query, int $userId): void {
                $query->where('target_type', 'user')->where('target_id', (string) $userId);
            })
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->where(function (Builder $inner) use ($like): void {
                    $inner->where('context', 'like', $like)
                        ->orWhereHas('admin', fn (Builder $admin) => $admin->where('name', 'like', $like)->orWhere('email', 'like', $like));
                });
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<InternalUserAuditLog>
     */
    private function workforceChanges(RecordFilters $filters): Builder
    {
        return InternalUserAuditLog::query()
            ->with([
                'company:id,name',
                'actor' => fn ($query) => $query->withTrashed(),
                'target' => fn ($query) => $query->withTrashed(),
            ])
            ->whereBetween('created_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, function (Builder $query, int $userId): void {
                $query->where(function (Builder $inner) use ($userId): void {
                    $inner->where('target_user_id', $userId)->orWhere('actor_user_id', $userId);
                });
            })
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->where(function (Builder $inner) use ($like): void {
                    $inner->whereHas('actor', fn (Builder $user) => $this->constrainPerson($user, $like))
                        ->orWhereHas('target', fn (Builder $user) => $this->constrainPerson($user, $like));
                });
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<SupportAccessSession>
     */
    private function supportAccess(RecordFilters $filters): Builder
    {
        return SupportAccessSession::query()
            ->with(['admin', 'targetUser' => fn ($query) => $query->withTrashed(), 'company:id,name'])
            ->whereBetween('created_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('target_user_id', $userId))
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->where(function (Builder $inner) use ($like): void {
                    $inner->where('target_email_snapshot', 'like', $like)
                        ->orWhere('target_name_snapshot', 'like', $like)
                        ->orWhere('admin_email_snapshot', 'like', $like)
                        ->orWhereHas('targetUser', fn (Builder $user) => $this->constrainPerson($user, $like));
                });
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<User>
     */
    private function people(RecordFilters $filters): Builder
    {
        return User::query()
            ->withTrashed()
            ->with(['companies:id,name'])
            ->whereBetween('created_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->whereHas(
                'companies',
                fn (Builder $company) => $company->where('companies.id', $companyId),
            ))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('id', $userId))
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $this->constrainPerson($query, $like);
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<AttendanceRecord>
     */
    private function attendance(RecordFilters $filters): Builder
    {
        return AttendanceRecord::query()
            ->with(['company:id,name', 'user' => fn ($query) => $query->withTrashed()])
            ->whereBetween('attendance_date', [$filters->from->toDateString(), $filters->to->toDateString()])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('user_id', $userId))
            ->when($filters->person, fn (Builder $query, string $person) => $query->whereHas(
                'user',
                fn (Builder $user) => $this->constrainPerson($user, $this->like($person)),
            ))
            ->orderByDesc('attendance_date')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<TaskTrackingSession>
     */
    private function taskSessions(RecordFilters $filters): Builder
    {
        return TaskTrackingSession::query()
            ->with([
                'company:id,name',
                'startedBy' => fn ($query) => $query->withTrashed(),
                'completedBy' => fn ($query) => $query->withTrashed(),
            ])
            ->whereBetween('start_recorded_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, function (Builder $query, int $userId): void {
                $query->where(function (Builder $inner) use ($userId): void {
                    $inner->where('started_by_user_id', $userId)->orWhere('completed_by_user_id', $userId);
                });
            })
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->where(function (Builder $inner) use ($like): void {
                    $inner->whereHas('startedBy', fn (Builder $user) => $this->constrainPerson($user, $like))
                        ->orWhereHas('completedBy', fn (Builder $user) => $this->constrainPerson($user, $like));
                });
            })
            ->orderByDesc('start_recorded_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<TaskLocationPoint>
     */
    private function taskPoints(RecordFilters $filters): Builder
    {
        return TaskLocationPoint::query()
            ->with(['company:id,name', 'user' => fn ($query) => $query->withTrashed()])
            ->whereBetween('recorded_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('user_id', $userId))
            ->when($filters->person, fn (Builder $query, string $person) => $query->whereHas(
                'user',
                fn (Builder $user) => $this->constrainPerson($user, $this->like($person)),
            ))
            ->orderByDesc('recorded_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<FieldActivitySession>
     */
    private function fieldSessions(RecordFilters $filters): Builder
    {
        return FieldActivitySession::query()
            ->with(['company:id,name', 'user' => fn ($query) => $query->withTrashed()])
            ->whereBetween('started_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('user_id', $userId))
            ->when($filters->person, fn (Builder $query, string $person) => $query->whereHas(
                'user',
                fn (Builder $user) => $this->constrainPerson($user, $this->like($person)),
            ))
            ->orderByDesc('started_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<FieldLocationPoint>
     */
    private function fieldPoints(RecordFilters $filters): Builder
    {
        return FieldLocationPoint::query()
            ->with(['company:id,name', 'user' => fn ($query) => $query->withTrashed()])
            ->whereBetween('recorded_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('user_id', $userId))
            ->when($filters->person, fn (Builder $query, string $person) => $query->whereHas(
                'user',
                fn (Builder $user) => $this->constrainPerson($user, $this->like($person)),
            ))
            ->orderByDesc('recorded_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<FieldStop>
     */
    private function fieldStops(RecordFilters $filters): Builder
    {
        return FieldStop::query()
            ->with(['company:id,name', 'user' => fn ($query) => $query->withTrashed()])
            ->whereBetween('arrived_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('user_id', $userId))
            ->when($filters->person, fn (Builder $query, string $person) => $query->whereHas(
                'user',
                fn (Builder $user) => $this->constrainPerson($user, $this->like($person)),
            ))
            ->orderByDesc('arrived_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<Task>
     */
    private function tasks(RecordFilters $filters): Builder
    {
        return Task::query()
            ->with([
                'company:id,name',
                'creator' => fn ($query) => $query->withTrashed(),
                'assignedAgent' => fn ($query) => $query->withTrashed(),
            ])
            ->whereBetween('created_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, function (Builder $query, int $userId): void {
                $query->where(function (Builder $inner) use ($userId): void {
                    $inner->where('assigned_agent_id', $userId)->orWhere('created_by_user_id', $userId);
                });
            })
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->where(function (Builder $inner) use ($like): void {
                    $inner->whereHas('assignedAgent', fn (Builder $user) => $this->constrainPerson($user, $like))
                        ->orWhereHas('creator', fn (Builder $user) => $this->constrainPerson($user, $like));
                });
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<TaskAssignment>
     */
    private function assignments(RecordFilters $filters): Builder
    {
        return TaskAssignment::query()
            ->with([
                'task:id,title,company_id',
                'task.company:id,name',
                'assignedBy' => fn ($query) => $query->withTrashed(),
                'assignedAgent' => fn ($query) => $query->withTrashed(),
            ])
            ->whereBetween('assigned_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->whereHas(
                'task',
                fn (Builder $task) => $task->where('company_id', $companyId),
            ))
            ->when($filters->userId, function (Builder $query, int $userId): void {
                $query->where(function (Builder $inner) use ($userId): void {
                    $inner->where('assigned_agent_id', $userId)->orWhere('assigned_by_user_id', $userId);
                });
            })
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->where(function (Builder $inner) use ($like): void {
                    $inner->whereHas('assignedAgent', fn (Builder $user) => $this->constrainPerson($user, $like))
                        ->orWhereHas('assignedBy', fn (Builder $user) => $this->constrainPerson($user, $like));
                });
            })
            ->orderByDesc('assigned_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<TaskReassignment>
     */
    private function reassignments(RecordFilters $filters): Builder
    {
        return TaskReassignment::query()
            ->with([
                'company:id,name',
                'requestedBy' => fn ($query) => $query->withTrashed(),
                'fromUser' => fn ($query) => $query->withTrashed(),
                'toUser' => fn ($query) => $query->withTrashed(),
            ])
            ->whereBetween('requested_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, function (Builder $query, int $userId): void {
                $query->where(function (Builder $inner) use ($userId): void {
                    $inner->where('requested_by_user_id', $userId)
                        ->orWhere('from_user_id', $userId)
                        ->orWhere('to_user_id', $userId);
                });
            })
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->where(function (Builder $inner) use ($like): void {
                    $inner->whereHas('requestedBy', fn (Builder $user) => $this->constrainPerson($user, $like))
                        ->orWhereHas('fromUser', fn (Builder $user) => $this->constrainPerson($user, $like))
                        ->orWhereHas('toUser', fn (Builder $user) => $this->constrainPerson($user, $like));
                });
            })
            ->orderByDesc('requested_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<TaskProof>
     */
    private function proofs(RecordFilters $filters): Builder
    {
        return TaskProof::query()
            ->with([
                'task:id,company_id',
                'task.company:id,name',
                'uploader' => fn ($query) => $query->withTrashed(),
            ])
            ->whereBetween('created_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->whereHas(
                'task',
                fn (Builder $task) => $task->where('company_id', $companyId),
            ))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('uploaded_by_user_id', $userId))
            ->when($filters->person, fn (Builder $query, string $person) => $query->whereHas(
                'uploader',
                fn (Builder $user) => $this->constrainPerson($user, $this->like($person)),
            ))
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<LeadActivity>
     */
    private function leadActivities(RecordFilters $filters): Builder
    {
        return LeadActivity::query()
            ->with(['company:id,name', 'creator' => fn ($query) => $query->withTrashed()])
            ->whereBetween('happened_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('created_by_user_id', $userId))
            ->when($filters->person, fn (Builder $query, string $person) => $query->whereHas(
                'creator',
                fn (Builder $user) => $this->constrainPerson($user, $this->like($person)),
            ))
            ->orderByDesc('happened_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<CrmEmailActivityLog>
     */
    private function emailActivity(RecordFilters $filters): Builder
    {
        return CrmEmailActivityLog::query()
            ->with([
                'company:id,name',
                'user' => fn ($query) => $query->withTrashed(),
                'message:id,subject',
            ])
            ->whereBetween('created_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('user_id', $userId))
            ->when($filters->person, fn (Builder $query, string $person) => $query->whereHas(
                'user',
                fn (Builder $user) => $this->constrainPerson($user, $this->like($person)),
            ))
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<AttendancePayrollSummary>
     */
    private function payroll(RecordFilters $filters): Builder
    {
        return AttendancePayrollSummary::query()
            ->with([
                'company:id,name',
                'user' => fn ($query) => $query->withTrashed(),
                'approvedBy' => fn ($query) => $query->withTrashed(),
                'revokedBy' => fn ($query) => $query->withTrashed(),
            ])
            ->whereBetween('generated_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('user_id', $userId))
            ->when($filters->person, fn (Builder $query, string $person) => $query->whereHas(
                'user',
                fn (Builder $user) => $this->constrainPerson($user, $this->like($person)),
            ))
            ->orderByDesc('generated_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<MapCreditTransaction>
     */
    private function mapCredits(RecordFilters $filters): Builder
    {
        return MapCreditTransaction::query()
            ->with('company:id,name')
            ->whereBetween('created_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->whereHas('company', function (Builder $company) use ($like): void {
                    $company->where('name', 'like', $like)->orWhere('company_id', 'like', $like);
                });
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<Company>
     */
    private function subscriptions(RecordFilters $filters): Builder
    {
        return Company::query()
            ->whereBetween('updated_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('id', $companyId))
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->where(function (Builder $inner) use ($like): void {
                    $inner->where('name', 'like', $like)
                        ->orWhere('company_id', 'like', $like)
                        ->orWhereHas('users', fn (Builder $user) => $this->constrainPerson($user, $like));
                });
            })
            ->orderByDesc('updated_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<AiLog>
     */
    private function aiUsage(RecordFilters $filters): Builder
    {
        return AiLog::query()
            ->with(['company:id,name', 'user' => fn ($query) => $query->withTrashed()])
            ->whereBetween('started_at', [$filters->from, $filters->to])
            ->when($filters->companyId, fn (Builder $query, int $companyId) => $query->where('company_id', $companyId))
            ->when($filters->userId, fn (Builder $query, int $userId) => $query->where('user_id', $userId))
            ->when($filters->person, fn (Builder $query, string $person) => $query->whereHas(
                'user',
                fn (Builder $user) => $this->constrainPerson($user, $this->like($person)),
            ))
            ->orderByDesc('started_at')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<RecordDisclosure>
     */
    private function disclosures(RecordFilters $filters): Builder
    {
        return RecordDisclosure::query()
            ->with('admin')
            ->whereBetween('created_at', [$filters->from, $filters->to])
            ->when($filters->person, function (Builder $query, string $person): void {
                $like = $this->like($person);
                $query->where(function (Builder $inner) use ($like): void {
                    $inner->where('reference', 'like', $like)
                        ->orWhere('note', 'like', $like)
                        ->orWhereHas('admin', fn (Builder $admin) => $admin->where('name', 'like', $like)->orWhere('email', 'like', $like));
                });
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return list<string>
     */
    private function securityEventRow(Model $model): array
    {
        /** @var SecurityAuditEvent $model */
        return [
            $this->present($model->created_at),
            $this->present($model->result),
            $this->present($model->action),
            $this->present($model->channel),
            $this->personLabel($model->user),
            $this->adminLabel($model->admin),
            $this->present($model->company?->name),
            $this->present($model->email),
            $this->present($model->ip_address),
            $this->present($model->user_agent),
            $this->present($model->context),
        ];
    }

    /**
     * @return list<string>
     */
    private function controlActionRow(Model $model): array
    {
        /** @var AdminActionLog $model */
        return [
            $this->present($model->created_at),
            $this->adminLabel($model->admin),
            $this->present($model->action),
            $this->present($model->target_type),
            $this->present($model->target_id),
            $this->present($model->ip_address),
            $this->present($model->user_agent),
            $this->present($model->context),
        ];
    }

    /**
     * @return list<string>
     */
    private function workforceRow(Model $model): array
    {
        /** @var InternalUserAuditLog $model */
        return [
            $this->present($model->created_at),
            $this->present($model->company?->name),
            $this->present($model->action),
            $this->personLabel($model->actor),
            $this->personLabel($model->target),
            $this->present($model->metadata),
        ];
    }

    /**
     * @return list<string>
     */
    private function supportAccessRow(Model $model): array
    {
        /** @var SupportAccessSession $model */
        $admin = $model->admin_name_snapshot ?: $this->adminLabel($model->admin);
        $target = $model->target_email_snapshot
            ? trim($model->target_name_snapshot.' <'.$model->target_email_snapshot.'>')
            : $this->personLabel($model->targetUser);

        return [
            $this->present($model->created_at),
            $this->present($admin),
            $this->present($target),
            $this->present($model->company_name_snapshot ?: $model->company?->name),
            $this->present($model->access_level),
            $this->present($model->reason),
            $this->present($model->ticket_reference),
            $this->present($model->exchanged_at),
            $this->present($model->ended_at),
            $this->present($model->revoked_at),
            $this->present($model->session_expires_at),
            $this->present($model->request_ip),
        ];
    }

    /**
     * @return list<string>
     */
    private function peopleRow(Model $model): array
    {
        /** @var User $model */
        $companies = $model->companies
            ->map(fn (Company $company): string => $company->name.' ('.($company->pivot->role ?? '').')')
            ->implode('; ');

        return [
            $this->present($model->created_at),
            $this->present($model->name),
            $this->present($model->email),
            $this->present($model->internal_role),
            $model->is_active ? 'yes' : 'no',
            $this->present($model->suspended_until),
            $this->present($model->deleted_at),
            $this->present($companies),
        ];
    }

    /**
     * @return list<string>
     */
    private function attendanceRow(Model $model): array
    {
        /** @var AttendanceRecord $model */
        return [
            $this->present($model->attendance_date),
            $this->present($model->company?->name),
            $this->personLabel($model->user),
            $this->present($model->clock_in_at),
            $this->present($model->clock_out_at),
            $this->present($model->status),
            $this->present($model->work_duration_minutes),
            $model->is_late ? 'yes' : 'no',
            $model->is_auto_clocked_out ? 'yes' : 'no',
        ];
    }

    /**
     * @return list<string>
     */
    private function taskSessionRow(Model $model): array
    {
        /** @var TaskTrackingSession $model */
        return [
            $this->present($model->start_recorded_at),
            $this->present($model->end_recorded_at),
            $this->present($model->company?->name),
            $this->personLabel($model->startedBy),
            $this->personLabel($model->completedBy),
            $this->present($model->task_id),
            $this->present($model->start_latitude),
            $this->present($model->start_longitude),
            $this->present($model->end_latitude),
            $this->present($model->end_longitude),
            $this->present($model->arrival_detected_at),
        ];
    }

    /**
     * @return list<string>
     */
    private function taskPointRow(Model $model): array
    {
        /** @var TaskLocationPoint $model */
        return [
            $this->present($model->recorded_at),
            $this->present($model->company?->name),
            $this->personLabel($model->user),
            $this->present($model->task_id),
            $this->present($model->tracking_session_id),
            $this->present($model->latitude),
            $this->present($model->longitude),
            $this->present($model->accuracy_meters),
            $this->present($model->speed_mps),
            $this->present($model->heading_degrees),
            $this->present($model->event_type),
            $model->is_checkpoint ? 'yes' : 'no',
        ];
    }

    /**
     * @return list<string>
     */
    private function fieldSessionRow(Model $model): array
    {
        /** @var FieldActivitySession $model */
        return [
            $this->present($model->started_at),
            $this->present($model->ended_at),
            $this->present($model->company?->name),
            $this->personLabel($model->user),
            $this->present($model->status),
            $this->present($model->distance_meters),
            $this->present($model->travel_seconds),
            $this->present($model->stop_count),
            $this->present($model->last_latitude),
            $this->present($model->last_longitude),
        ];
    }

    /**
     * @return list<string>
     */
    private function fieldPointRow(Model $model): array
    {
        /** @var FieldLocationPoint $model */
        return [
            $this->present($model->recorded_at),
            $this->present($model->company?->name),
            $this->personLabel($model->user),
            $this->present($model->field_activity_session_id),
            $this->present($model->task_id),
            $this->present($model->latitude),
            $this->present($model->longitude),
            $this->present($model->accuracy_meters),
            $this->present($model->speed_mps),
            $this->present($model->movement_state),
            $this->present($model->distance_from_previous_meters),
        ];
    }

    /**
     * @return list<string>
     */
    private function fieldStopRow(Model $model): array
    {
        /** @var FieldStop $model */
        return [
            $this->present($model->arrived_at),
            $this->present($model->departed_at),
            $this->present($model->company?->name),
            $this->personLabel($model->user),
            $this->present($model->latitude),
            $this->present($model->longitude),
            $this->present($model->address),
            $this->present($model->duration_seconds),
            $this->present($model->classification),
            $this->present($model->task_id),
            $this->present($model->lead_id),
            $this->present($model->meeting_id),
        ];
    }

    /**
     * @return list<string>
     */
    private function taskRow(Model $model): array
    {
        /** @var Task $model */
        return [
            $this->present($model->created_at),
            $this->present($model->company?->name),
            $this->present($model->title),
            $this->present($model->status),
            $this->present($model->priority),
            $this->present($model->type),
            $this->personLabel($model->creator),
            $this->personLabel($model->assignedAgent),
            $this->present($model->due_at),
            $this->present($model->started_at),
            $this->present($model->completed_at),
            $this->present($model->latitude),
            $this->present($model->longitude),
            $this->present($model->address_full ?: $model->location_text),
        ];
    }

    /**
     * @return list<string>
     */
    private function assignmentRow(Model $model): array
    {
        /** @var TaskAssignment $model */
        return [
            $this->present($model->assigned_at),
            $this->present($model->unassigned_at),
            $this->present($model->task?->company?->name),
            $this->present($model->task?->title),
            $this->personLabel($model->assignedBy),
            $this->personLabel($model->assignedAgent),
            $model->is_current ? 'yes' : 'no',
        ];
    }

    /**
     * @return list<string>
     */
    private function reassignmentRow(Model $model): array
    {
        /** @var TaskReassignment $model */
        return [
            $this->present($model->requested_at),
            $this->present($model->company?->name),
            $this->present($model->task_id),
            $this->present($model->status),
            $this->personLabel($model->requestedBy),
            $this->personLabel($model->fromUser),
            $this->personLabel($model->toUser),
            $this->present($model->reason),
            $this->present($model->responded_at),
        ];
    }

    /**
     * @return list<string>
     */
    private function proofRow(Model $model): array
    {
        /** @var TaskProof $model */
        return [
            $this->present($model->captured_at),
            $this->present($model->created_at),
            $this->present($model->task?->company?->name),
            $this->present($model->task_id),
            $this->personLabel($model->uploader),
            $this->present($model->mime_type),
            $this->present($model->size_bytes),
            $this->present($model->latitude),
            $this->present($model->longitude),
            $this->present($model->notes),
        ];
    }

    /**
     * @return list<string>
     */
    private function leadActivityRow(Model $model): array
    {
        /** @var LeadActivity $model */
        return [
            $this->present($model->happened_at),
            $this->present($model->company?->name),
            $this->present($model->lead_id),
            $this->present($model->type),
            $this->present($model->title),
            $this->present($model->description),
            $this->personLabel($model->creator),
        ];
    }

    /**
     * @return list<string>
     */
    private function emailActivityRow(Model $model): array
    {
        /** @var CrmEmailActivityLog $model */
        return [
            $this->present($model->created_at),
            $this->present($model->company?->name),
            $this->personLabel($model->user),
            $this->present($model->action),
            $this->present($model->lead_id),
            $this->present($model->message_id),
            $this->present($model->message?->subject),
            $this->present($model->metadata),
        ];
    }

    /**
     * @return list<string>
     */
    private function payrollRow(Model $model): array
    {
        /** @var AttendancePayrollSummary $model */
        return [
            $this->present($model->generated_at),
            $this->present($model->company?->name),
            $this->personLabel($model->user),
            $this->present($model->cycle_type),
            $this->present($model->period_start),
            $this->present($model->period_end),
            $this->present($model->status),
            $this->present($model->salary_payable),
            $this->present($model->currency),
            $this->present($model->approved_at),
            $this->personLabel($model->approvedBy),
            $this->present($model->revoked_at),
            $this->personLabel($model->revokedBy),
            $this->present($model->approval_reason),
        ];
    }

    /**
     * @return list<string>
     */
    private function creditRow(Model $model): array
    {
        /** @var MapCreditTransaction $model */
        return [
            $this->present($model->created_at),
            $this->present($model->company?->name),
            $this->present($model->type),
            $this->present($model->sku),
            $this->present($model->credits),
            $this->present($model->usd_amount),
            $this->present($model->balance_after),
            $this->present($model->source),
        ];
    }

    /**
     * @return list<string>
     */
    private function subscriptionRow(Model $model): array
    {
        /** @var Company $model */
        return [
            $this->present($model->updated_at),
            $this->present($model->name),
            $this->present($model->company_id),
            $this->present($model->status),
            $this->present($model->subscription_plan_key ?: $model->assigned_plan_key),
            $this->present($model->subscription_billing_interval ?: $model->assigned_billing_interval),
            $this->present($model->subscription_status),
            $this->present($model->subscription_current_period_start),
            $this->present($model->subscription_current_period_end),
            $this->present($model->subscription_grace_ends_at),
            $model->is_demo ? 'yes' : 'no',
        ];
    }

    /**
     * @return list<string>
     */
    private function aiRow(Model $model): array
    {
        /** @var AiLog $model */
        return [
            $this->present($model->started_at),
            $this->present($model->company?->name),
            $this->personLabel($model->user),
            $this->present($model->provider),
            $this->present($model->model),
            $this->present($model->status),
            $this->present($model->intent_type),
            $this->present($model->tool_name),
            $this->present($model->input_tokens),
            $this->present($model->output_tokens),
            $this->present($model->total_tokens),
            $this->present($model->estimated_cost_usd),
            $this->present($model->execution_ms),
            $this->present($model->error_code),
        ];
    }

    /**
     * @return list<string>
     */
    private function disclosureRow(Model $model): array
    {
        /** @var RecordDisclosure $model */
        return [
            $this->present($model->created_at),
            $this->adminLabel($model->admin),
            $this->present($model->report),
            $this->present($model->action),
            $this->present($model->requester_type),
            $this->present($model->reference),
            $this->present($model->note),
            $this->present($model->from_date),
            $this->present($model->to_date),
            $this->present($model->row_count),
            $this->present($model->ip_address),
            $this->present($model->filters),
        ];
    }

    private function constrainPerson(Builder $query, string $like): void
    {
        $query->withTrashed()->where(function (Builder $inner) use ($like): void {
            $inner->where('name', 'like', $like)->orWhere('email', 'like', $like);
        });
    }

    private function like(string $value): string
    {
        return '%'.addcslashes(trim($value), '\\%_').'%';
    }

    private function personLabel(?User $user): string
    {
        if ($user === null) {
            return '';
        }

        return trim($user->name.' <'.$user->email.'>');
    }

    private function adminLabel(?Admin $admin): string
    {
        if ($admin === null) {
            return '';
        }

        return trim($admin->name.' <'.$admin->email.'>');
    }

    private function present(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if ($value instanceof \BackedEnum) {
            return (string) $value->value;
        }

        if ($value instanceof \UnitEnum) {
            return $value->name;
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d H:i:s');
        }

        if (is_bool($value)) {
            return $value ? 'yes' : 'no';
        }

        if (is_array($value)) {
            $encoded = json_encode($value, JSON_UNESCAPED_UNICODE);

            return $this->guardSpreadsheet($encoded === false ? '' : $encoded);
        }

        if ($value instanceof Collection) {
            return $this->present($value->all());
        }

        return $this->guardSpreadsheet((string) $value);
    }

    private function guardSpreadsheet(string $value): string
    {
        if ($value !== '' && preg_match('/^[=+\-@]/', $value) === 1 && ! is_numeric($value)) {
            return "'".$value;
        }

        return $value;
    }
}
