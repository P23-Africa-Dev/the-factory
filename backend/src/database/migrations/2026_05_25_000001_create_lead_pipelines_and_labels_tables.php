<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lead_pipelines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('currency_code', 3)->default('USD');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->unique(['company_id', 'name']);
            $table->index(['company_id', 'sort_order']);
        });

        Schema::create('lead_labels', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('slug', 120);
            $table->string('color', 20)->default('#2563EB');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->unique(['company_id', 'slug']);
            $table->index(['company_id', 'sort_order']);
        });

        Schema::table('leads', function (Blueprint $table): void {
            $table->foreignId('pipeline_id')->nullable()->after('company_id')->constrained('lead_pipelines')->nullOnDelete();
            $table->index(['company_id', 'pipeline_id']);
        });

        $companyIds = DB::table('companies')->pluck('id');

        foreach ($companyIds as $companyId) {
            $defaultPipelineId = DB::table('lead_pipelines')->insertGetId([
                'company_id' => $companyId,
                'name' => 'Default Pipeline',
                'currency_code' => 'USD',
                'sort_order' => 0,
                'is_default' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('lead_pipelines')->insert([
                [
                    'company_id' => $companyId,
                    'name' => 'Sales Pipeline',
                    'currency_code' => 'USD',
                    'sort_order' => 1,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'company_id' => $companyId,
                    'name' => 'Marketing Pipeline',
                    'currency_code' => 'USD',
                    'sort_order' => 2,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);

            DB::table('lead_labels')->insert([
                [
                    'company_id' => $companyId,
                    'name' => 'Newly Lead',
                    'slug' => 'newly_lead',
                    'color' => '#2563EB',
                    'sort_order' => 0,
                    'is_default' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'company_id' => $companyId,
                    'name' => 'Proposal Sent',
                    'slug' => 'proposal_sent',
                    'color' => '#F59E0B',
                    'sort_order' => 1,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'company_id' => $companyId,
                    'name' => 'Contacted',
                    'slug' => 'contacted',
                    'color' => '#E879A0',
                    'sort_order' => 2,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'company_id' => $companyId,
                    'name' => 'Qualified',
                    'slug' => 'qualified',
                    'color' => '#10B981',
                    'sort_order' => 3,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);

            DB::table('leads')
                ->where('company_id', $companyId)
                ->update(['pipeline_id' => $defaultPipelineId]);
        }

        DB::table('leads')
            ->whereNull('status')
            ->update(['status' => 'newly_lead']);

        DB::table('leads')
            ->where('status', 'new')
            ->update(['status' => 'newly_lead']);
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('pipeline_id');
        });

        Schema::dropIfExists('lead_labels');
        Schema::dropIfExists('lead_pipelines');
    }
};
