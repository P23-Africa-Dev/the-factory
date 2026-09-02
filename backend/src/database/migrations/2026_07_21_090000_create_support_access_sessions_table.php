<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_access_sessions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('admin_id')->nullable()->constrained('admin_users')->nullOnDelete();
            $table->foreignId('target_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->foreignId('personal_access_token_id')->nullable()->constrained('personal_access_tokens')->nullOnDelete();
            $table->string('access_level', 32)->default('read_only');
            $table->text('reason');
            $table->string('ticket_reference', 191)->nullable();
            $table->char('exchange_code_hash', 64)->nullable()->unique();
            $table->timestamp('exchange_code_expires_at')->nullable();
            $table->timestamp('exchanged_at')->nullable();
            $table->timestamp('session_expires_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->string('admin_name_snapshot');
            $table->string('admin_email_snapshot');
            $table->string('target_name_snapshot');
            $table->string('target_email_snapshot');
            $table->string('company_name_snapshot');
            $table->string('target_company_role_snapshot', 32);
            $table->string('request_ip', 45)->nullable();
            $table->string('request_user_agent', 255)->nullable();
            $table->timestamps();

            $table->index(['admin_id', 'created_at']);
            $table->index(['target_user_id', 'created_at']);
            $table->index(['company_id', 'created_at']);
            $table->index(['session_expires_at', 'ended_at', 'revoked_at'], 'support_sessions_expiry_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_access_sessions');
    }
};
