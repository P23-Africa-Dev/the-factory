<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The CRM lead list can sort by recent activity (updated_at) within a company.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->index(['company_id', 'updated_at'], 'leads_company_updated_at_index');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->dropIndex('leads_company_updated_at_index');
        });
    }
};
