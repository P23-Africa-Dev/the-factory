<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 1. leads.status was VARCHAR(40) while stage (label) slugs allow 120 chars, so
 *    moving a lead into a stage with a long name failed with a SQL error.
 * 2. One-time backfill of what LeadService::ensureDefaultCrmSetup used to do on
 *    every CRM read (pipeline-less leads -> default pipeline; empty/legacy
 *    "new" status -> default stage). New writes are normalised by LeadObserver.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->string('status', 120)->default('newly_lead')->change();
        });

        $companyIds = DB::table('leads')->distinct()->pluck('company_id');

        foreach ($companyIds as $companyId) {
            $defaultPipelineId = DB::table('lead_pipelines')
                ->where('company_id', $companyId)
                ->orderByDesc('is_default')
                ->orderBy('sort_order')
                ->orderBy('id')
                ->value('id');

            if ($defaultPipelineId !== null) {
                DB::table('leads')
                    ->where('company_id', $companyId)
                    ->whereNull('pipeline_id')
                    ->update(['pipeline_id' => $defaultPipelineId]);
            }

            $defaultSlug = DB::table('lead_labels')
                ->where('company_id', $companyId)
                ->orderByDesc('is_default')
                ->orderBy('sort_order')
                ->orderBy('id')
                ->value('slug');

            if ($defaultSlug === null) {
                continue;
            }

            $hasNewStage = DB::table('lead_labels')
                ->where('company_id', $companyId)
                ->where('slug', 'new')
                ->exists();

            DB::table('leads')
                ->where('company_id', $companyId)
                ->where(function ($q) use ($hasNewStage): void {
                    $q->whereNull('status')->orWhere('status', '');
                    if (! $hasNewStage) {
                        $q->orWhere('status', 'new');
                    }
                })
                ->update(['status' => $defaultSlug]);
        }
    }

    public function down(): void
    {
        // Widening is kept on rollback: shrinking could truncate stage slugs.
    }
};
