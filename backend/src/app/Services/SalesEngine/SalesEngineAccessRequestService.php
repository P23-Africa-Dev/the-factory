<?php

namespace App\Services\SalesEngine;

use App\Enums\SalesEngineAccessRequestStatus;
use App\Models\Admin;
use App\Models\SalesEngineAccessRequest;
use App\Models\User;
use App\Notifications\SalesEngineAccessRequestAdminNotification;
use DomainException;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use RuntimeException;

class SalesEngineAccessRequestService
{
    /**
     * Latest request for this user (any status), or null.
     */
    public function latestForUser(User $user): ?SalesEngineAccessRequest
    {
        return SalesEngineAccessRequest::query()
            ->where('user_id', $user->id)
            ->latest('id')
            ->first();
    }

    /**
     * Status payload for the Sales Engine gate UI.
     *
     * @return array{status: string, request: SalesEngineAccessRequest|null}
     */
    public function statusForUser(User $user): array
    {
        $request = $this->latestForUser($user);

        if (! $request) {
            return ['status' => 'none', 'request' => null];
        }

        return [
            'status' => $request->status,
            'request' => $request,
        ];
    }

    /**
     * Create a pending access request (idempotent while one is already pending).
     *
     * @param  array{company_id?: int|null, company_name?: string|null}  $context
     */
    public function submit(User $user, array $context = []): SalesEngineAccessRequest
    {
        $existing = SalesEngineAccessRequest::query()
            ->where('user_id', $user->id)
            ->where('status', SalesEngineAccessRequestStatus::PENDING->value)
            ->latest('id')
            ->first();

        if ($existing) {
            return $existing;
        }

        if ($this->latestForUser($user)?->isApproved()) {
            throw new DomainException('Sales Engine access has already been approved for this user.');
        }

        $companyName = $context['company_name'] ?? null;
        $companyId = isset($context['company_id']) ? (int) $context['company_id'] : null;

        $request = SalesEngineAccessRequest::query()->create([
            'user_id' => $user->id,
            'company_id' => $companyId ?: null,
            'email' => (string) $user->email,
            'name' => (string) ($user->name ?? $user->email),
            'company_name' => $companyName,
            'status' => SalesEngineAccessRequestStatus::PENDING->value,
            'requested_at' => now(),
        ]);

        $this->notifyOps($request);

        return $request;
    }

    /**
     * @param  array{search?: string, status?: string}  $filters
     */
    public function paginateForAdmin(array $filters = []): LengthAwarePaginator
    {
        $query = SalesEngineAccessRequest::query()
            ->with(['user', 'company', 'reviewedByAdmin'])
            ->latest('id');

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $query->where(function ($q) use ($search): void {
                $q->where('email', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('company_name', 'like', "%{$search}%");
            });
        }

        $status = trim((string) ($filters['status'] ?? ''));
        if ($status !== '' && in_array($status, SalesEngineAccessRequestStatus::values(), true)) {
            $query->where('status', $status);
        }

        return $query->paginate(20)->withQueryString();
    }

    public function approve(SalesEngineAccessRequest $request, Admin $admin, ?string $notes = null): SalesEngineAccessRequest
    {
        if ($request->isApproved()) {
            return $request;
        }

        if (! $request->isPending() && ! $request->isDeclined()) {
            throw new DomainException('Only pending or declined requests can be approved.');
        }

        $this->provisionOnSalesEngine($request);

        $request->update([
            'status' => SalesEngineAccessRequestStatus::APPROVED->value,
            'reviewed_by_admin_id' => $admin->id,
            'reviewed_at' => now(),
            'admin_notes' => $notes ?? $request->admin_notes,
        ]);

        return $request->fresh(['user', 'company', 'reviewedByAdmin']);
    }

    public function decline(SalesEngineAccessRequest $request, Admin $admin, ?string $notes = null): SalesEngineAccessRequest
    {
        if ($request->isDeclined()) {
            return $request;
        }

        if ($request->isApproved()) {
            throw new DomainException('Approved requests cannot be declined. Revoke access from Sales Engine separately if needed.');
        }

        $request->update([
            'status' => SalesEngineAccessRequestStatus::DECLINED->value,
            'reviewed_by_admin_id' => $admin->id,
            'reviewed_at' => now(),
            'admin_notes' => $notes ?? $request->admin_notes,
        ]);

        return $request->fresh(['user', 'company', 'reviewedByAdmin']);
    }

    private function notifyOps(SalesEngineAccessRequest $request): void
    {
        $email = trim((string) config('services.sales_engine.access_request_notify_email'));
        if ($email === '') {
            Log::warning('Sales Engine access request created but notify email is not configured.', [
                'request_id' => $request->id,
            ]);

            return;
        }

        try {
            Notification::route('mail', $email)->notify(new SalesEngineAccessRequestAdminNotification([
                'name' => $request->name,
                'email' => $request->email,
                'company_name' => $request->company_name,
                'user_id' => $request->user_id,
                'request_id' => $request->id,
            ]));
        } catch (\Throwable $e) {
            Log::error('Failed to send Sales Engine access request notification.', [
                'request_id' => $request->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function provisionOnSalesEngine(SalesEngineAccessRequest $request): void
    {
        $baseUrl = rtrim((string) config('services.sales_engine.api_url'), '/');
        $token = trim((string) config('services.sales_engine.internal_token'));

        if ($baseUrl === '' || $token === '') {
            throw new RuntimeException(
                'Sales Engine provision is not configured (SALES_ENGINE_API_URL / SALES_ENGINE_INTERNAL_TOKEN).'
            );
        }

        $user = $request->user;
        if (! $user) {
            throw new DomainException('Access request has no associated user.');
        }

        $url = $baseUrl.'/api/v1/auth/factory23/provision';

        $response = Http::timeout(30)
            ->withHeaders([
                'Accept' => 'application/json',
                'X-Internal-Token' => $token,
            ])
            ->post($url, [
                'sub' => (string) $user->id,
                'email' => (string) $user->email,
                'name' => (string) ($user->name ?? $user->email),
                'company_id' => $request->company_id ? (string) $request->company_id : null,
                'company_name' => $request->company_name,
            ]);

        if (! $response->successful()) {
            Log::error('Sales Engine provision failed.', [
                'request_id' => $request->id,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            throw new RuntimeException(
                'Failed to provision Sales Engine account: '.$response->json('message', 'HTTP '.$response->status())
            );
        }
    }
}
