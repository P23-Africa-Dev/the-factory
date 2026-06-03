<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_tracking_sessions', function (Blueprint $table): void {
            $table->timestamp('near_detected_at')->nullable()->after('destination_radius_meters');
            $table->decimal('near_latitude', 10, 7)->nullable()->after('near_detected_at');
            $table->decimal('near_longitude', 10, 7)->nullable()->after('near_latitude');

            $table->index(['company_id', 'near_detected_at']);
        });
    }

    public function down(): void
    {
        Schema::table('task_tracking_sessions', function (Blueprint $table): void {
            $table->dropIndex(['company_id', 'near_detected_at']);
            $table->dropColumn(['near_detected_at', 'near_latitude', 'near_longitude']);
        });
    }
};
