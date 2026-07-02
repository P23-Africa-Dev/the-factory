<?php

declare(strict_types=1);

namespace App\Services\Company;

use App\Models\CompanyLocation;
use App\Models\User;
use App\Services\Crm\MapSavedLeadBridgeService;
use App\Services\Location\MapboxGeocodingService;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CompanyLocationService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly MapSavedLeadBridgeService $mapSavedLeadBridgeService,
        private readonly MapboxGeocodingService $mapboxGeocodingService,
    ) {}

    /**
     * @return array{company_id: int, role: string}
     */
    public function viewerContext(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return [
            'company_id' => (int) $context['company']->id,
            'role' => (string) $context['role'],
        ];
    }

    public function listForUser(User $user, array $filters): Paginator
    {
        $this->companyContextService->resolve($user, $filters['company_id'] ?? null);

        $query = $this->globalQuery();

        if (array_key_exists('is_active', $filters) && $filters['is_active'] !== null) {
            $query->where('is_active', (bool) $filters['is_active']);
        } else {
            $query->where('is_active', true);
        }

        if (! empty($filters['type'])) {
            $query->where('type', (string) $filters['type']);
        }

        if (! empty($filters['q'])) {
            $search = trim((string) $filters['q']);
            $query->where(function (Builder $builder) use ($search): void {
                $builder->where('name', 'like', '%' . $search . '%')
                    ->orWhere('type', 'like', '%' . $search . '%')
                    ->orWhere('address', 'like', '%' . $search . '%');
            });
        }

        $perPage = (int) ($filters['per_page'] ?? 100);

        return $query->latest('id')->paginate($perPage)->withQueryString();
    }

    public function create(User $user, array $data): CompanyLocation
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $this->ensureCanCreate((string) $context['role']);
        $companyId = (int) $context['company']->id;

        $location = DB::transaction(function () use ($user, $data, $companyId): CompanyLocation {
            $location = CompanyLocation::create([
                'company_id' => $companyId,
                'crm_lead_id' => null,
                'created_by_user_id' => (int) $user->id,
                'updated_by_user_id' => null,
                'name' => $data['name'],
                'type' => $data['type'] ?? null,
                'description' => $data['description'] ?? null,
                'address' => $data['address'] ?? null,
                'latitude' => $data['latitude'],
                'longitude' => $data['longitude'],
                'contact_number' => $data['contact_number'] ?? null,
                'email' => $data['email'] ?? null,
                'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : true,
                'meta' => $data['meta'] ?? null,
            ]);

            if ($this->shouldSaveToCrm($data)) {
                $status = isset($data['crm_status']) ? (string) $data['crm_status'] : 'newly_lead';
                $this->mapSavedLeadBridgeService->createLinkedLead($user, $location, $companyId, $status);
                $location = $location->fresh();
            }

            return $location;
        });

        return $this->findForUser($user, $location, $companyId);
    }

    public function findForUser(User $user, CompanyLocation $location, ?int $companyId = null): CompanyLocation
    {
        $this->companyContextService->resolve($user, $companyId);

        return $this->globalQuery()
            ->whereKey($location->id)
            ->firstOrFail();
    }

    public function canManageLocation(User $user, CompanyLocation $location, ?int $companyId = null): bool
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        if ((int) $location->company_id !== $resolvedCompanyId) {
            return false;
        }

        return (int) $location->created_by_user_id === (int) $user->id;
    }

    public function update(User $user, CompanyLocation $location, array $data): CompanyLocation
    {
        $context = $this->companyContextService->resolve($user, $data['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $this->assertLocationInCompany($location, $companyId);
        $this->ensureCanEdit($user, $location);

        $hasAddressChange = array_key_exists('address', $data)
            && $this->normalizeAddress($data['address']) !== $this->normalizeAddress($location->address);

        $hasExplicitCoordinates = array_key_exists('latitude', $data) || array_key_exists('longitude', $data);

        if ($hasAddressChange && ! $hasExplicitCoordinates) {
            $addressToGeocode = trim((string) ($data['address'] ?? ''));

            $geocoded = $this->mapboxGeocodingService->geocodeAddress($addressToGeocode);
            if ($geocoded === null) {
                throw ValidationException::withMessages([
                    'address' => ['Unable to geocode this address. Please use a more specific address.'],
                ]);
            }

            $data['latitude'] = $geocoded['latitude'];
            $data['longitude'] = $geocoded['longitude'];
        }

        $location->update([
            'name' => $data['name'] ?? $location->name,
            'type' => array_key_exists('type', $data) ? $data['type'] : $location->type,
            'description' => array_key_exists('description', $data) ? $data['description'] : $location->description,
            'address' => array_key_exists('address', $data) ? $data['address'] : $location->address,
            'latitude' => array_key_exists('latitude', $data) && $data['latitude'] !== null ? $data['latitude'] : $location->latitude,
            'longitude' => array_key_exists('longitude', $data) && $data['longitude'] !== null ? $data['longitude'] : $location->longitude,
            'contact_number' => array_key_exists('contact_number', $data) ? $data['contact_number'] : $location->contact_number,
            'email' => array_key_exists('email', $data) ? $data['email'] : $location->email,
            'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : $location->is_active,
            'meta' => array_key_exists('meta', $data) ? $data['meta'] : $location->meta,
            'updated_by_user_id' => (int) $user->id,
        ]);

        $location = $location->fresh();

        if ($location->crm_lead_id !== null) {
            $this->mapSavedLeadBridgeService->syncLocationToLead($location);
        }

        return $this->findForUser($user, $location, $companyId);
    }

    public function delete(User $user, CompanyLocation $location, ?int $companyId = null): void
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $this->assertLocationInCompany($location, $resolvedCompanyId);
        $this->ensureCanDelete($user, $location, (string) $context['role']);

        $this->mapSavedLeadBridgeService->unlinkLocationFromLead($location);
        $location->update(['crm_lead_id' => null]);

        $location->delete();
    }

    private function globalQuery(): Builder
    {
        return CompanyLocation::query()
            ->with(['creator:id,name,email', 'updater:id,name,email']);
    }

    private function ensureCanCreate(string $role): void
    {
        if (! in_array($role, ['owner', 'admin', 'supervisor', 'agent'], true)) {
            throw ValidationException::withMessages([
                'authorization' => ['Only authenticated company members can create locations.'],
            ]);
        }
    }

    private function ensureCanEdit(User $user, CompanyLocation $location): void
    {
        if ((int) $location->created_by_user_id !== (int) $user->id) {
            throw ValidationException::withMessages([
                'authorization' => ['Only the location creator can edit this location.'],
            ]);
        }
    }

    private function normalizeAddress(mixed $address): string
    {
        return trim((string) ($address ?? ''));
    }

    private function ensureCanDelete(User $user, CompanyLocation $location, string $role): void
    {
        if (in_array($role, ['owner', 'admin'], true)) {
            return;
        }

        if (in_array($role, ['agent', 'supervisor'], true)) {
            $this->ensureCanEdit($user, $location);

            return;
        }

        throw ValidationException::withMessages([
            'authorization' => ['You are not allowed to delete this location.'],
        ]);
    }

    private function assertLocationInCompany(CompanyLocation $location, int $companyId): void
    {
        if ((int) $location->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'location' => ['The selected location is outside your company context.'],
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function shouldSaveToCrm(array $data): bool
    {
        if (! array_key_exists('save_to_crm', $data)) {
            return false;
        }

        return filter_var($data['save_to_crm'], FILTER_VALIDATE_BOOLEAN);
    }
}
