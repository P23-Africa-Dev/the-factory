<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_demo_requests', function (Blueprint $table): void {
            $table->string('source', 32)->default('website')->after('status');
            $table->index(['source', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('company_demo_requests', function (Blueprint $table): void {
            $table->dropIndex(['source', 'status']);
            $table->dropColumn('source');
        });
    }
};
