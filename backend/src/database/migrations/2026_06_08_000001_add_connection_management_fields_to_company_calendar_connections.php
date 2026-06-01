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
            $table->string('organizer_name')->nullable()->after('organizer_email');
            $table->timestamp('last_token_refresh_at')->nullable()->after('token_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('company_calendar_connections', function (Blueprint $table): void {
            $table->dropColumn(['organizer_name', 'last_token_refresh_at']);
        });
    }
};
