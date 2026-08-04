<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('field_stops', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('field_activity_session_id')->constrained('field_activity_sessions')->cascadeOnDelete();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            $table->timestamp('arrived_at');
            $table->timestamp('departed_at')->nullable();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->string('address')->nullable();
            $table->unsignedInteger('duration_seconds')->default(0);
            $table->decimal('confidence', 4, 3)->default(0);

            $table->string('match_type', 32)->default('unknown');
            $table->string('classification', 32)->default('pending');
            $table->string('classified_by', 16)->nullable();
            $table->timestamp('classified_at')->nullable();

            $table->foreignId('company_location_id')->nullable()->constrained('company_locations')->nullOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $table->foreignId('meeting_id')->nullable()->constrained('meetings')->nullOnDelete();
            $table->foreignId('task_id')->nullable()->constrained('tasks')->nullOnDelete();

            $table->boolean('reminder_sent')->default(false);
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['field_activity_session_id', 'arrived_at'], 'field_stops_session_arrived_idx');
            $table->index(['company_id', 'classification'], 'field_stops_company_class_idx');
            $table->index(['user_id', 'arrived_at'], 'field_stops_user_arrived_idx');
            $table->index(['lead_id', 'arrived_at'], 'field_stops_lead_arrived_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('field_stops');
    }
};
