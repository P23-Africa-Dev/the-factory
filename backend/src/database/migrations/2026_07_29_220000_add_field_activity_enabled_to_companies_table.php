<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('companies', 'field_activity_enabled')) {
            Schema::table('companies', function (Blueprint $table): void {
                // null/false = off (default); true = Field Activity Intelligence enabled.
                $table->boolean('field_activity_enabled')->nullable()->default(false)->after('map_poi_display_enabled');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('companies', 'field_activity_enabled')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->dropColumn('field_activity_enabled');
            });
        }
    }
};
