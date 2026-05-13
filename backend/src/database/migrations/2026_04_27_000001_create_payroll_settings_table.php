<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_settings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->string('salary_type', 20);
            $table->decimal('base_salary', 14, 2);
            $table->char('currency', 3);
            $table->unsignedSmallInteger('work_days')->default(22);
            $table->unsignedTinyInteger('work_hours')->default(8);
            $table->decimal('daily_pay', 14, 2);
            $table->boolean('attendance_affects_pay')->default(false);
            $table->boolean('commission_enabled')->default(false);
            $table->timestamps();

            $table->unique('company_id');
            $table->index(['company_id', 'salary_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_settings');
    }
};
