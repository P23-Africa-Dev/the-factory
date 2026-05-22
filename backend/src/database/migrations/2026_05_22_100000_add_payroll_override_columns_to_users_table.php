<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('users')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            if (! Schema::hasColumn('users', 'payroll_salary_type')) {
                $table->string('payroll_salary_type', 20)->nullable()->after('base_salary');
            }

            if (! Schema::hasColumn('users', 'payroll_attendance_affects_pay')) {
                $table->boolean('payroll_attendance_affects_pay')->nullable()->after('payroll_salary_type');
            }

            if (! Schema::hasColumn('users', 'payroll_work_days_override')) {
                $table->unsignedSmallInteger('payroll_work_days_override')->nullable()->after('payroll_attendance_affects_pay');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('users')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $columns = [
                'payroll_work_days_override',
                'payroll_attendance_affects_pay',
                'payroll_salary_type',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('users', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
