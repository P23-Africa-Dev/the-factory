<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_email_attachments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('message_id')->nullable()->constrained('crm_email_messages')->cascadeOnDelete();
            $table->foreignId('uploaded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('gmail_attachment_id')->nullable();
            $table->string('gmail_message_id')->nullable();
            $table->string('filename');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->string('storage_disk')->default('local');
            $table->string('storage_path')->nullable();
            $table->string('sync_status')->default('pending'); // pending | synced | failed | uploaded
            $table->timestamps();

            $table->index(['company_id', 'message_id']);
        });

        Schema::create('crm_email_activity_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('message_id')->nullable()->constrained('crm_email_messages')->nullOnDelete();
            $table->foreignId('thread_id')->nullable()->constrained('crm_email_threads')->nullOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $table->string('action');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'created_at']);
            $table->index(['company_id', 'lead_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_email_activity_logs');
        Schema::dropIfExists('crm_email_attachments');
    }
};
