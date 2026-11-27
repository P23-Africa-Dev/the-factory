<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Microsoft Graph stores its sync cursor as a full @odata.deltaLink URL, which is
 * routinely longer than 255 characters. With MySQL strict mode the VARCHAR(255)
 * rejected it, so Outlook accounts could never save a cursor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_accounts', function (Blueprint $table): void {
            $table->text('history_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('email_accounts', function (Blueprint $table): void {
            $table->string('history_id')->nullable()->change();
        });
    }
};
