<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_records', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('attendance_date');
            $table->timestamp('clock_in_at')->nullable();
            $table->timestamp('clock_out_at')->nullable();
            $table->string('status')->default('present')->index();
            $table->unsignedInteger('work_duration_minutes')->nullable();
            $table->boolean('is_late')->default(false)->index();
            $table->boolean('is_auto_clocked_out')->default(false)->index();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'user_id', 'attendance_date'], 'attendance_records_unique_daily_entry');
            $table->index(['company_id', 'attendance_date', 'status']);
            $table->index(['user_id', 'attendance_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_records');
    }
};
