<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meeting_reminders', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('meeting_id')->constrained('meetings')->cascadeOnDelete();
            $table->foreignId('recipient_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('recipient_email');
            $table->string('recipient_name')->nullable();
            $table->integer('offset_minutes')->nullable();
            $table->timestamp('custom_remind_at')->nullable();
            $table->timestamp('remind_at')->index();
            $table->string('status')->default('pending')->index();
            $table->integer('attempts')->default(0);
            $table->timestamp('last_attempt_at')->nullable();
            $table->timestamp('next_retry_at')->nullable()->index();
            $table->timestamp('queued_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->text('last_error')->nullable();
            $table->string('dedupe_key')->unique();
            $table->timestamps();

            $table->index(['meeting_id', 'status']);
            $table->index(['recipient_email', 'remind_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meeting_reminders');
    }
};
