<?php

declare(strict_types=1);

namespace App\Services\AI\Admin;

use App\Models\AiAlert;
use Illuminate\Support\Facades\Schema;

class AiAlertService
{
    /**
     * @param  array<string, mixed>  $healthResult
     */
    public function syncProviderAlert(array $healthResult): void
    {
        if (! $this->alertsTableAvailable()) {
            return;
        }

        $provider = (string) ($healthResult['provider'] ?? '');
        $status = (string) ($healthResult['status'] ?? '');
        $ok = (bool) ($healthResult['ok'] ?? false);

        if ($ok || $provider === '') {
            AiAlert::query()
                ->where('provider', $provider)
                ->where('status', 'active')
                ->whereIn('type', ['provider_health', 'quota_exceeded', 'auth_failed', 'rate_limited'])
                ->update([
                    'status' => 'resolved',
                    'resolved_at' => now(),
                ]);

            return;
        }

        $type = match ($status) {
            'auth_failed' => 'auth_failed',
            'quota_exceeded' => 'quota_exceeded',
            'rate_limited' => 'rate_limited',
            default => 'provider_health',
        };

        $severity = in_array($status, ['auth_failed', 'quota_exceeded'], true) ? 'critical' : 'warning';
        $title = match ($status) {
            'auth_failed' => ucfirst($provider) . ' API key invalid or revoked.',
            'quota_exceeded' => ucfirst($provider) . ' billing limit or credits exhausted.',
            'rate_limited' => ucfirst($provider) . ' rate limit exceeded.',
            'not_configured' => ucfirst($provider) . ' is not configured.',
            default => ucfirst($provider) . ' provider health issue detected.',
        };

        $existing = AiAlert::query()
            ->where('provider', $provider)
            ->where('type', $type)
            ->where('status', 'active')
            ->first();

        if ($existing !== null) {
            $existing->update([
                'message' => (string) ($healthResult['message'] ?? $title),
                'meta' => $healthResult,
            ]);

            return;
        }

        AiAlert::query()->create([
            'type' => $type,
            'provider' => $provider,
            'severity' => $severity,
            'title' => $title,
            'message' => (string) ($healthResult['message'] ?? $title),
            'status' => 'active',
            'meta' => $healthResult,
        ]);
    }

    /**
     * @return array<int, AiAlert>
     */
    public function activeAlerts(int $limit = 10): array
    {
        if (! $this->alertsTableAvailable()) {
            return [];
        }

        return AiAlert::query()
            ->where('status', 'active')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->all();
    }

    public function resolve(int $alertId): void
    {
        if (! $this->alertsTableAvailable()) {
            return;
        }

        AiAlert::query()->whereKey($alertId)->update([
            'status' => 'resolved',
            'resolved_at' => now(),
        ]);
    }

    public function syncSpendingAlert(float $monthlyCostUsd, float $threshold): void
    {
        if (! $this->alertsTableAvailable()) {
            return;
        }

        $title = 'Excessive AI spending detected.';
        $message = sprintf(
            'Estimated monthly AI cost $%s exceeds alert threshold $%s.',
            number_format($monthlyCostUsd, 2),
            number_format($threshold, 2),
        );

        $existing = AiAlert::query()
            ->where('type', 'excessive_spending')
            ->where('status', 'active')
            ->first();

        if ($existing !== null) {
            $existing->update([
                'message' => $message,
                'meta' => ['monthly_cost_usd' => $monthlyCostUsd, 'threshold_usd' => $threshold],
            ]);

            return;
        }

        AiAlert::query()->create([
            'type' => 'excessive_spending',
            'provider' => null,
            'severity' => 'warning',
            'title' => $title,
            'message' => $message,
            'status' => 'active',
            'meta' => ['monthly_cost_usd' => $monthlyCostUsd, 'threshold_usd' => $threshold],
        ]);
    }

    private function alertsTableAvailable(): bool
    {
        try {
            return Schema::hasTable('ai_alerts');
        } catch (\Throwable) {
            return false;
        }
    }
}
