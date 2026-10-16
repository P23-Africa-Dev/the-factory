<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_demo_requests', function (Blueprint $table): void {
            $table->string('control_temp_password')->nullable()->after('admin_notes');
            $table->timestamp('control_access_enabled_at')->nullable()->after('control_temp_password');
        });
    }

    public function down(): void
    {
        Schema::table('company_demo_requests', function (Blueprint $table): void {
            $table->dropColumn(['control_temp_password', 'control_access_enabled_at']);
        });
    }
};
