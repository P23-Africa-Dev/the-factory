<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_location_points', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tracking_session_id')->constrained('task_tracking_sessions')->cascadeOnDelete();
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->decimal('accuracy_meters', 8, 2)->nullable();
            $table->decimal('speed_mps', 8, 2)->nullable();
            $table->decimal('heading_degrees', 6, 2)->nullable();
            $table->string('event_type', 32)->default('movement');
            $table->boolean('is_checkpoint')->default(false);
            $table->timestamp('recorded_at');
            $table->timestamps();

            $table->index(['task_id', 'recorded_at']);
            $table->index(['tracking_session_id', 'recorded_at']);
            $table->index(['company_id', 'recorded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_location_points');
    }
};
