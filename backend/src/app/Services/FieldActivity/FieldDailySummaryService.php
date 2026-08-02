<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Models\FieldActivitySession;
use App\Models\FieldDailySummary;
use App\Models\FieldStop;
use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

class FieldDailySummaryService
{
    public function __construct(
        private readonly AiProviderRouter $aiProviderRouter,
    ) {}

    public function buildForSession(FieldActivitySession $session, bool $withNarrative = false): FieldDailySummary
    {
        $session->refresh();
        $date = ($session->started_at ?? now())->toDateString();

        $stops = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->get();

        $personal = $stops->where('classification', FieldStopClassification::PERSONAL)->count();
        $ignored = $stops->where('classification', FieldStopClassification::IGNORE)->count();
        $unknown = $stops->filter(static fn (FieldStop $s): bool => $s->isPending())->count();
        $visits = $stops->filter(static fn (FieldStop $s): bool => $s->isVisit())->count();

        $metrics = [
            'distance_km' => round(((int) $session->distance_meters) / 1000, 2),
            'travel_hours' => round(((int) $session->travel_seconds) / 3600, 2),
            'stationary_hours' => round(((int) $session->stationary_seconds) / 3600, 2),
            'stops' => $stops->count(),
            'visits' => $visits,
            'unknown' => $unknown,
            'personal' => $personal,
            'ignored' => $ignored,
        ];

        $existingSummary = FieldDailySummary::query()
            ->where('company_id', $session->company_id)
            ->where('user_id', $session->user_id)
            ->whereDate('summary_date', $date)
            ->first();

        $summaryPayload = [
            'field_activity_session_id' => $session->id,
            'distance_meters' => (int) $session->distance_meters,
            'travel_seconds' => (int) $session->travel_seconds,
            'stationary_seconds' => (int) $session->stationary_seconds,
            'stop_count' => $stops->count(),
            'visit_count' => $visits,
            'unknown_stop_count' => $unknown,
            'personal_stop_count' => $personal,
            'ignored_stop_count' => $ignored,
            'metrics' => $metrics,
            'generated_at' => now(),
        ];

        if ($existingSummary !== null) {
            $existingSummary->fill($summaryPayload)->save();
            $summary = $existingSummary;
        } else {
            $summary = FieldDailySummary::query()->create([
                'company_id' => $session->company_id,
                'user_id' => $session->user_id,
                'summary_date' => $date,
                ...$summaryPayload,
            ]);
        }

        if ($withNarrative) {
            $this->attachNarrative($summary, $session);
        }

        return $summary->fresh() ?? $summary;
    }

    public function attachNarrative(FieldDailySummary $summary, ?FieldActivitySession $session = null): FieldDailySummary
    {
        $session ??= $summary->session;
        $user = User::query()->find($summary->user_id);
        $name = $user?->name ?? 'Agent';

        $metrics = $summary->metrics ?? [];
        $fallback = sprintf(
            'Today %s completed %d customer/lead visits, spent %.1f hours travelling, covered %.1f km, with %d stops still unclassified.',
            $name,
            (int) ($metrics['visits'] ?? $summary->visit_count),
            (float) ($metrics['travel_hours'] ?? round($summary->travel_seconds / 3600, 1)),
            (float) ($metrics['distance_km'] ?? round($summary->distance_meters / 1000, 1)),
            (int) ($metrics['unknown'] ?? $summary->unknown_stop_count),
        );

        try {
            $systemPrompt = 'You are ELY. Write one concise field-day narrative sentence for a sales agent. Do not invent facts. Use only the metrics provided.';
            $userPrompt = json_encode([
                'agent' => $name,
                'date' => $summary->summary_date instanceof Carbon
                    ? $summary->summary_date->toDateString()
                    : (string) $summary->summary_date,
                'metrics' => $metrics,
            ], JSON_THROW_ON_ERROR);

            $result = $this->aiProviderRouter->generateForPurpose(
                purpose: 'operational',
                systemPrompt: $systemPrompt,
                userPrompt: $userPrompt,
                options: [
                    'max_tokens' => 120,
                    'temperature' => 0.2,
                    'company_id' => (int) $summary->company_id,
                    '_log' => [
                        'company_id' => (int) $summary->company_id,
                        'user_id' => (int) $summary->user_id,
                        'intent_type' => 'field_daily_recap',
                        'tool_name' => 'field.daily_narrative',
                        'routing_purpose' => 'operational',
                    ],
                ],
            );

            $text = trim((string) ($result?->text ?? ''));
            $summary->update([
                'narrative' => $text !== '' ? $text : $fallback,
            ]);
        } catch (Throwable $e) {
            Log::debug('field_activity.narrative_failed', ['message' => $e->getMessage()]);
            $summary->update(['narrative' => $fallback]);
        }

        return $summary->fresh() ?? $summary;
    }
}
