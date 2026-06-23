<?php

declare(strict_types=1);

namespace App\Services\Crm;

use App\Models\CompanyLocation;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class MapSavedLeadBridgeService
{
    public const MAP_PIPELINE_SYSTEM_KEY = 'map_saved';

    public const MAP_PIPELINE_NAME = 'Saved from Map';

    public const MAP_LEAD_SOURCE = 'Map';

    public function ensureMapPipeline(int $companyId): LeadPipeline
    {
        $existing = LeadPipeline::query()
            ->where('company_id', $companyId)
            ->where('system_key', self::MAP_PIPELINE_SYSTEM_KEY)
            ->first();

        if ($existing !== null) {
            return $existing;
        }

        $maxSortOrder = (int) LeadPipeline::query()->where('company_id', $companyId)->max('sort_order');

        return LeadPipeline::query()->create([
            'company_id' => $companyId,
            'name' => self::MAP_PIPELINE_NAME,
            'currency_code' => 'USD',
            'sort_order' => $maxSortOrder + 1,
            'is_default' => false,
            'system_key' => self::MAP_PIPELINE_SYSTEM_KEY,
        ]);
    }

    public function mapPipelineHasLeads(int $companyId): bool
    {
        $pipelineId = LeadPipeline::query()
            ->where('company_id', $companyId)
            ->where('system_key', self::MAP_PIPELINE_SYSTEM_KEY)
            ->value('id');

        if ($pipelineId === null) {
            return false;
        }

        return Lead::query()->where('pipeline_id', $pipelineId)->exists();
    }

    public function createLinkedLead(
        User $user,
        CompanyLocation $location,
        int $companyId,
        string $status = 'newly_lead',
    ): Lead {
        return DB::transaction(function () use ($user, $location, $companyId, $status): Lead {
            $pipeline = $this->ensureMapPipeline($companyId);

            $lead = Lead::query()->create([
                'company_id' => $companyId,
                'pipeline_id' => $pipeline->id,
                'created_by_user_id' => $user->id,
                'assigned_to_user_id' => $user->id,
                'name' => $location->name,
                'email' => $location->email,
                'phone' => $location->contact_number,
                'location' => $this->locationTextFromLocation($location),
                'source' => self::MAP_LEAD_SOURCE,
                'status' => $status,
                'priority' => 'medium',
                'meta' => $this->leadMetaFromLocation($location),
                'company_location_id' => $location->id,
            ]);

            $location->update(['crm_lead_id' => $lead->id]);

            return $lead->fresh();
        });
    }

    public function syncLocationToLead(CompanyLocation $location): void
    {
        if ($location->crm_lead_id === null) {
            return;
        }

        $lead = Lead::query()->find($location->crm_lead_id);
        if ($lead === null) {
            return;
        }

        $lead->update([
            'name' => $location->name,
            'email' => $location->email,
            'phone' => $location->contact_number,
            'location' => $this->locationTextFromLocation($location),
            'meta' => $this->mergeLeadMetaFromLocation($lead, $location),
        ]);
    }

    public function syncLeadToLocation(Lead $lead): void
    {
        if ($lead->company_location_id === null) {
            return;
        }

        $location = CompanyLocation::query()->find($lead->company_location_id);
        if ($location === null) {
            return;
        }

        $mapMeta = is_array($lead->meta) ? ($lead->meta['map'] ?? null) : null;
        $latitude = is_array($mapMeta) && isset($mapMeta['latitude'])
            ? (float) $mapMeta['latitude']
            : $location->latitude;
        $longitude = is_array($mapMeta) && isset($mapMeta['longitude'])
            ? (float) $mapMeta['longitude']
            : $location->longitude;

        $location->update([
            'name' => $lead->name,
            'email' => $lead->email,
            'contact_number' => $lead->phone,
            'address' => $lead->location ?? $location->address,
            'latitude' => $latitude,
            'longitude' => $longitude,
        ]);
    }

    public function unlinkLocationFromLead(CompanyLocation $location): void
    {
        if ($location->crm_lead_id === null) {
            return;
        }

        Lead::query()
            ->whereKey($location->crm_lead_id)
            ->update(['company_location_id' => null]);
    }

    public function unlinkLeadFromLocation(Lead $lead): void
    {
        if ($lead->company_location_id === null) {
            return;
        }

        CompanyLocation::query()
            ->whereKey($lead->company_location_id)
            ->update(['crm_lead_id' => null]);
    }

    private function locationTextFromLocation(CompanyLocation $location): ?string
    {
        $address = trim((string) ($location->address ?? ''));
        if ($address !== '') {
            return $address;
        }

        $name = trim((string) $location->name);

        return $name !== '' ? $name : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function leadMetaFromLocation(CompanyLocation $location): array
    {
        return [
            'map' => [
                'company_location_id' => $location->id,
                'latitude' => $location->latitude,
                'longitude' => $location->longitude,
                'location_type' => $location->type,
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function mergeLeadMetaFromLocation(Lead $lead, CompanyLocation $location): array
    {
        $meta = is_array($lead->meta) ? $lead->meta : [];

        $meta['map'] = [
            'company_location_id' => $location->id,
            'latitude' => $location->latitude,
            'longitude' => $location->longitude,
            'location_type' => $location->type,
        ];

        return $meta;
    }
}
