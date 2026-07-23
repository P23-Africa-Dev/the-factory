<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_users', function (Blueprint $table): void {
            $table->foreignId('preferred_pipeline_id')
                ->nullable()
                ->after('role')
                ->constrained('lead_pipelines')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('company_users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('preferred_pipeline_id');
        });
    }
};
