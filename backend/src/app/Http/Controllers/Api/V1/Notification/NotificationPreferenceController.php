<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Notification;

use App\Http\Controllers\Controller;
use App\Http\Requests\Notification\NotificationPreferencesRequest;
use App\Http\Requests\Notification\UpdateNotificationPreferencesRequest;
use App\Http\Resources\NotificationPreferenceResource;
use App\Models\NotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class NotificationPreferenceController extends Controller
{
    public function index(NotificationPreferencesRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');

        if ($companyId !== null) {
            $this->ensureCompanyMembership((int) $request->user()->id, (int) $companyId);
        }

        $preferences = NotificationPreference::query()
            ->where('user_id', $request->user()->id)
            ->when($companyId !== null, function ($query) use ($companyId): void {
                $query->where(function ($sub) use ($companyId): void {
                    $sub->whereNull('company_id')->orWhere('company_id', (int) $companyId);
                });
            }, fn($query) => $query->whereNull('company_id'))
            ->orderBy('category')
            ->get();

        return $this->success(
            message: 'Notification preferences fetched successfully.',
            data: [
                'items' => NotificationPreferenceResource::collection($preferences),
            ],
        );
    }

    public function update(UpdateNotificationPreferencesRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');

        if ($companyId !== null) {
            $this->ensureCompanyMembership((int) $request->user()->id, (int) $companyId);
        }

        $updated = collect($request->validated('preferences'))->map(function (array $preference) use ($request, $companyId) {
            return NotificationPreference::query()->updateOrCreate(
                [
                    'user_id' => $request->user()->id,
                    'company_id' => $companyId !== null ? (int) $companyId : null,
                    'category' => (string) $preference['category'],
                ],
                [
                    'is_enabled' => $preference['is_enabled'] ?? true,
                    'in_app_enabled' => $preference['in_app_enabled'] ?? true,
                    'push_enabled' => $preference['push_enabled'] ?? true,
                    'email_enabled' => $preference['email_enabled'] ?? true,
                    'muted_until' => $preference['muted_until'] ?? null,
                    'quiet_hours' => $preference['quiet_hours'] ?? null,
                    'digest_mode' => $preference['digest_mode'] ?? null,
                ],
            );
        })->values();

        return $this->success(
            message: 'Notification preferences updated successfully.',
            data: [
                'items' => NotificationPreferenceResource::collection($updated),
            ],
        );
    }

    private function ensureCompanyMembership(int $userId, int $companyId): void
    {
        $isMember = DB::table('company_users')
            ->where('user_id', $userId)
            ->where('company_id', $companyId)
            ->exists();

        if (! $isMember) {
            throw ValidationException::withMessages([
                'company_id' => ['You are not attached to the selected company context.'],
            ]);
        }
    }
}
