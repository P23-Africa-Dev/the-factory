<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('field_activity_sessions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('attendance_record_id')->constrained('attendance_records')->cascadeOnDelete();

            $table->string('status', 32)->default('active');
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();

            $table->unsignedBigInteger('distance_meters')->default(0);
            $table->unsignedInteger('travel_seconds')->default(0);
            $table->unsignedInteger('stationary_seconds')->default(0);
            $table->unsignedInteger('stop_count')->default(0);
            $table->unsignedInteger('visit_count')->default(0);
            $table->unsignedInteger('unknown_stop_count')->default(0);

            $table->decimal('last_latitude', 10, 7)->nullable();
            $table->decimal('last_longitude', 10, 7)->nullable();
            $table->decimal('last_accuracy_meters', 8, 2)->nullable();
            $table->timestamp('last_recorded_at')->nullable();
            $table->string('last_movement_state', 16)->nullable();

            $table->decimal('last_persisted_latitude', 10, 7)->nullable();
            $table->decimal('last_persisted_longitude', 10, 7)->nullable();
            $table->timestamp('last_persisted_recorded_at')->nullable();

            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'started_at']);
            $table->index(['user_id', 'status']);
            $table->index(['attendance_record_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('field_activity_sessions');
    }
};
