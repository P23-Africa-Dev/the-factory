<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_calendar_connections', function (Blueprint $table): void {
            $table->string('gmail_history_id')->nullable()->after('scopes');
            $table->timestamp('gmail_last_synced_at')->nullable()->after('gmail_history_id');
            $table->timestamp('gmail_watch_expiration')->nullable()->after('gmail_last_synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('company_calendar_connections', function (Blueprint $table): void {
            $table->dropColumn([
                'gmail_history_id',
                'gmail_last_synced_at',
                'gmail_watch_expiration',
            ]);
        });
    }
};
