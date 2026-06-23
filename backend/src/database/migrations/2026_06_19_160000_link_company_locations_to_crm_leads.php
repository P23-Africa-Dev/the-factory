<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_pipelines', function (Blueprint $table): void {
            $table->string('system_key', 60)->nullable()->after('is_default');
            $table->unique(['company_id', 'system_key'], 'lead_pipelines_company_system_key_unique');
        });

        Schema::table('company_locations', function (Blueprint $table): void {
            $table->foreignId('crm_lead_id')
                ->nullable()
                ->after('company_id')
                ->constrained('leads')
                ->nullOnDelete();
        });

        Schema::table('leads', function (Blueprint $table): void {
            $table->foreignId('company_location_id')
                ->nullable()
                ->after('pipeline_id')
                ->constrained('company_locations')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('company_location_id');
        });

        Schema::table('company_locations', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('crm_lead_id');
        });

        Schema::table('lead_pipelines', function (Blueprint $table): void {
            $table->dropUnique('lead_pipelines_company_system_key_unique');
            $table->dropColumn('system_key');
        });
    }
};
