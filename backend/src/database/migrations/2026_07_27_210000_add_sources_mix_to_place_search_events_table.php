<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('place_search_events', function (Blueprint $table): void {
            $table->json('sources_mix')->nullable()->after('providers_tried');
        });
    }

    public function down(): void
    {
        Schema::table('place_search_events', function (Blueprint $table): void {
            $table->dropColumn('sources_mix');
        });
    }
};
