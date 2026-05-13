<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('enterprise_onboarding_completed_at')->nullable()->after('onboarding_completed_at');
            $table->index('enterprise_onboarding_completed_at', 'users_enterprise_onboarding_idx');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('users_enterprise_onboarding_idx');
            $table->dropColumn('enterprise_onboarding_completed_at');
        });
    }
};
