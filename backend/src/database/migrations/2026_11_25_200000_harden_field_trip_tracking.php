<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Field trip production hardening.
 *
 * - last_received_at: server time of the last ingest (device clocks can be
 *   wrong; signal-lost / auto-end use this).
 * - distance_anchor_*: last position where distance was credited, so GPS
 *   jitter while standing still adds nothing and slow movement is not lost.
 * - stop_scan_cursor_at: stop detection resumes from here instead of
 *   rescanning the whole trail on every ingest.
 * - One active trip per user PER COMPANY (was global per user).
 * - Indexes for the monitor (status, source) and day views
 *   (company_id, user_id, started_at).
 */
return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        Schema::table('field_activity_sessions', function (Blueprint $table): void {
            $table->timestamp('last_received_at')->nullable()->after('last_recorded_at');
            $table->decimal('distance_anchor_latitude', 10, 7)->nullable()->after('last_persisted_recorded_at');
            $table->decimal('distance_anchor_longitude', 10, 7)->nullable()->after('distance_anchor_latitude');
            $table->timestamp('stop_scan_cursor_at')->nullable()->after('distance_anchor_longitude');
            $table->index(['status', 'source'], 'field_sessions_status_source_idx');
            $table->index(['company_id', 'user_id', 'started_at'], 'field_sessions_company_user_started_idx');
        });

        if ($driver === 'mysql') {
            DB::statement('DROP INDEX field_sessions_one_active_per_user ON field_activity_sessions');
            DB::statement("
                CREATE UNIQUE INDEX field_sessions_one_active_per_user_company
                ON field_activity_sessions ((IF(status = 'active', user_id, NULL)), (IF(status = 'active', company_id, NULL)))
            ");
        } elseif ($driver === 'sqlite') {
            DB::statement('DROP INDEX IF EXISTS field_sessions_one_active_per_user');
            DB::statement("
                CREATE UNIQUE INDEX IF NOT EXISTS field_sessions_one_active_per_user_company
                ON field_activity_sessions (user_id, company_id)
                WHERE status = 'active'
            ");
        }

        // Existing trips: anchor distance at their last known position.
        DB::table('field_activity_sessions')
            ->whereNull('distance_anchor_latitude')
            ->update([
                'distance_anchor_latitude' => DB::raw('last_persisted_latitude'),
                'distance_anchor_longitude' => DB::raw('last_persisted_longitude'),
            ]);
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement('DROP INDEX field_sessions_one_active_per_user_company ON field_activity_sessions');
            DB::statement("
                CREATE UNIQUE INDEX field_sessions_one_active_per_user
                ON field_activity_sessions ((IF(status = 'active', user_id, NULL)))
            ");
        } elseif ($driver === 'sqlite') {
            DB::statement('DROP INDEX IF EXISTS field_sessions_one_active_per_user_company');
            DB::statement("
                CREATE UNIQUE INDEX IF NOT EXISTS field_sessions_one_active_per_user
                ON field_activity_sessions (user_id)
                WHERE status = 'active'
            ");
        }

        Schema::table('field_activity_sessions', function (Blueprint $table): void {
            $table->dropIndex('field_sessions_status_source_idx');
            $table->dropIndex('field_sessions_company_user_started_idx');
            $table->dropColumn(['last_received_at', 'distance_anchor_latitude', 'distance_anchor_longitude', 'stop_scan_cursor_at']);
        });
    }
};
