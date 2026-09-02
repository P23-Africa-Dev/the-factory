<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->string('company_name')->nullable()->after('location');
            $table->string('website', 255)->nullable()->after('company_name');
            $table->string('position', 120)->nullable()->after('website');
            $table->json('profile_urls')->nullable()->after('position');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->dropColumn(['company_name', 'website', 'position', 'profile_urls']);
        });
    }
};
