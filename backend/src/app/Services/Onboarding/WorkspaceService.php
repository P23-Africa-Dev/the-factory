<?php

namespace App\Services\Onboarding;

use App\Enums\CompanyUserRole;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Enums\WorkspaceMemberRole;
use App\Models\Company;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Notification\NotificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class WorkspaceService
{
    public function __construct(private readonly NotificationService $notificationService) {}

    /**
     * Create a workspace for the given user, attach them as owner,
     * create/attach an active company context, and complete onboarding.
     */
    public function create(User $user, array $data): Workspace
    {
        $createdCompanyId = null;

        $workspace = DB::transaction(function () use ($user, $data, &$createdCompanyId): Workspace {
            $normalizedCompanyName = trim((string) $data['company_name']);
            $normalizedCountry = strtoupper((string) $data['country']);

            /** @var Workspace $workspace */
            $workspace = Workspace::create([
                'owner_id' => $user->id,
                'name' => $normalizedCompanyName,
                'slug' => $this->generateUniqueSlug($normalizedCompanyName),
                'country' => $normalizedCountry,
                'team_size' => $data['team_size'],
                'purpose' => $data['purpose'],
                'user_type' => $data['user_type'],
            ]);

            $workspace->members()->syncWithoutDetaching([
                $user->id => [
                    'role' => WorkspaceMemberRole::OWNER->value,
                    'joined_at' => now(),
                ],
            ]);

            $company = Company::create([
                'company_id' => $this->generateUniqueCompanyId(),
                'name' => $normalizedCompanyName,
                'country' => $normalizedCountry,
                'team_size' => (string) $data['team_size'],
                'use_case' => (string) $data['purpose'],
                'status' => 'active',
                'activated_at' => now(),
            ]);

            $createdCompanyId = (int) $company->id;

            $company->users()->syncWithoutDetaching([
                $user->id => [
                    'role' => CompanyUserRole::OWNER->value,
                    'joined_at' => now(),
                ],
            ]);

            $user->update(['onboarding_completed_at' => now()]);

            return $workspace->load('members');
        });

        $this->notificationService->notifyUser((int) $user->id, [
            'company_id' => $createdCompanyId,
            'type' => 'onboarding.workspace_completed',
            'category' => NotificationCategory::ONBOARDING->value,
            'title' => 'Workspace setup completed',
            'message' => 'Your workspace onboarding has been completed successfully.',
            'reference_type' => Workspace::class,
            'reference_id' => (int) $workspace->id,
            'action_url' => '/dashboard',
            'action_route' => 'dashboard.overview',
            'priority' => NotificationPriority::HIGH->value,
            'created_by_user_id' => (int) $user->id,
            'metadata' => [
                'workspace_id' => (int) $workspace->id,
                'workspace_name' => (string) $workspace->name,
            ],
            'dedupe_key' => 'onboarding-workspace-complete:' . $workspace->id,
        ]);

        return $workspace;
    }

    private function generateUniqueSlug(string $name): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $counter = 1;

        while (Workspace::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$counter}";
            $counter++;
        }

        return $slug;
    }

    private function generateUniqueCompanyId(): string
    {
        $prefix = strtoupper((string) config('enterprise.company_id_prefix', 'FAC'));

        do {
            $candidate = $prefix . '-' . strtoupper(Str::random(8));
        } while (Company::query()->where('company_id', $candidate)->exists());

        return $candidate;
    }
}
