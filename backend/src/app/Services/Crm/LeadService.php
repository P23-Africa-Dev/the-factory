<?php

declare(strict_types=1);

namespace App\Services\Crm;

use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadNote;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

class LeadService
{
    public function __construct(private readonly CompanyContextService $companyContextService) {}

    public function listForUser(User $user, array $filters): Paginator
    {
        $context = $this->companyContextService->resolve($user, $filters['company_id'] ?? null);

        $query = $this->baseQuery((int) $context['company']->id);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['priority'])) {
            $query->where('priority', $filters['priority']);
        }

        if (! empty($filters['assigned_to_user_id'])) {
            $query->where('assigned_to_user_id', (int) $filters['assigned_to_user_id']);
        }

        if (! empty($filters['source'])) {
            $query->where('source', 'like', '%' . $filters['source'] . '%');
        }

        if (! empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $query->where(function (Builder $builder) use ($search): void {
                $builder->where('name', 'like', '%' . $search . '%')
                    ->orWhere('email', 'like', '%' . $search . '%')
                    ->orWhere('phone', 'like', '%' . $search . '%')
                    ->orWhere('location', 'like', '%' . $search . '%');
            });
        }

        return $query->latest('id')->simplePaginate(20)->withQueryString();
    }

    public function create(User $user, array $data): Lead
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $this->ensureCanManage((string) $context['role']);

        $companyId = (int) $context['company']->id;
        $assignedToUserId = isset($data['assigned_to_user_id']) ? (int) $data['assigned_to_user_id'] : null;

        if ($assignedToUserId !== null) {
            $this->assertMemberInCompany($companyId, $assignedToUserId, 'assigned_to_user_id');
        }

        $lead = Lead::create([
            'company_id' => $companyId,
            'created_by_user_id' => $user->id,
            'assigned_to_user_id' => $assignedToUserId,
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'location' => $data['location'] ?? null,
            'source' => $data['source'] ?? null,
            'status' => $data['status'],
            'priority' => $data['priority'],
            'next_action' => $data['next_action'] ?? null,
            'last_interaction' => $data['last_interaction'] ?? null,
            'last_interaction_at' => $data['last_interaction_at'] ?? null,
            'meta' => $data['meta'] ?? null,
        ]);

        return $this->findForUser($user, $lead, $companyId);
    }

    public function findForUser(User $user, Lead $lead, ?int $companyId = null): Lead
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $this->assertLeadInCompany($lead, (int) $context['company']->id);

        return $this->baseQuery((int) $context['company']->id)
            ->whereKey($lead->id)
            ->firstOrFail();
    }

    public function update(User $user, Lead $lead, array $data): Lead
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $this->ensureCanManage((string) $context['role']);

        $companyId = (int) $context['company']->id;
        $this->assertLeadInCompany($lead, $companyId);

        if (array_key_exists('assigned_to_user_id', $data) && $data['assigned_to_user_id'] !== null) {
            $this->assertMemberInCompany($companyId, (int) $data['assigned_to_user_id'], 'assigned_to_user_id');
        }

        $lead->update([
            'assigned_to_user_id' => array_key_exists('assigned_to_user_id', $data)
                ? ($data['assigned_to_user_id'] !== null ? (int) $data['assigned_to_user_id'] : null)
                : $lead->assigned_to_user_id,
            'name' => $data['name'] ?? $lead->name,
            'email' => array_key_exists('email', $data) ? $data['email'] : $lead->email,
            'phone' => array_key_exists('phone', $data) ? $data['phone'] : $lead->phone,
            'location' => array_key_exists('location', $data) ? $data['location'] : $lead->location,
            'source' => array_key_exists('source', $data) ? $data['source'] : $lead->source,
            'status' => $data['status'] ?? $lead->status?->value,
            'priority' => $data['priority'] ?? $lead->priority?->value,
            'next_action' => array_key_exists('next_action', $data) ? $data['next_action'] : $lead->next_action,
            'last_interaction' => array_key_exists('last_interaction', $data) ? $data['last_interaction'] : $lead->last_interaction,
            'last_interaction_at' => array_key_exists('last_interaction_at', $data) ? $data['last_interaction_at'] : $lead->last_interaction_at,
            'meta' => array_key_exists('meta', $data) ? $data['meta'] : $lead->meta,
            'converted_at' => array_key_exists('converted_at', $data) ? $data['converted_at'] : $lead->converted_at,
        ]);

        return $this->findForUser($user, $lead->fresh(), $companyId);
    }

    public function addNote(User $user, Lead $lead, string $note, ?int $companyId = null): LeadNote
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $this->assertLeadInCompany($lead, (int) $context['company']->id);

        $leadNote = LeadNote::create([
            'lead_id' => $lead->id,
            'company_id' => (int) $context['company']->id,
            'created_by_user_id' => $user->id,
            'note' => $note,
        ]);

        return $leadNote->load('creator:id,name,email');
    }

    public function addActivity(User $user, Lead $lead, array $payload, ?int $companyId = null): LeadActivity
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $this->assertLeadInCompany($lead, (int) $context['company']->id);

        $activity = LeadActivity::create([
            'lead_id' => $lead->id,
            'company_id' => (int) $context['company']->id,
            'created_by_user_id' => $user->id,
            'type' => $payload['type'],
            'title' => $payload['title'] ?? null,
            'description' => $payload['description'] ?? null,
            'happened_at' => $payload['happened_at'] ?? null,
            'meta' => $payload['meta'] ?? null,
        ]);

        return $activity->load('creator:id,name,email');
    }

    public function pipelineSummary(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $query = Lead::query()->where('company_id', (int) $context['company']->id);

        $counts = (clone $query)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status')
            ->all();

        $total = (int) array_sum(array_map(static fn($value): int => (int) $value, $counts));

        return [
            'total' => $total,
            'stages' => [
                ['status' => 'new', 'count' => (int) ($counts['new'] ?? 0)],
                ['status' => 'contacted', 'count' => (int) ($counts['contacted'] ?? 0)],
                ['status' => 'qualified', 'count' => (int) ($counts['qualified'] ?? 0)],
                ['status' => 'proposal_sent', 'count' => (int) ($counts['proposal_sent'] ?? 0)],
                ['status' => 'won', 'count' => (int) ($counts['won'] ?? 0)],
                ['status' => 'lost', 'count' => (int) ($counts['lost'] ?? 0)],
            ],
        ];
    }

    private function baseQuery(int $companyId): Builder
    {
        return Lead::query()
            ->where('company_id', $companyId)
            ->with([
                'creator:id,name,email',
                'assignee:id,name,email',
                'notes' => fn($query) => $query->latest('id')->limit(10),
                'notes.creator:id,name,email',
                'activities' => fn($query) => $query->latest('id')->limit(20),
                'activities.creator:id,name,email',
            ]);
    }

    private function ensureCanManage(string $role): void
    {
        if (! in_array($role, ['owner', 'admin', 'supervisor'], true)) {
            throw ValidationException::withMessages([
                'authorization' => ['Only owners, admins, and supervisors can manage CRM leads.'],
            ]);
        }
    }

    private function assertLeadInCompany(Lead $lead, int $companyId): void
    {
        if ($lead->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'lead' => ['The selected lead is outside your company context.'],
            ]);
        }
    }

    private function assertMemberInCompany(int $companyId, int $userId, string $field): void
    {
        $memberExists = User::query()
            ->whereKey($userId)
            ->whereExists(function ($query) use ($companyId): void {
                $query->selectRaw('1')
                    ->from('company_users')
                    ->whereColumn('company_users.user_id', 'users.id')
                    ->where('company_users.company_id', $companyId);
            })
            ->exists();

        if (! $memberExists) {
            throw ValidationException::withMessages([
                $field => ['Selected user is not a member of this company.'],
            ]);
        }
    }
}
