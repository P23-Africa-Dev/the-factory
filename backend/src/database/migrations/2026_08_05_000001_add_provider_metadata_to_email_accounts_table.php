<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_accounts', function (Blueprint $table): void {
            $table->json('provider_metadata')->nullable()->after('scopes');
        });
    }

    public function down(): void
    {
        Schema::table('email_accounts', function (Blueprint $table): void {
            $table->dropColumn('provider_metadata');
        });
    }
};
