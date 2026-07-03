<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_demo_requests', function (Blueprint $table): void {
            $table->string('assigned_plan_key')->nullable()->after('admin_notes');
            $table->string('assigned_billing_interval')->nullable()->after('assigned_plan_key');
        });
    }

    public function down(): void
    {
        Schema::table('company_demo_requests', function (Blueprint $table): void {
            $table->dropColumn(['assigned_plan_key', 'assigned_billing_interval']);
        });
    }
};
