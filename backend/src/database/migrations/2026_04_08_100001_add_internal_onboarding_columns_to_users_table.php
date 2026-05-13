<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('onboarding_status')->nullable()->after('enterprise_onboarding_completed_at');
            $table->string('internal_role')->nullable()->after('onboarding_status');
            $table->string('assigned_zone')->nullable()->after('internal_role');
            $table->json('work_days')->nullable()->after('assigned_zone');
            $table->decimal('base_salary', 12, 2)->nullable()->after('work_days');
            $table->char('salary_currency', 3)->nullable()->after('base_salary');
            $table->boolean('commission_enabled')->default(false)->after('salary_currency');
            $table->foreignId('supervisor_user_id')->nullable()->after('commission_enabled')->constrained('users')->nullOnDelete();
            $table->foreignId('invited_by_user_id')->nullable()->after('supervisor_user_id')->constrained('users')->nullOnDelete();
            $table->string('phone_number', 25)->nullable()->after('invited_by_user_id');
            $table->string('gender', 20)->nullable()->after('phone_number');
            $table->timestamp('internal_onboarding_completed_at')->nullable()->after('gender');

            $table->index(['onboarding_status', 'internal_role']);
            $table->index(['supervisor_user_id', 'internal_role']);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex(['onboarding_status', 'internal_role']);
            $table->dropIndex(['supervisor_user_id', 'internal_role']);
            $table->dropConstrainedForeignId('supervisor_user_id');
            $table->dropConstrainedForeignId('invited_by_user_id');
            $table->dropColumn([
                'onboarding_status',
                'internal_role',
                'assigned_zone',
                'work_days',
                'base_salary',
                'salary_currency',
                'commission_enabled',
                'phone_number',
                'gender',
                'internal_onboarding_completed_at',
            ]);
        });
    }
};
