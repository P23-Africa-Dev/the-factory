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
            ->where('company_id', $resolvedCompanyId)
            ->orderBy('sort_order')
            ->orderBy('id');

        if (! $this->isManager($role)) {
            $query->whereIn('status', [LeadFieldStatus::ACTIVE->value, LeadFieldStatus::PENDING->value]);
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

        $label = trim((string) ($payload['label'] ?? ''));
        $type = (string) ($payload['type'] ?? '');
        $key = LeadCustomFieldValues::keyFromLabel($label);
        $options = LeadCustomFieldValues::normalizeOptions($type, $payload['options'] ?? null);

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
            ->whereIn('status', [LeadFieldStatus::ACTIVE->value, LeadFieldStatus::PENDING->value])
            ->count();

        if ($counted >= LeadCustomFieldValues::MAX_FIELDS) {
            throw ValidationException::withMessages([
                'label' => ['This company already has the maximum of '.LeadCustomFieldValues::MAX_FIELDS.' lead fields.'],
            ]);
        }

        $status = $this->isManager($role) ? LeadFieldStatus::ACTIVE : LeadFieldStatus::PENDING;
        $attributes = [
            'label' => mb_substr($label, 0, 80),
            'description' => $this->nullableString($payload['description'] ?? null, 255),
            'options' => $options,
            'is_required' => (bool) ($payload['is_required'] ?? false),
            'show_on_create' => array_key_exists('show_on_create', $payload) ? (bool) $payload['show_on_create'] : true,
            'show_in_list' => array_key_exists('show_in_list', $payload) ? (bool) $payload['show_in_list'] : true,
            'status' => $status,
            'decline_reason' => null,
            'reviewed_by_user_id' => $status === LeadFieldStatus::ACTIVE ? $user->id : null,
            'reviewed_at' => $status === LeadFieldStatus::ACTIVE ? now() : null,
        ];

        if ($existing !== null) {
            $existing->fill($attributes);
            $existing->save();
            $field = $existing->fresh();
        } else {
            $sortOrder = (int) LeadFieldDefinition::query()->where('company_id', $companyId)->max('sort_order');
            $field = LeadFieldDefinition::query()->create([
                ...$attributes,
                'company_id' => $companyId,
                'key' => $key,
                'type' => $type,
                'sort_order' => $sortOrder + 1,
                'created_by_user_id' => $user->id,
            ]);
        }

        if ($field->status === LeadFieldStatus::PENDING) {
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

        $field->fill([
            'label' => array_key_exists('label', $payload)
                ? mb_substr(trim((string) $payload['label']), 0, 80)
                : $field->label,
            'description' => array_key_exists('description', $payload)
                ? $this->nullableString($payload['description'], 255)
                : $field->description,
            'options' => $field->type->usesOptions() ? $options : null,
            'is_required' => array_key_exists('is_required', $payload) ? (bool) $payload['is_required'] : $field->is_required,
            'show_on_create' => array_key_exists('show_on_create', $payload) ? (bool) $payload['show_on_create'] : $field->show_on_create,
            'show_in_list' => array_key_exists('show_in_list', $payload) ? (bool) $payload['show_in_list'] : $field->show_in_list,
        ]);
        $field->save();

        return $field->fresh();
    }

    public function approve(User $user, LeadFieldDefinition $field, ?int $companyId): LeadFieldDefinition
    {
        $role = $this->assertFieldCompany($user, $field, $companyId);
        $this->ensureCanManage($role);

        if (! in_array($field->status, [LeadFieldStatus::PENDING, LeadFieldStatus::DECLINED], true)) {
            throw ValidationException::withMessages([
                'status' => ['Only pending or declined lead fields can be approved.'],
            ]);
        }

        $counted = LeadFieldDefinition::query()
            ->where('company_id', $field->company_id)
            ->whereIn('status', [LeadFieldStatus::ACTIVE->value, LeadFieldStatus::PENDING->value])
            ->whereKeyNot($field->id)
            ->count();

        if ($field->status === LeadFieldStatus::DECLINED && $counted >= LeadCustomFieldValues::MAX_FIELDS) {
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

        return $field->fresh();
    }

    public function decline(User $user, LeadFieldDefinition $field, ?int $companyId, ?string $reason): LeadFieldDefinition
    {
        $role = $this->assertFieldCompany($user, $field, $companyId);
        $this->ensureCanManage($role);

        if ($field->status !== LeadFieldStatus::PENDING) {
            throw ValidationException::withMessages([
                'status' => ['Only pending lead fields can be declined.'],
            ]);
        }

        $field->fill([
            'status' => LeadFieldStatus::DECLINED,
            'decline_reason' => $this->nullableString($reason, 255),
            'reviewed_by_user_id' => $user->id,
            'reviewed_at' => now(),
        ]);
        $field->save();

        return $field->fresh();
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

        return $field->fresh();
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
            ->whereIn('status', [LeadFieldStatus::ACTIVE->value, LeadFieldStatus::PENDING->value])
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

        return $field->fresh();
    }

    private function notifyManagers(LeadFieldDefinition $field, User $actor): void
    {
        $this->notificationService->notifyCompanyRoles(
            (int) $field->company_id,
            ['owner', 'admin', 'supervisor'],
            [
                'type' => 'crm.lead_field_pending',
                'category' => NotificationCategory::CRM->value,
                'title' => 'Lead field awaiting approval',
                'message' => "{$actor->name} added the lead field \"{$field->label}\". Review it in CRM settings.",
                'action_url' => '/settings/crm',
                'action_route' => 'settings.crm',
                'reference_type' => 'lead_field_definition',
                'reference_id' => $field->id,
                'created_by_user_id' => $actor->id,
                'priority' => NotificationPriority::NORMAL->value,
                'metadata' => [
                    'field_key' => $field->key,
                    'field_label' => $field->label,
                ],
            ],
            [(int) $actor->id],
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
