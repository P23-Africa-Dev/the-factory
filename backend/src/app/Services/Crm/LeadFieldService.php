<?php

declare(strict_types=1);

namespace App\Services\Crm;

use App\Enums\LeadFieldStatus;
use App\Enums\LeadFieldType;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\LeadFieldDefinition;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use App\Services\Notification\NotificationService;
use App\Support\LeadCustomFieldValues;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LeadFieldService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * @return Collection<int, LeadFieldDefinition>
     */
    public function list(User $user, ?int $companyId): Collection
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];
        $resolvedCompanyId = (int) $context['company']->id;

        $query = LeadFieldDefinition::query()
            ->with('creator:id,name')
            ->where('company_id', $resolvedCompanyId)
            ->orderBy('sort_order')
            ->orderBy('id');

        if (! $this->isManager($role)) {
            $query->where('status', LeadFieldStatus::ACTIVE->value);
        }

        return $query->get();
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function create(User $user, array $payload): LeadFieldDefinition
    {
        $context = $this->companyContextService->resolve($user, isset($payload['company_id']) ? (int) $payload['company_id'] : null);
        $role = (string) $context['role'];
        $this->ensureCanPropose($role);
        $companyId = (int) $context['company']->id;

        $label = LeadCustomFieldValues::titleCaseLabel((string) ($payload['label'] ?? ''));
        $type = (string) ($payload['type'] ?? '');
        $key = LeadCustomFieldValues::keyFromLabel($label);
        $options = LeadCustomFieldValues::normalizeOptions($type, $payload['options'] ?? null);
        $makeUniversal = (bool) ($payload['make_universal'] ?? false);
        $isManager = $this->isManager($role);

        $existing = LeadFieldDefinition::query()
            ->where('company_id', $companyId)
            ->where('key', $key)
            ->first();

        $reviving = $existing !== null && in_array($existing->status, [LeadFieldStatus::DECLINED, LeadFieldStatus::ARCHIVED], true);

        if ($existing !== null && ! $reviving) {
            throw ValidationException::withMessages([
                'label' => ["A lead field named \"{$existing->label}\" already exists."],
            ]);
        }

        if ($reviving && $existing->type->value !== $type) {
            throw ValidationException::withMessages([
                'type' => ["\"{$existing->label}\" already exists as a {$existing->type->value} field. Restore it instead of changing the type."],
            ]);
        }

        $counted = LeadFieldDefinition::query()
            ->where('company_id', $companyId)
            ->where('status', LeadFieldStatus::ACTIVE->value)
            ->count();

        if ($counted >= LeadCustomFieldValues::MAX_FIELDS && ! $reviving) {
            throw ValidationException::withMessages([
                'label' => ['This company already has the maximum of '.LeadCustomFieldValues::MAX_FIELDS.' lead fields.'],
            ]);
        }

        $isUniversal = $makeUniversal && $isManager;
        $universalRequestStatus = null;
        if ($makeUniversal && $isManager) {
            $universalRequestStatus = 'approved';
        } elseif ($makeUniversal && ! $isManager) {
            $universalRequestStatus = 'pending';
        }

        $attributes = [
            'label' => mb_substr($label, 0, 80),
            'description' => $this->nullableString($payload['description'] ?? null, 255),
            'options' => $options,
            'is_required' => $isUniversal && (bool) ($payload['is_required'] ?? false),
            'show_on_create' => $isUniversal,
            'show_in_list' => $isUniversal,
            'is_universal' => $isUniversal,
            'universal_request_status' => $universalRequestStatus,
            'status' => LeadFieldStatus::ACTIVE,
            'decline_reason' => null,
            'reviewed_by_user_id' => $isUniversal ? $user->id : null,
            'reviewed_at' => $isUniversal ? now() : null,
        ];

        if ($existing !== null) {
            $existing->fill($attributes);
            $existing->save();
            $field = $existing->fresh(['creator']);
        } else {
            $sortOrder = (int) LeadFieldDefinition::query()->where('company_id', $companyId)->max('sort_order');
            $field = LeadFieldDefinition::query()->create([
                ...$attributes,
                'company_id' => $companyId,
                'key' => $key,
                'type' => $type,
                'sort_order' => $sortOrder + 1,
                'created_by_user_id' => $user->id,
            ])->load('creator');
        }

        if ($field->universal_request_status === 'pending') {
            $this->notifyManagers($field, $user);
        }

        return $field;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function update(User $user, LeadFieldDefinition $field, array $payload): LeadFieldDefinition
    {
        $role = $this->assertFieldCompany($user, $field, isset($payload['company_id']) ? (int) $payload['company_id'] : null);
        $this->ensureCanManage($role);

        if (array_key_exists('type', $payload) && (string) $payload['type'] !== $field->type->value) {
            throw ValidationException::withMessages([
                'type' => ['A lead field type cannot be changed after it is created.'],
            ]);
        }

        $type = $field->type->value;
        $options = array_key_exists('options', $payload)
            ? LeadCustomFieldValues::normalizeOptions($type, $payload['options'])
            : $field->options;

        if ($field->type->usesOptions() && ($options === null || $options === [])) {
            throw ValidationException::withMessages([
                'options' => ['Select fields need at least one option.'],
            ]);
        }

        $wasUniversal = (bool) $field->is_universal;
        $isUniversal = array_key_exists('is_universal', $payload)
            ? (bool) $payload['is_universal']
            : $wasUniversal;

        $label = array_key_exists('label', $payload)
            ? LeadCustomFieldValues::titleCaseLabel((string) $payload['label'])
            : $field->label;

        $showOnCreate = $isUniversal
            ? (array_key_exists('show_on_create', $payload)
                ? (bool) $payload['show_on_create']
                : ($wasUniversal ? (bool) $field->show_on_create : true))
            : false;
        $showInList = $isUniversal
            ? (array_key_exists('show_in_list', $payload)
                ? (bool) $payload['show_in_list']
                : ($wasUniversal ? (bool) $field->show_in_list : true))
            : false;

        $attributes = [
            'label' => mb_substr($label, 0, 80),
            'description' => array_key_exists('description', $payload)
                ? $this->nullableString($payload['description'], 255)
                : $field->description,
            'options' => $field->type->usesOptions() ? $options : null,
            'is_required' => $isUniversal && (array_key_exists('is_required', $payload)
                ? (bool) $payload['is_required']
                : (bool) $field->is_required),
            'is_universal' => $isUniversal,
            'show_on_create' => $showOnCreate,
            'show_in_list' => $showInList,
        ];

        if ($isUniversal && ! $wasUniversal) {
            $attributes['universal_request_status'] = 'approved';
            $attributes['reviewed_by_user_id'] = $user->id;
            $attributes['reviewed_at'] = now();
            $attributes['decline_reason'] = null;
        } elseif (! $isUniversal && $wasUniversal) {
            $attributes['universal_request_status'] = null;
            $attributes['is_required'] = false;
        }

        $field->fill($attributes);
        $field->save();

        return $field->fresh(['creator']);
    }

    public function approve(User $user, LeadFieldDefinition $field, ?int $companyId): LeadFieldDefinition
    {
        $role = $this->assertFieldCompany($user, $field, $companyId);
        $this->ensureCanManage($role);

        $pendingUniversal = $field->universal_request_status === 'pending'
            || $field->universal_request_status === 'declined';
        $legacyPending = $field->status === LeadFieldStatus::PENDING
            || $field->status === LeadFieldStatus::DECLINED;

        if (! $pendingUniversal && ! $legacyPending) {
            throw ValidationException::withMessages([
                'status' => ['Only pending universal field requests can be approved.'],
            ]);
        }

        $counted = LeadFieldDefinition::query()
            ->where('company_id', $field->company_id)
            ->where('status', LeadFieldStatus::ACTIVE->value)
            ->whereKeyNot($field->id)
            ->count();

        if ($field->status === LeadFieldStatus::DECLINED && $counted >= LeadCustomFieldValues::MAX_FIELDS) {
            throw ValidationException::withMessages([
                'status' => ['This company already has the maximum of '.LeadCustomFieldValues::MAX_FIELDS.' lead fields.'],
            ]);
        }

        $field->fill([
            'status' => LeadFieldStatus::ACTIVE,
            'is_universal' => true,
            'show_on_create' => true,
            'show_in_list' => true,
            'universal_request_status' => 'approved',
            'decline_reason' => null,
            'reviewed_by_user_id' => $user->id,
            'reviewed_at' => now(),
        ]);
        $field->save();
        $field = $field->fresh(['creator']);

        $this->notifyCreator($field, $user, approved: true);

        return $field;
    }

    public function decline(User $user, LeadFieldDefinition $field, ?int $companyId, ?string $reason): LeadFieldDefinition
    {
        $role = $this->assertFieldCompany($user, $field, $companyId);
        $this->ensureCanManage($role);

        $pendingUniversal = $field->universal_request_status === 'pending';
        $legacyPending = $field->status === LeadFieldStatus::PENDING;

        if (! $pendingUniversal && ! $legacyPending) {
            throw ValidationException::withMessages([
                'status' => ['Only pending universal field requests can be declined.'],
            ]);
        }

        $field->fill([
            'status' => LeadFieldStatus::ACTIVE,
            'is_universal' => false,
            'show_on_create' => false,
            'show_in_list' => false,
            'universal_request_status' => 'declined',
            'decline_reason' => $this->nullableString($reason, 255),
            'reviewed_by_user_id' => $user->id,
            'reviewed_at' => now(),
        ]);
        $field->save();
        $field = $field->fresh(['creator']);

        $this->notifyCreator($field, $user, approved: false);

        return $field;
    }

    public function archive(User $user, LeadFieldDefinition $field, ?int $companyId): LeadFieldDefinition
    {
        $role = $this->assertFieldCompany($user, $field, $companyId);
        $this->ensureCanManage($role);

        if ($field->status !== LeadFieldStatus::ACTIVE) {
            throw ValidationException::withMessages([
                'status' => ['Only active lead fields can be archived.'],
            ]);
        }

        $field->fill([
            'status' => LeadFieldStatus::ARCHIVED,
            'reviewed_by_user_id' => $user->id,
            'reviewed_at' => now(),
        ]);
        $field->save();

        return $field->fresh(['creator']);
    }

    public function restore(User $user, LeadFieldDefinition $field, ?int $companyId): LeadFieldDefinition
    {
        $role = $this->assertFieldCompany($user, $field, $companyId);
        $this->ensureCanManage($role);

        if ($field->status !== LeadFieldStatus::ARCHIVED) {
            throw ValidationException::withMessages([
                'status' => ['Only archived lead fields can be restored.'],
            ]);
        }

        $counted = LeadFieldDefinition::query()
            ->where('company_id', $field->company_id)
            ->where('status', LeadFieldStatus::ACTIVE->value)
            ->count();

        if ($counted >= LeadCustomFieldValues::MAX_FIELDS) {
            throw ValidationException::withMessages([
                'status' => ['This company already has the maximum of '.LeadCustomFieldValues::MAX_FIELDS.' lead fields.'],
            ]);
        }

        $field->fill([
            'status' => LeadFieldStatus::ACTIVE,
            'decline_reason' => null,
            'reviewed_by_user_id' => $user->id,
            'reviewed_at' => now(),
        ]);
        $field->save();

        return $field->fresh(['creator']);
    }

    public function delete(User $user, LeadFieldDefinition $field, ?int $companyId): void
    {
        $role = $this->assertFieldCompany($user, $field, $companyId);
        $this->ensureCanManage($role);

        $field->delete();
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return Collection<int, LeadFieldDefinition>
     */
    public function reorder(User $user, array $payload): Collection
    {
        $context = $this->companyContextService->resolve(
            $user,
            isset($payload['company_id']) ? (int) $payload['company_id'] : null,
        );
        $this->ensureCanManage((string) $context['role']);
        $companyId = (int) $context['company']->id;

        $ids = collect($payload['ordered_ids'] ?? [])
            ->map(static fn ($id): int => (int) $id)
            ->values();

        if ($ids->isEmpty()) {
            throw ValidationException::withMessages([
                'ordered_ids' => ['Provide at least one lead field id.'],
            ]);
        }

        $existingIds = LeadFieldDefinition::query()
            ->where('company_id', $companyId)
            ->whereIn('id', $ids->all())
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->sort()
            ->values();

        $requested = $ids->unique()->sort()->values();
        if ($existingIds->all() !== $requested->all()) {
            throw ValidationException::withMessages([
                'ordered_ids' => ['One or more lead fields are outside your company context.'],
            ]);
        }

        DB::transaction(function () use ($companyId, $ids): void {
            foreach ($ids as $index => $id) {
                LeadFieldDefinition::query()
                    ->where('company_id', $companyId)
                    ->where('id', $id)
                    ->update(['sort_order' => $index + 1]);
            }
        });

        return $this->list($user, $companyId);
    }

    private function notifyManagers(LeadFieldDefinition $field, User $actor): void
    {
        $this->notificationService->notifyCompanyRoles(
            (int) $field->company_id,
            ['owner', 'admin', 'supervisor'],
            [
                'type' => 'crm.lead_field_pending',
                'category' => NotificationCategory::CRM->value,
                'title' => 'Universal lead field awaiting approval',
                'message' => "{$actor->name} requested \"{$field->label}\" as a universal lead field. It stays on their lead until you approve it for the whole company.",
                'action_url' => '/settings/crm',
                'action_route' => 'settings.crm',
                'reference_type' => 'lead_field_definition',
                'reference_id' => $field->id,
                'created_by_user_id' => $actor->id,
                'priority' => NotificationPriority::NORMAL->value,
                'metadata' => [
                    'field_key' => $field->key,
                    'field_label' => $field->label,
                    'requester_name' => $actor->name,
                ],
            ],
            [(int) $actor->id],
        );
    }

    private function notifyCreator(LeadFieldDefinition $field, User $reviewer, bool $approved): void
    {
        if ($field->created_by_user_id === null || (int) $field->created_by_user_id === (int) $reviewer->id) {
            return;
        }

        $this->notificationService->notifyUser(
            (int) $field->created_by_user_id,
            [
                'type' => $approved ? 'crm.lead_field_approved' : 'crm.lead_field_declined',
                'category' => NotificationCategory::CRM->value,
                'company_id' => (int) $field->company_id,
                'title' => $approved ? 'Universal lead field approved' : 'Universal lead field declined',
                'message' => $approved
                    ? "{$reviewer->name} approved \"{$field->label}\" as a universal lead field."
                    : "{$reviewer->name} declined making \"{$field->label}\" a universal lead field. It remains on the leads that already use it.",
                'action_url' => '/crm/leads',
                'action_route' => 'crm.leads',
                'reference_type' => 'lead_field_definition',
                'reference_id' => $field->id,
                'created_by_user_id' => $reviewer->id,
                'priority' => NotificationPriority::NORMAL->value,
                'metadata' => [
                    'field_key' => $field->key,
                    'field_label' => $field->label,
                ],
            ],
        );
    }

    private function assertFieldCompany(User $user, LeadFieldDefinition $field, ?int $companyId): string
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        if ((int) $field->company_id !== $resolvedCompanyId) {
            throw ValidationException::withMessages([
                'lead_field' => ['The selected lead field is outside your company context.'],
            ]);
        }

        return (string) $context['role'];
    }

    private function ensureCanManage(string $role): void
    {
        if (! $this->isManager($role)) {
            throw ValidationException::withMessages([
                'authorization' => ['Only owners, admins, and supervisors can review lead fields.'],
            ]);
        }
    }

    private function ensureCanPropose(string $role): void
    {
        if (! in_array($role, ['owner', 'admin', 'supervisor', 'agent'], true)) {
            throw ValidationException::withMessages([
                'authorization' => ['Only company members can add lead fields.'],
            ]);
        }
    }

    private function isManager(string $role): bool
    {
        return in_array($role, ['owner', 'admin', 'supervisor'], true);
    }

    private function nullableString(mixed $value, int $max): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : mb_substr($trimmed, 0, $max);
    }
}
