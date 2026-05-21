<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_payroll_summaries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('payroll_setting_id')->nullable()->constrained('payroll_settings')->nullOnDelete();
            $table->unsignedSmallInteger('period_year');
            $table->unsignedTinyInteger('period_month');
            $table->date('period_start');
            $table->date('period_end');
            $table->unsignedSmallInteger('attendance_days')->default(0);
            $table->unsignedSmallInteger('scheduled_work_days')->default(0);
            $table->decimal('daily_rate', 12, 2)->default(0);
            $table->decimal('salary_payable', 12, 2)->default(0);
            $table->string('currency', 10);
            $table->timestamp('generated_at');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'user_id', 'period_year', 'period_month'], 'attendance_payroll_summaries_unique_period');
            $table->index(['company_id', 'period_year', 'period_month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_payroll_summaries');
    }
};
