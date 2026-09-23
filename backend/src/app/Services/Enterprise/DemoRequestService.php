<?php

namespace App\Services\Enterprise;

use App\Enums\BillingInterval;
use App\Enums\CompanyUserRole;
use App\Enums\DemoRequestSource;
use App\Enums\DemoRequestStatus;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Enums\SubscriptionStatus;
use App\Exceptions\EnterpriseNotificationDeliveryException;
use App\Models\Admin;
use App\Models\Company;
use App\Models\CompanyDemoRequest;
use App\Models\User;
use App\Notifications\EnterpriseActivationNotification;
use App\Notifications\EnterpriseDemoRequestAdminNotification;
use App\Notifications\EnterpriseDemoRequestReceivedNotification;
use App\Services\Billing\CompanySubscriptionService;
use App\Services\Notification\NotificationService;
use App\Support\CountryCatalog;
use Carbon\Carbon;
use DomainException;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Throwable;
use Illuminate\Validation\ValidationException;

class DemoRequestService
{
    public function __construct(
        private readonly NotificationService $notificationService,
        private readonly CompanySubscriptionService $subscriptionService,
    ) {}

    public function submit(array $data): CompanyDemoRequest
    {
        $this->preventActiveDuplicate($data['email']);

        return DB::transaction(function () use ($data): CompanyDemoRequest {
            $request = CompanyDemoRequest::create([
                'full_name' => $data['full_name'],
                'email' => strtolower($data['email']),
                'phone' => $this->normalizePhone($data['phone'] ?? null),
                'company_name' => $data['company_name'],
                'country' => CountryCatalog::resolveName((string) $data['country']) ?? trim((string) $data['country']),
                'team_size' => $data['team_size'],
                'use_case' => $data['use_case'],
                'status' => DemoRequestStatus::PENDING->value,
                'source' => DemoRequestSource::WEBSITE->value,
                'requested_at' => now(),
            ]);

            $this->sendDemoRequestNotifications($request);

            return $request;
        });
    }

