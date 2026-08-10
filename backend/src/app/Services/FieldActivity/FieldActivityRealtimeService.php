<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Models\FieldActivitySession;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Throwable;

class FieldActivityRealtimeService
{
    public function publishLocation(FieldActivitySession $session, FieldLocationPoint $point): void
    {
        $this->publish([
            'event' => 'field_activity.location',
            'version' => 1,
            'company_id' => (int) $session->company_id,
            'user_id' => (int) $session->user_id,
            'field_activity_session_id' => (int) $session->id,
            'latitude' => (float) $point->latitude,
            'longitude' => (float) $point->longitude,
            'movement_state' => $point->movement_state?->value,
            'recorded_at' => $point->recorded_at?->toIso8601String(),
            'occurred_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * Publishes the session's last-known position. Used when incoming samples
     * update the live location but are gated out of trail persistence, so the
     * management map still receives continuous movement updates.
     */
    public function publishLastKnownLocation(FieldActivitySession $session): void
    {
        if ($session->last_latitude === null || $session->last_longitude === null) {
            return;
        }

        $this->publish([
            'event' => 'field_activity.location',
            'version' => 1,
            'company_id' => (int) $session->company_id,
            'user_id' => (int) $session->user_id,
            'field_activity_session_id' => (int) $session->id,
            'latitude' => (float) $session->last_latitude,
            'longitude' => (float) $session->last_longitude,
            'movement_state' => $session->last_movement_state?->value,
            'recorded_at' => $session->last_recorded_at?->toIso8601String(),
            'occurred_at' => now()->toIso8601String(),
        ]);
    }

    public function publishStopCreated(FieldActivitySession $session, FieldStop $stop): void
    {
        $this->publish([
            'event' => 'field_activity.stop_created',
            'version' => 1,
            'company_id' => (int) $session->company_id,
            'user_id' => (int) $session->user_id,
            'field_activity_session_id' => (int) $session->id,
            'occurred_at' => now()->toIso8601String(),
            'stop' => [
                'id' => $stop->id,
                'field_activity_session_id' => $stop->field_activity_session_id,
                'latitude' => (float) $stop->latitude,
                'longitude' => (float) $stop->longitude,
                'address' => $stop->address,
                'duration_seconds' => (int) $stop->duration_seconds,
                'classification' => $stop->classification?->value,
                'arrived_at' => $stop->arrived_at?->toIso8601String(),
                'departed_at' => $stop->departed_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function publish(array $payload): void
    {
        try {
            $prefix = rtrim((string) config('field_activity.redis_channel_prefix', config('tracking.redis_channel_prefix', 'factory23.tracking')), '.');
            $companyId = (int) $payload['company_id'];
            $channel = "{$prefix}.company.{$companyId}";
            Redis::connection('pubsub')->publish(
                $channel,
                json_encode($payload, JSON_THROW_ON_ERROR),
            );
        } catch (Throwable $e) {
            Log::debug('field_activity.realtime_publish_failed', [
                'event' => $payload['event'] ?? null,
                'company_id' => $payload['company_id'] ?? null,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
