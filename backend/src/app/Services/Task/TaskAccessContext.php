<?php

declare(strict_types=1);

namespace App\Services\Task;

use App\Models\Company;

class TaskAccessContext
{
    public function __construct(
        public readonly Company $company,
        public readonly string $role,
    ) {}

    public function canManageTasks(): bool
    {
        return $this->canViewFleetLocations();
    }

    /**
     * Who can see every agent's live location for the company.
     * Keep this aligned with canManageTasks so route + fleet map authz match.
     */
    public function canViewFleetLocations(): bool
    {
        return in_array($this->role, config('tracking.fleet_viewer_roles', ['owner', 'admin', 'supervisor']), true);
    }

    public function canViewProofFiles(): bool
    {
        return in_array($this->role, ['owner', 'admin'], true);
    }

    public function isAgent(): bool
    {
        return $this->role === 'agent';
    }
}
