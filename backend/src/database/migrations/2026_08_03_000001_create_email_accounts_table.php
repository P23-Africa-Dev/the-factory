<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_accounts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider'); // google, microsoft, zoho, imap_smtp
            $table->string('email');
            $table->string('display_name')->nullable();

            // OAuth fields (encrypted at rest via Laravel's encrypted cast)
            $table->text('access_token_encrypted')->nullable();
            $table->text('refresh_token_encrypted')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->timestamp('last_token_refresh_at')->nullable();
            $table->json('scopes')->nullable();

            // SMTP fields (password encrypted at rest)
            $table->string('smtp_host')->nullable();
            $table->unsignedSmallInteger('smtp_port')->nullable();
            $table->string('smtp_encryption')->nullable(); // tls, ssl
            $table->string('smtp_username')->nullable();
            $table->text('smtp_password_encrypted')->nullable();

            // IMAP fields (password encrypted at rest)
            $table->string('imap_host')->nullable();
            $table->unsignedSmallInteger('imap_port')->nullable();
            $table->string('imap_encryption')->nullable(); // tls, ssl
            $table->string('imap_username')->nullable();
            $table->text('imap_password_encrypted')->nullable();

            // Sync state
            $table->string('history_id')->nullable();
            $table->timestamp('last_synced_at')->nullable();

            // Status & defaults
            $table->string('status')->default('active'); // active, error, disconnected
            $table->boolean('is_default')->default(false);
            $table->text('last_error_message')->nullable();
            $table->timestamp('last_error_at')->nullable();
            $table->timestamp('connected_at')->nullable();
            $table->timestamp('disconnected_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_id', 'user_id']);
            $table->index(['company_id', 'provider']);
            $table->index(['company_id', 'status']);
            $table->unique(['company_id', 'user_id', 'email']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_accounts');
    }
};
