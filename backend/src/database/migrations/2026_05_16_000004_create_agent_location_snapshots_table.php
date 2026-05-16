<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agent_location_snapshots', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('task_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->foreignId('tracking_session_id')->nullable()->constrained('task_tracking_sessions')->nullOnDelete();

            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->decimal('accuracy_meters', 8, 2)->nullable();
            $table->decimal('speed_mps', 8, 2)->nullable();
            $table->decimal('heading_degrees', 6, 2)->nullable();
            $table->string('event_type', 32)->default('movement');
            $table->string('task_status', 32)->nullable();
            $table->boolean('arrived')->default(false);
            $table->timestamp('recorded_at')->nullable();
            $table->timestamp('last_seen_at');
            $table->timestamps();

            $table->unique(['company_id', 'user_id']);
            $table->index(['company_id', 'last_seen_at']);
            $table->index(['company_id', 'task_id']);
            $table->index(['company_id', 'event_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_location_snapshots');
    }
};
