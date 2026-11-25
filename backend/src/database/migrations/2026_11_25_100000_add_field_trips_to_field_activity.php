<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Field Trips: on-demand field tracking that is no longer tied to clock-in.
 *
 * - Sessions may exist without an attendance record (source = field_trip).
 * - client_trip_id makes "start trip" idempotent (offline replays, double taps).
 * - At most one ACTIVE session per user (DB-enforced, same approach as
 *   task_tracking_sessions_one_open_per_task).
 * - client_point_id de-duplicates replayed GPS points.
 * - Per-company settings for stop dwell, long-trip reminder and auto-end.
 */
return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        Schema::table('field_activity_sessions', function (Blueprint $table): void {
            $table->string('source', 16)->default('attendance')->after('attendance_record_id');
            $table->uuid('client_trip_id')->nullable()->after('source');
            $table->string('end_reason', 24)->nullable()->after('ended_at');
            $table->timestamp('last_reminded_at')->nullable()->after('last_persisted_recorded_at');
            $table->timestamp('signal_lost_notified_at')->nullable()->after('last_reminded_at');
            $table->unique(['company_id', 'client_trip_id'], 'field_sessions_company_client_trip_unique');
        });

        // attendance_record_id becomes optional for field trips.
        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE field_activity_sessions DROP FOREIGN KEY field_activity_sessions_attendance_record_id_foreign');
            DB::statement('ALTER TABLE field_activity_sessions MODIFY attendance_record_id BIGINT UNSIGNED NULL');
            DB::statement('ALTER TABLE field_activity_sessions ADD CONSTRAINT field_activity_sessions_attendance_record_id_foreign FOREIGN KEY (attendance_record_id) REFERENCES attendance_records (id) ON DELETE SET NULL');
        } else {
            Schema::table('field_activity_sessions', function (Blueprint $table): void {
                $table->unsignedBigInteger('attendance_record_id')->nullable()->change();
            });
        }

        $this->closeDuplicateActiveSessions();

        if ($driver === 'mysql') {
            DB::statement("
                CREATE UNIQUE INDEX field_sessions_one_active_per_user
                ON field_activity_sessions ((IF(status = 'active', user_id, NULL)))
            ");
        } elseif ($driver === 'sqlite') {
            DB::statement("
                CREATE UNIQUE INDEX IF NOT EXISTS field_sessions_one_active_per_user
                ON field_activity_sessions (user_id)
                WHERE status = 'active'
            ");
        }

        Schema::table('field_location_points', function (Blueprint $table): void {
            $table->uuid('client_point_id')->nullable()->after('user_id');
            $table->unique(['field_activity_session_id', 'client_point_id'], 'field_points_session_client_point_unique');
        });

        Schema::table('companies', function (Blueprint $table): void {
            $table->unsignedInteger('field_stop_dwell_seconds')->default(300)->after('field_activity_enabled');
            $table->unsignedInteger('field_trip_reminder_seconds')->default(18000)->after('field_stop_dwell_seconds');
            $table->unsignedInteger('field_trip_auto_end_seconds')->default(7200)->after('field_trip_reminder_seconds');
        });
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        Schema::table('companies', function (Blueprint $table): void {
            $table->dropColumn(['field_stop_dwell_seconds', 'field_trip_reminder_seconds', 'field_trip_auto_end_seconds']);
        });

        Schema::table('field_location_points', function (Blueprint $table): void {
            $table->dropUnique('field_points_session_client_point_unique');
            $table->dropColumn('client_point_id');
        });

        if ($driver === 'mysql') {
            DB::statement('DROP INDEX field_sessions_one_active_per_user ON field_activity_sessions');
        } elseif ($driver === 'sqlite') {
            DB::statement('DROP INDEX IF EXISTS field_sessions_one_active_per_user');
        }

        Schema::table('field_activity_sessions', function (Blueprint $table): void {
            $table->dropUnique('field_sessions_company_client_trip_unique');
            $table->dropColumn(['source', 'client_trip_id', 'end_reason', 'last_reminded_at', 'signal_lost_notified_at']);
        });
    }

    /** Keep the newest active session per user; close older duplicates so the unique index can be created. */
    private function closeDuplicateActiveSessions(): void
    {
        $duplicates = DB::select("
            SELECT user_id, MAX(id) AS keep_id
            FROM field_activity_sessions
            WHERE status = 'active'
            GROUP BY user_id
            HAVING COUNT(*) > 1
        ");

        foreach ($duplicates as $row) {
            DB::table('field_activity_sessions')
                ->where('user_id', $row->user_id)
                ->where('status', 'active')
                ->where('id', '!=', $row->keep_id)
                ->update([
                    'status' => 'auto_closed',
                    'ended_at' => now()->toDateTimeString(),
                    'end_reason' => 'auto_legacy',
                    'updated_at' => now()->toDateTimeString(),
                ]);
        }
    }
};
