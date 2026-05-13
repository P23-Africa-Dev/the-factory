<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('is_active')->default(true)->after('onboarding_completed_at');
            $table->timestamp('deactivated_at')->nullable()->after('is_active');
            $table->index(['is_active', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex(['is_active', 'created_at']);
            $table->dropColumn(['is_active', 'deactivated_at']);
        });
    }
};
