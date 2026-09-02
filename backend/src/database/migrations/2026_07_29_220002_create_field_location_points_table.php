<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('field_location_points', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('field_activity_session_id')->constrained('field_activity_sessions')->cascadeOnDelete();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('task_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->foreignId('task_tracking_session_id')->nullable()->constrained('task_tracking_sessions')->nullOnDelete();

            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->decimal('accuracy_meters', 8, 2)->nullable();
            $table->decimal('speed_mps', 8, 2)->nullable();
            $table->decimal('heading_degrees', 6, 2)->nullable();
            $table->decimal('distance_from_previous_meters', 10, 2)->nullable();
            $table->string('movement_state', 16)->default('moving');
            $table->timestamp('recorded_at');
            $table->timestamps();

            $table->index(['field_activity_session_id', 'recorded_at'], 'field_points_session_recorded_idx');
            $table->index(['company_id', 'recorded_at'], 'field_points_company_recorded_idx');
            $table->index(['user_id', 'recorded_at'], 'field_points_user_recorded_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('field_location_points');
    }
};
