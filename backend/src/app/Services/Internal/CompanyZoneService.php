<?php

declare(strict_types=1);

namespace App\Services\Internal;

use App\Models\CompanyZone;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CompanyZoneService
{
    public function __construct(
        private readonly InternalUserAccessService $accessService,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return Collection<int, CompanyZone>
     */
    public function listForCompanyMember(User $actor, array $filters = []): Collection
    {
        $context = $this->accessService->resolveCompanyContext($actor, isset($filters['company_id']) ? (int) $filters['company_id'] : null);
        $companyId = (int) $context['company']->id;

        $query = CompanyZone::query()
            ->where('company_id', $companyId)
            ->orderBy('country_code')
            ->orderBy('state_name')
            ->orderBy('lga_name');

        if (array_key_exists('is_active', $filters) && $filters['is_active'] !== null) {
            $query->where('is_active', (bool) $filters['is_active']);
        }

        if (isset($filters['q']) && is_string($filters['q']) && trim($filters['q']) !== '') {
            $search = trim((string) $filters['q']);
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', '%' . $search . '%')
                    ->orWhere('state_name', 'like', '%' . $search . '%')
                    ->orWhere('lga_name', 'like', '%' . $search . '%')
                    ->orWhere('country_code', 'like', '%' . strtoupper($search) . '%');
            });
        }

        return $query->get();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(User $actor, array $data): CompanyZone
    {
        $context = $this->accessService->resolveCompanyContext($actor, isset($data['company_id']) ? (int) $data['company_id'] : null);
        $this->accessService->ensureCanManageInternalUsers((string) $context['role']);
        $companyId = (int) $context['company']->id;

        $name = $this->resolveName($data);
        $normalized = $this->normalizeName($name);
        $this->ensureUniqueName($companyId, $normalized);

        return CompanyZone::query()->create([
            'company_id' => $companyId,
            'name' => $name,
            'normalized_name' => $normalized,
            'country_code' => strtoupper((string) $data['country_code']),
            'state_name' => trim((string) $data['state_name']),
            'lga_name' => trim((string) $data['lga_name']),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'meta' => is_array($data['meta'] ?? null) ? $data['meta'] : null,
            'created_by_user_id' => (int) $actor->id,
            'updated_by_user_id' => null,
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(User $actor, CompanyZone $zone, array $data): CompanyZone
    {
        $context = $this->accessService->resolveCompanyContext($actor, isset($data['company_id']) ? (int) $data['company_id'] : null);
        $this->accessService->ensureCanManageInternalUsers((string) $context['role']);
        $companyId = (int) $context['company']->id;
        $this->assertZoneInCompany($zone, $companyId);

        $name = array_key_exists('name', $data) || array_key_exists('state_name', $data) || array_key_exists('lga_name', $data)
            ? $this->resolveName([
                'name' => $data['name'] ?? $zone->name,
                'state_name' => $data['state_name'] ?? $zone->state_name,
                'lga_name' => $data['lga_name'] ?? $zone->lga_name,
            ])
            : $zone->name;
        $normalized = $this->normalizeName($name);
        $this->ensureUniqueName($companyId, $normalized, (int) $zone->id);

        $zone->update([
            'name' => $name,
            'normalized_name' => $normalized,
            'country_code' => array_key_exists('country_code', $data) ? strtoupper((string) $data['country_code']) : $zone->country_code,
            'state_name' => array_key_exists('state_name', $data) ? trim((string) $data['state_name']) : $zone->state_name,
            'lga_name' => array_key_exists('lga_name', $data) ? trim((string) $data['lga_name']) : $zone->lga_name,
            'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : $zone->is_active,
            'meta' => array_key_exists('meta', $data) ? (is_array($data['meta']) ? $data['meta'] : null) : $zone->meta,
            'updated_by_user_id' => (int) $actor->id,
        ]);

        return $zone->fresh();
    }

    public function delete(User $actor, CompanyZone $zone, ?int $companyId = null): void
    {
        $context = $this->accessService->resolveCompanyContext($actor, $companyId);
        $this->accessService->ensureCanManageInternalUsers((string) $context['role']);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertZoneInCompany($zone, $resolvedCompanyId);

        $zone->users()->detach();
        $zone->delete();
    }

    private function assertZoneInCompany(CompanyZone $zone, int $companyId): void
    {
        if ((int) $zone->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'zone' => ['Selected zone does not belong to your company context.'],
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function resolveName(array $data): string
    {
        $name = isset($data['name']) ? trim((string) $data['name']) : '';
        if ($name !== '') {
            return Str::limit($name, 120, '');
        }

        $state = trim((string) ($data['state_name'] ?? ''));
        $lga = trim((string) ($data['lga_name'] ?? ''));

        return Str::limit($lga . ', ' . $state, 120, '');
    }

    private function normalizeName(string $name): string
    {
        return Str::lower(trim(preg_replace('/\s+/', ' ', $name) ?? $name));
    }

    private function ensureUniqueName(int $companyId, string $normalizedName, ?int $ignoreZoneId = null): void
    {
        $query = CompanyZone::query()
            ->where('company_id', $companyId)
            ->where('normalized_name', $normalizedName);

        if ($ignoreZoneId !== null) {
            $query->where('id', '!=', $ignoreZoneId);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'name' => ['A zone with this name already exists in your company.'],
            ]);
        }
    }
}