    public function paginateForAdmin(array $filters): Paginator
    {
        $query = CompanyDemoRequest::query()
            ->select([
                'id',
                'full_name',
                'email',
                'phone',
                'company_name',
                'team_size',
                'status',
                'source',
                'requested_at',
            ])
            ->latest('id');

        if (! empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $query->where(function ($subQuery) use ($search): void {
                $subQuery->where('full_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('company_name', 'like', "%{$search}%");
            });
        }

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        // simplePaginate avoids a COUNT(*) query per page, which is safer for large datasets.
        return $query->simplePaginate(20)->withQueryString();
    }

    /**
     * Create an admin-direct registration (no website demo request) and optionally
     * provision / activate in one step.
     */
    public function createDirectRegistration(Admin $admin, array $data): CompanyDemoRequest
    {
        $action = (string) ($data['action'] ?? 'activate');

        if (! in_array($action, ['draft', 'provision', 'activate'], true)) {
            $action = 'activate';
        }

        return DB::transaction(function () use ($admin, $data, $action): CompanyDemoRequest {
            $email = strtolower(trim((string) ($data['email'] ?? '')));
            $this->preventActiveDuplicate($email);

            $countryName = CountryCatalog::resolveName(trim((string) ($data['country'] ?? '')))
                ?? trim((string) ($data['country'] ?? ''));

            $demoRequest = CompanyDemoRequest::create([
                'full_name' => trim((string) ($data['full_name'] ?? '')),
                'email' => $email,
                'phone' => $this->normalizePhone($data['phone'] ?? null),
                'company_name' => trim((string) ($data['company_name'] ?? '')),
                'country' => $countryName,
                'team_size' => (string) ($data['team_size'] ?? ''),
                'use_case' => (string) ($data['purpose'] ?? $data['use_case'] ?? 'enterprise'),
                'registration_purpose' => (string) ($data['purpose'] ?? 'enterprise'),
                'registration_user_type' => (string) ($data['user_type'] ?? 'other'),
                'status' => DemoRequestStatus::PENDING->value,
                'source' => DemoRequestSource::ADMIN_DIRECT->value,
                'requested_at' => now(),
                'admin_notes' => $data['admin_notes'] ?? null,
                'assigned_plan_key' => $this->normalizeOptionalString($data['assigned_plan_key'] ?? null),
                'assigned_billing_interval' => $this->normalizeOptionalString($data['assigned_billing_interval'] ?? null),
            ]);

            return $this->registerFromAdmin($demoRequest, $admin, array_merge($data, [
                'action' => $action,
            ]));
        });
    }

    public function registerFromAdmin(CompanyDemoRequest $demoRequest, Admin $admin, array $data): CompanyDemoRequest
    {
        $action = (string) ($data['action'] ?? 'activate');

        return DB::transaction(function () use ($demoRequest, $admin, $data, $action): CompanyDemoRequest {
            $registration = $this->resolveAdminRegistrationData($demoRequest, $data);
            $companyCountryCode = CountryCatalog::resolveCode($registration['country']);

            if ($companyCountryCode === null) {
                throw ValidationException::withMessages([
                    'country' => ['Country must be a valid country name.'],
                ]);
            }

            $alreadyPaid = $this->wantsAlreadyPaid($data);
            $paymentStartDate = $this->resolvePaymentStartDate($data, $alreadyPaid);

            if ($alreadyPaid) {
                $this->assertOfflinePaymentFields($registration);
            }

            $demoRequest->fill([
                'full_name' => $registration['full_name'],
                'email' => $registration['email'],
                'phone' => $registration['phone'],
                'company_name' => $registration['company_name'],
                'country' => $registration['country'],
                'team_size' => $registration['team_size'],
                'use_case' => $registration['purpose'],
                'registration_purpose' => $registration['purpose'],
                'registration_user_type' => $registration['user_type'],
                'reviewed_by_admin_id' => $admin->id,
                'reviewed_at' => now(),
                'admin_notes' => $registration['admin_notes'],
                'assigned_plan_key' => $registration['assigned_plan_key'],
                'assigned_billing_interval' => $registration['assigned_billing_interval'],
            ]);

            if ($action === 'draft') {
                $demoRequest->fill([
                    'status' => DemoRequestStatus::DRAFT->value,
                    'approved_at' => null,
                    'activated_at' => null,
                    'activation_token_hash' => null,
                    'activation_link_expires_at' => null,
                    'last_activation_sent_at' => null,
                ]);

                // Preserve an already-provisioned company/user; only clear when none exists yet.
                if (! $demoRequest->company_id) {
                    $demoRequest->fill([
                        'company_id' => null,
                        'user_id' => null,
                    ]);
                }

                $demoRequest->save();

                return $demoRequest->fresh(['company', 'user', 'reviewedByAdmin']);
            }

            $this->assertEnterpriseEmailEligible($registration['email'], $demoRequest->user_id);

            [$company, $user] = $this->provisionCompanyAndOwner(
                demoRequest: $demoRequest,
                registration: $registration,
                companyCountryCode: $companyCountryCode,
            );

            if ($alreadyPaid && $paymentStartDate !== null) {
                $this->subscriptionService->activateOfflinePayment(
                    company: $company,
                    planKey: (string) $registration['assigned_plan_key'],
                    interval: BillingInterval::from((string) $registration['assigned_billing_interval']),
                    periodStart: $paymentStartDate,
                );
                $company = $company->fresh();
            }

            $demoRequest->fill([
                'company_id' => $company->id,
                'user_id' => $user->id,
            ]);

            if ($action === 'provision') {
                $demoRequest->fill([
                    'status' => DemoRequestStatus::PROVISIONED->value,
                    'approved_at' => null,
                    'activated_at' => null,
                    'activation_token_hash' => null,
                    'activation_link_expires_at' => null,
                    'last_activation_sent_at' => null,
                ])->save();

                return $demoRequest->fresh(['company', 'user', 'reviewedByAdmin']);
            }

            // activate (default): send activation email
            $plainToken = Str::random(64);
            $expiresAt = now()->addMinutes(config('enterprise.activation_link_ttl_minutes'));

            $demoRequest->fill([
                'status' => DemoRequestStatus::APPROVED->value,
                'approved_at' => now(),
                'activation_token_hash' => hash('sha256', $plainToken),
                'activation_link_expires_at' => $expiresAt,
                'last_activation_sent_at' => now(),
                'activated_at' => null,
            ])->save();

            $activationLink = $this->buildActivationLink(
                demoRequest: $demoRequest,
                plainToken: $plainToken,
                email: $registration['email'],
                companyPublicId: $company->company_id,
            );

            $this->sendActivationNotification(
                user: $user,
                companyId: $company->company_id,
                email: $registration['email'],
                onboardingLink: $activationLink,
            );

            $this->notificationService->notifyUser((int) $user->id, [
                'company_id' => (int) $company->id,
                'type' => 'onboarding.enterprise_activation_sent',
                'category' => NotificationCategory::ONBOARDING->value,
                'title' => 'Enterprise activation ready',
                'message' => 'Your enterprise activation link is ready. Complete setup to access your workspace.',
                'reference_type' => CompanyDemoRequest::class,
                'reference_id' => (int) $demoRequest->id,
                'action_url' => '/enterprise/onboarding',
                'action_route' => 'enterprise.onboarding.complete',
                'priority' => NotificationPriority::HIGH->value,
                'created_by_user_id' => (int) $user->id,
                'metadata' => [
                    'demo_request_id' => (int) $demoRequest->id,
                    'company_id' => (int) $company->id,
                ],
                'dedupe_key' => 'enterprise-activation-sent:' . $demoRequest->id,
            ]);

            return $demoRequest->fresh(['company', 'user', 'reviewedByAdmin']);
        });
    }

    /**
     * @param  array{
     *     full_name: string,
     *     email: string,
     *     phone: ?string,
     *     company_name: string,
     *     country: string,
     *     team_size: string,
     *     purpose: string,
     *     user_type: string,
     *     admin_notes: mixed,
     *     assigned_plan_key: ?string,
     *     assigned_billing_interval: ?string
     * }  $registration
     * @return array{0: Company, 1: User}
     */
    private function provisionCompanyAndOwner(
        CompanyDemoRequest $demoRequest,
        array $registration,
        string $companyCountryCode,
    ): array {
        $company = $demoRequest->company;

        if (! $company) {
            $company = Company::create([
                'company_id' => $this->generateUniqueCompanyId(),
                'name' => $registration['company_name'],
                'country' => $companyCountryCode,
                'team_size' => $registration['team_size'],
                'use_case' => $registration['purpose'],
                'status' => 'active',
                'activated_at' => now(),
                'assigned_plan_key' => $registration['assigned_plan_key'],
                'assigned_billing_interval' => $registration['assigned_billing_interval'],
                'subscription_status' => SubscriptionStatus::PENDING_PAYMENT->value,
            ]);
        } else {
            $company->update([
                'name' => $registration['company_name'],
                'country' => $companyCountryCode,
                'team_size' => $registration['team_size'],
                'use_case' => $registration['purpose'],
                'status' => 'active',
                'activated_at' => $company->activated_at ?? now(),
                'assigned_plan_key' => $registration['assigned_plan_key'],
                'assigned_billing_interval' => $registration['assigned_billing_interval'],
                'subscription_status' => $company->hasPaidSubscription()
                    ? $company->subscription_status
                    : SubscriptionStatus::PENDING_PAYMENT->value,
            ]);
        }

        $user = User::firstOrCreate(
            ['email' => $registration['email']],
            [
                'name' => $registration['full_name'],
                'password' => Str::password(32),
                'is_active' => true,
            ],
        );

        $user->update([
            'name' => $registration['full_name'],
            'is_active' => true,
        ]);

        $company->users()->syncWithoutDetaching([
            $user->id => [
                'role' => CompanyUserRole::OWNER->value,
                'joined_at' => now(),
            ],
        ]);

        return [$company->fresh(), $user->fresh()];
    }

    private function wantsAlreadyPaid(array $data): bool
    {
        $value = $data['already_paid'] ?? false;

        return filter_var($value, FILTER_VALIDATE_BOOLEAN) || $value === '1' || $value === 1;
    }

    private function resolvePaymentStartDate(array $data, bool $alreadyPaid): ?Carbon
    {
        if (! $alreadyPaid) {
            return null;
        }

        $raw = trim((string) ($data['payment_start_date'] ?? ''));

        if ($raw === '') {
            throw ValidationException::withMessages([
                'payment_start_date' => ['Payment start date is required when marking as already paid.'],
            ]);
        }

        try {
            return Carbon::parse($raw)->startOfDay();
        } catch (Throwable) {
            throw ValidationException::withMessages([
                'payment_start_date' => ['Payment start date must be a valid date.'],
            ]);
        }
    }

    /**
     * @param  array{assigned_plan_key: ?string, assigned_billing_interval: ?string}  $registration
     */
    private function assertOfflinePaymentFields(array $registration): void
    {
        if ($registration['assigned_plan_key'] === null || $registration['assigned_plan_key'] === '') {
            throw ValidationException::withMessages([
                'assigned_plan_key' => ['A subscription plan is required when marking as already paid.'],
            ]);
        }

        if ($registration['assigned_billing_interval'] === null || $registration['assigned_billing_interval'] === '') {
            throw ValidationException::withMessages([
                'assigned_billing_interval' => ['A billing interval is required when marking as already paid.'],
            ]);
        }
    }

    private function sendDemoRequestNotifications(CompanyDemoRequest $request): void
    {
        try {
            Notification::route('mail', $request->email)
                ->notify(new EnterpriseDemoRequestReceivedNotification($request->full_name, $request->company_name));
        } catch (Throwable $e) {
            Log::error('Enterprise demo confirmation delivery failed.', [
                'email' => $request->email,
                'request_id' => $request->id,
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);

            throw new EnterpriseNotificationDeliveryException(
                message: 'Unable to deliver demo request confirmation right now. Please try again shortly.',
                emails: [$request->email],
                previous: $e,
            );
        }

        $adminEmail = (string) config('enterprise.notification_email');

        if ($adminEmail === '') {
            return;
        }

        try {
            Notification::route('mail', $adminEmail)
                ->notify(new EnterpriseDemoRequestAdminNotification([
                    'full_name' => $request->full_name,
                    'email' => $request->email,
                    'phone' => $request->phone,
                    'company_name' => $request->company_name,
                    'country' => $request->country,
                    'team_size' => $request->team_size,
                    'use_case' => $request->use_case,
                ]));
        } catch (Throwable $e) {
            Log::error('Enterprise demo admin notification delivery failed.', [
                'email' => $adminEmail,
                'request_id' => $request->id,
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);

            throw new EnterpriseNotificationDeliveryException(
                message: 'Unable to notify the operations team right now. Please try again shortly.',
                emails: [$adminEmail],
                previous: $e,
            );
        }
    }

    private function sendActivationNotification(User $user, string $companyId, string $email, string $onboardingLink): void
    {
        try {
            $user->notify(new EnterpriseActivationNotification(
                companyId: $companyId,
                email: $email,
                onboardingLink: $onboardingLink,
            ));
        } catch (Throwable $e) {
            Log::error('Enterprise activation delivery failed.', [
                'email' => $email,
                'user_id' => $user->id,
                'company_id' => $companyId,
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);

            throw new EnterpriseNotificationDeliveryException(
                message: 'Unable to deliver the enterprise activation email right now. Please retry activation shortly.',
                emails: [$email],
                previous: $e,
            );
        }
    }

    private function buildActivationLink(CompanyDemoRequest $demoRequest, string $plainToken, string $email, string $companyPublicId): string
    {
        $baseUrl = trim((string) config('enterprise.onboarding_setup_url', ''));

        if ($baseUrl === '') {
            $frontendUrl = trim((string) (config('enterprise.frontend_url') ?: 'http://localhost:3000'));
            $setupPathValue = trim((string) (config('enterprise.onboarding_setup_path') ?: '/enterprise/setup'));
            $setupPath = '/' . ltrim($setupPathValue, '/');

            if ($frontendUrl !== '') {
                $baseUrl = rtrim($frontendUrl, '/') . $setupPath;
            }
        }

        if ($baseUrl === '' || ! filter_var($baseUrl, FILTER_VALIDATE_URL)) {
            Log::error('Enterprise onboarding setup URL is invalid or missing.', [
                'configured_onboarding_setup_url' => config('enterprise.onboarding_setup_url'),
                'configured_frontend_url' => config('enterprise.frontend_url'),
                'configured_onboarding_setup_path' => config('enterprise.onboarding_setup_path'),
                'request_id' => $demoRequest->id,
            ]);

            throw new EnterpriseNotificationDeliveryException(
                message: 'Enterprise onboarding setup URL is not configured correctly. Please contact support.',
                emails: [$email],
            );
        }

        $query = http_build_query([
            'request_id' => $demoRequest->id,
            'token' => $plainToken,
            'email' => $email,
            'company_id' => $companyPublicId,
        ]);

        $separator = parse_url($baseUrl, PHP_URL_QUERY) === null ? '?' : '&';

        return $baseUrl . $separator . $query;
    }

    public function resolveValidApprovedRequestForFirstTimeSetup(int $requestId, string $token): CompanyDemoRequest
    {
        $demoRequest = CompanyDemoRequest::query()
            ->with(['company', 'user'])
            ->where('id', $requestId)
            ->first();

        if (! $demoRequest || ! $demoRequest->isApproved()) {
            throw ValidationException::withMessages([
                'request_id' => ['Onboarding request is not available or not approved.'],
            ]);
        }

        if (! $demoRequest->activation_token_hash || ! hash_equals($demoRequest->activation_token_hash, hash('sha256', $token))) {
            throw ValidationException::withMessages([
                'token' => ['Onboarding token is invalid.'],
            ]);
        }

        if (! $demoRequest->activation_link_expires_at || $demoRequest->activation_link_expires_at->isPast()) {
            throw ValidationException::withMessages([
                'token' => ['Onboarding link has expired. Please contact support or request a new activation link.'],
            ]);
        }

        return $demoRequest;
    }

    private function preventActiveDuplicate(string $email): void
    {
        $exists = CompanyDemoRequest::where('email', strtolower($email))
            ->whereIn('status', [
                DemoRequestStatus::PENDING->value,
                DemoRequestStatus::DRAFT->value,
                DemoRequestStatus::PROVISIONED->value,
                DemoRequestStatus::APPROVED->value,
            ])
            ->exists();

        if ($exists) {
            throw new DomainException('A pending enterprise request already exists for this email.');
        }
    }

    private function resolveAdminRegistrationData(CompanyDemoRequest $demoRequest, array $data): array
    {
        return [
            'full_name' => trim((string) ($data['full_name'] ?? $demoRequest->full_name)),
            'email' => strtolower(trim((string) ($data['email'] ?? $demoRequest->email))),
            'phone' => $this->normalizePhone($data['phone'] ?? $demoRequest->phone),
            'company_name' => trim((string) ($data['company_name'] ?? $demoRequest->company_name)),
            'country' => CountryCatalog::resolveName(trim((string) ($data['country'] ?? $demoRequest->country)))
                ?? trim((string) ($data['country'] ?? $demoRequest->country)),
            'team_size' => (string) ($data['team_size'] ?? $demoRequest->team_size),
            'purpose' => (string) ($data['purpose'] ?? $demoRequest->registration_purpose ?? $demoRequest->use_case),
            'user_type' => (string) ($data['user_type'] ?? $demoRequest->registration_user_type ?? 'other'),
            'admin_notes' => $data['admin_notes'] ?? $demoRequest->admin_notes,
            'assigned_plan_key' => $this->normalizeOptionalString($data['assigned_plan_key'] ?? $demoRequest->assigned_plan_key),
            'assigned_billing_interval' => $this->normalizeOptionalString($data['assigned_billing_interval'] ?? $demoRequest->assigned_billing_interval),
        ];
    }

    private function normalizeOptionalString(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    private function assertEnterpriseEmailEligible(string $email, ?int $currentUserId): void
    {
        $candidate = User::query()->where('email', strtolower($email))->first();

        if (! $candidate) {
            return;
        }

        if ($currentUserId && $candidate->id === $currentUserId) {
            return;
        }

        if ($candidate->internal_role !== null) {
            throw ValidationException::withMessages([
                'email' => ['This email belongs to an internal account and cannot be used for enterprise onboarding.'],
            ]);
        }
    }

    private function normalizePhone(mixed $phone): ?string
    {
        $normalized = trim((string) ($phone ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    private function generateUniqueCompanyId(): string
    {
        $prefix = strtoupper((string) config('enterprise.company_id_prefix', 'FAC'));

        do {
            $candidate = $prefix . '-' . strtoupper(Str::random(8));
        } while (Company::where('company_id', $candidate)->exists());

        return $candidate;
    }
}
