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
        Schema::table('attendance_payroll_summaries', function (Blueprint $table): void {
            if (Schema::hasColumn('attendance_payroll_summaries', 'cycle_type')) {
                return;
            }

            $table->string('cycle_type', 20)->default('monthly')->after('payroll_setting_id');
            $table->string('status', 20)->default('pending')->after('currency');
            $table->timestamp('approved_at')->nullable()->after('status');
            $table->foreignId('approved_by_user_id')->nullable()->after('approved_at')->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable()->after('approved_by_user_id');
            $table->foreignId('revoked_by_user_id')->nullable()->after('revoked_at')->constrained('users')->nullOnDelete();
            $table->text('approval_reason')->nullable()->after('revoked_by_user_id');
        });

        DB::table('attendance_payroll_summaries')
            ->whereNull('cycle_type')
            ->update([
                'cycle_type' => 'monthly',
                'status' => 'pending',
            ]);

        Schema::table('attendance_payroll_summaries', function (Blueprint $table): void {
            $table->dropUnique('attendance_payroll_summaries_unique_period');
            $table->unique(
                ['company_id', 'user_id', 'cycle_type', 'period_start', 'period_end'],
                'attendance_payroll_summaries_unique_cycle_period'
            );
            $table->index(['company_id', 'cycle_type', 'period_start', 'period_end'], 'attendance_payroll_summaries_cycle_period_index');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_payroll_summaries', function (Blueprint $table): void {
            if (! Schema::hasColumn('attendance_payroll_summaries', 'cycle_type')) {
                return;
            }

            $table->dropUnique('attendance_payroll_summaries_unique_cycle_period');
            $table->dropIndex('attendance_payroll_summaries_cycle_period_index');
            $table->unique(['company_id', 'user_id', 'period_year', 'period_month'], 'attendance_payroll_summaries_unique_period');

            $table->dropConstrainedForeignId('approved_by_user_id');
            $table->dropConstrainedForeignId('revoked_by_user_id');
            $table->dropColumn([
                'cycle_type',
                'status',
                'approved_at',
                'revoked_at',
                'approval_reason',
            ]);
        });
    }
};
