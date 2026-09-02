<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_calendar_connections', function (Blueprint $table): void {
            $table->string('gmail_history_id')->nullable()->after('gmail_last_synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('user_calendar_connections', function (Blueprint $table): void {
            $table->dropColumn('gmail_history_id');
        });
    }
};
