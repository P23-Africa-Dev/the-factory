<?php

declare(strict_types=1);

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Services\Crm\MapSavedLeadBridgeService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('lead_pipelines', 'system_key')) {
            return;
        }

        $bridge = app(MapSavedLeadBridgeService::class);

        Company::query()
            ->select('id')
            ->orderBy('id')
            ->chunkById(100, function ($companies) use ($bridge): void {
                foreach ($companies as $company) {
                    $companyId = (int) $company->id;

                    $hasMapLeads = Lead::query()
                        ->where('company_id', $companyId)
                        ->where(function ($query): void {
                            $query->where('source', MapSavedLeadBridgeService::MAP_LEAD_SOURCE)
                                ->orWhereNotNull('company_location_id');
                        })
                        ->exists();

                    if (! $hasMapLeads) {
                        continue;
                    }

                    $mapPipeline = $bridge->ensureMapPipeline($companyId);
                    $mapPipelineId = (int) $mapPipeline->id;

                    Lead::query()
                        ->where('company_id', $companyId)
                        ->where(function ($query): void {
                            $query->where('source', MapSavedLeadBridgeService::MAP_LEAD_SOURCE)
                                ->orWhereNotNull('company_location_id');
                        })
                        ->where(function ($query) use ($mapPipelineId): void {
                            $query->whereNull('pipeline_id')
                                ->orWhere('pipeline_id', '!=', $mapPipelineId);
                        })
                        ->update(['pipeline_id' => $mapPipelineId]);

                    LeadPipeline::query()
                        ->where('company_id', $companyId)
                        ->whereIn('name', [
                            MapSavedLeadBridgeService::MAP_PIPELINE_NAME,
                            MapSavedLeadBridgeService::LEGACY_MAP_PIPELINE_NAME,
                        ])
                        ->where('id', '!=', $mapPipelineId)
                        ->update(['system_key' => null]);
                }
            });
    }

    public function down(): void
    {
        // Non-destructive data correction; no rollback.
    }
};
