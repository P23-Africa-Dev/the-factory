<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Models\FieldStop;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Throwable;

class FieldCrmBridgeService
{
    public function syncVisitFromStop(FieldStop $stop): ?LeadActivity
    {
        if (! $stop->isVisit() || $stop->lead_id === null) {
            return null;
        }

        $lead = Lead::query()->find($stop->lead_id);
        if ($lead === null) {
            return null;
        }

        // Avoid duplicate visit activities for the same stop.
        $existing = LeadActivity::query()
            ->where('lead_id', $lead->id)
            ->where('type', 'visit')
            ->where('meta->field_stop_id', $stop->id)
            ->first();

        if ($existing !== null) {
            // The person may have added the outcome or notes later: keep the CRM in step.
            $existing->forceFill(['description' => $this->visitDescription($stop)])->save();

            return $existing;
        }

        $user = User::query()->find($stop->user_id);
        if ($user === null) {
            return null;
        }

        $label = match ($stop->classification) {
            FieldStopClassification::CUSTOMER_VISIT => 'Customer visit',
            FieldStopClassification::LEAD_VISIT => 'Lead visit',
            FieldStopClassification::ORG_VISIT => 'Organization visit',
            default => 'Field visit',
        };

        $description = $this->visitDescription($stop);

        try {
            $activity = LeadActivity::query()->create([
                'lead_id' => $lead->id,
                'company_id' => $stop->company_id,
                'created_by_user_id' => $user->id,
                'type' => 'visit',
                'title' => $label,
                'description' => $description,
                'happened_at' => $stop->arrived_at,
                'meta' => [
                    'field_stop_id' => $stop->id,
                    'field_activity_session_id' => $stop->field_activity_session_id,
                    'duration_seconds' => $stop->duration_seconds,
                    'latitude' => $stop->latitude,
                    'longitude' => $stop->longitude,
                    'address' => $stop->address,
                    'classification' => $stop->classification?->value,
                    'match_type' => $stop->match_type?->value,
                    'confidence' => $stop->confidence,
                    'source' => 'field_activity',
                ],
            ]);

            $lead->forceFill([
                'last_interaction' => $label,
                'last_interaction_at' => $stop->arrived_at ?? now(),
            ])->save();

            return $activity;
        } catch (Throwable $e) {
            Log::warning('field_activity.crm_bridge_failed', [
                'stop_id' => $stop->id,
                'lead_id' => $lead->id,
                'message' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /** "Customer visit (24 min) · Outcome: Follow-up needed · Notes: …" for the lead timeline. */
    private function visitDescription(FieldStop $stop): string
    {
        $label = match ($stop->classification) {
            FieldStopClassification::CUSTOMER_VISIT => 'Customer visit',
            FieldStopClassification::LEAD_VISIT => 'Lead visit',
            FieldStopClassification::ORG_VISIT => 'Organization visit',
            default => 'Field visit',
        };
        $parts = [sprintf('%s recorded on a field trip (%d min).', $label, (int) round(max(0, (int) $stop->duration_seconds) / 60))];
        if ($stop->outcome) {
            $parts[] = 'Outcome: '.ucfirst(str_replace('_', ' ', (string) $stop->outcome)).'.';
        }
        if ($stop->follow_up_at) {
            $parts[] = 'Follow up on '.$stop->follow_up_at->toDateString().'.';
        }
        if (trim((string) $stop->notes) !== '') {
            $parts[] = 'Notes: '.mb_substr(trim((string) $stop->notes), 0, 1500);
        }

        return implode(' ', $parts);
    }
}
