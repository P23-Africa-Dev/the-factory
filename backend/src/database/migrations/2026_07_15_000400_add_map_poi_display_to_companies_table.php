<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('companies', 'map_poi_display_enabled')) {
            Schema::table('companies', function (Blueprint $table): void {
                // null = inherit the global map.poi_display master toggle;
                // true/false = per-organization super-admin override.
                $table->boolean('map_poi_display_enabled')->nullable()->after('settings');
            });
        }
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            if (Schema::hasColumn('companies', 'map_poi_display_enabled')) {
                $table->dropColumn('map_poi_display_enabled');
            }
        });
    }
};
