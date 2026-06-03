<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('meetings', function (Blueprint $table): void {
            $table->string('organizer_email_snapshot')->nullable()->after('source_page');
            $table->string('organizer_name_snapshot')->nullable()->after('organizer_email_snapshot');
            $table->index(['company_id', 'organizer_email_snapshot']);
        });
    }

    public function down(): void
    {
        Schema::table('meetings', function (Blueprint $table): void {
            $table->dropIndex(['company_id', 'organizer_email_snapshot']);
            $table->dropColumn(['organizer_email_snapshot', 'organizer_name_snapshot']);
        });
    }
};
