<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-account opt-in for IMAP/SMTP mailboxes to send CRM email through the
 * platform mailer ("<Name> via Factory23", Reply-To the user) while outbound
 * SMTP ports are blocked on our host.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_accounts', function (Blueprint $table): void {
            $table->boolean('send_via_platform')->default(false)->after('smtp_password_encrypted');
        });
    }

    public function down(): void
    {
        Schema::table('email_accounts', function (Blueprint $table): void {
            $table->dropColumn('send_via_platform');
        });
    }
};
