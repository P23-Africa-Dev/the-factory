<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_tracking_sessions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('task_id')->unique()->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('started_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('completed_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->decimal('start_latitude', 10, 7);
            $table->decimal('start_longitude', 10, 7);
            $table->decimal('start_accuracy_meters', 8, 2)->nullable();
            $table->timestamp('start_recorded_at');

            $table->decimal('last_latitude', 10, 7)->nullable();
            $table->decimal('last_longitude', 10, 7)->nullable();
            $table->decimal('last_accuracy_meters', 8, 2)->nullable();
            $table->timestamp('last_recorded_at')->nullable();

            $table->decimal('last_persisted_latitude', 10, 7)->nullable();
            $table->decimal('last_persisted_longitude', 10, 7)->nullable();
            $table->timestamp('last_persisted_recorded_at')->nullable();

            $table->decimal('destination_latitude', 10, 7)->nullable();
            $table->decimal('destination_longitude', 10, 7)->nullable();
            $table->unsignedSmallInteger('destination_radius_meters')->nullable();

            $table->timestamp('arrival_detected_at')->nullable();
            $table->decimal('arrival_latitude', 10, 7)->nullable();
            $table->decimal('arrival_longitude', 10, 7)->nullable();

            $table->decimal('end_latitude', 10, 7)->nullable();
            $table->decimal('end_longitude', 10, 7)->nullable();
            $table->decimal('end_accuracy_meters', 8, 2)->nullable();
            $table->timestamp('end_recorded_at')->nullable();

            $table->timestamps();

            $table->index(['company_id', 'start_recorded_at']);
            $table->index(['company_id', 'arrival_detected_at']);
            $table->index(['company_id', 'end_recorded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_tracking_sessions');
    }
};
