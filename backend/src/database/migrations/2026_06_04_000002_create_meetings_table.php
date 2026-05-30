<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meetings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained('projects')->nullOnDelete();
            $table->foreignId('task_id')->nullable()->constrained('tasks')->nullOnDelete();

            $table->string('title');
            $table->text('description')->nullable();
            $table->string('location')->nullable();
            $table->string('timezone', 64);
            $table->timestamp('start_at');
            $table->timestamp('end_at');
            $table->string('status')->default('scheduled')->index();
            $table->string('source_page')->default('api');

            $table->string('google_event_id')->nullable();
            $table->string('google_calendar_id')->nullable();
            $table->text('google_meet_url')->nullable();
            $table->text('google_html_link')->nullable();
            $table->string('sync_status')->default('pending')->index();
            $table->text('sync_error_message')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamp('external_updated_at')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'start_at']);
            $table->index(['project_id', 'task_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meetings');
    }
};
