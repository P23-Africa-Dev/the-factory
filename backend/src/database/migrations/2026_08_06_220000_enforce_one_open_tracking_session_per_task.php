<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Enforce at most one open tracking session per task.
 *
 * Application logic already checks for an open session before creating a new
 * one, but concurrent starts can race past that check. A DB-level uniqueness
 * constraint closes the race.
 *
 * MySQL 8+: functional unique index — expression is task_id while open, NULL
 * when closed. UNIQUE allows multiple NULLs so closed sessions are fine.
 * (Avoids STORED generated columns, which fail with error 1215 on tables that
 * already have foreign keys during ALTER TABLE rebuild.)
 *
 * SQLite: partial unique index on task_id WHERE end_recorded_at IS NULL.
 */
return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            $this->closeDuplicateOpenSessionsMysql();
            $this->dropLeftoverGeneratedColumnIfPresent();

            if (! $this->mysqlIndexExists('task_tracking_sessions_one_open_per_task')) {
                // Functional unique index (MySQL 8.0.13+). Closed rows evaluate to
                // NULL and do not collide with each other.
                DB::statement('
                    CREATE UNIQUE INDEX task_tracking_sessions_one_open_per_task
                    ON task_tracking_sessions ((IF(end_recorded_at IS NULL, task_id, NULL)))
                ');
            }

            return;
        }

        if ($driver === 'sqlite') {
            $this->closeDuplicateOpenSessionsSqlite();

            DB::statement('
                CREATE UNIQUE INDEX IF NOT EXISTS task_tracking_sessions_one_open_per_task
                ON task_tracking_sessions (task_id)
                WHERE end_recorded_at IS NULL
            ');
        }
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            if ($this->mysqlIndexExists('task_tracking_sessions_one_open_per_task')) {
                DB::statement('DROP INDEX task_tracking_sessions_one_open_per_task ON task_tracking_sessions');
            }

            $this->dropLeftoverGeneratedColumnIfPresent();

            return;
        }

        if ($driver === 'sqlite') {
            DB::statement('DROP INDEX IF EXISTS task_tracking_sessions_one_open_per_task');
        }
    }

    private function dropLeftoverGeneratedColumnIfPresent(): void
    {
        // Earlier revision of this migration tried to add a STORED generated
        // column; clean it up if a partial deploy left it behind.
        if (Schema::hasColumn('task_tracking_sessions', 'open_task_key')) {
            if ($this->mysqlIndexExists('task_tracking_sessions_open_task_key_unique')) {
                DB::statement('DROP INDEX task_tracking_sessions_open_task_key_unique ON task_tracking_sessions');
            }

            DB::statement('ALTER TABLE task_tracking_sessions DROP COLUMN open_task_key');
        }
    }

    private function mysqlIndexExists(string $indexName): bool
    {
        $database = Schema::getConnection()->getDatabaseName();
        $rows = DB::select(
            'SELECT 1 FROM information_schema.statistics
             WHERE table_schema = ? AND table_name = ? AND index_name = ?
             LIMIT 1',
            [$database, 'task_tracking_sessions', $indexName],
        );

        return count($rows) > 0;
    }

    private function closeDuplicateOpenSessionsMysql(): void
    {
        $duplicates = DB::select('
            SELECT task_id, MAX(id) AS keep_id
            FROM task_tracking_sessions
            WHERE end_recorded_at IS NULL
            GROUP BY task_id
            HAVING COUNT(*) > 1
        ');

        foreach ($duplicates as $row) {
            DB::table('task_tracking_sessions')
                ->where('task_id', $row->task_id)
                ->whereNull('end_recorded_at')
                ->where('id', '!=', $row->keep_id)
                ->update([
                    'end_recorded_at' => now(),
                    'updated_at' => now(),
                ]);
        }
    }

    private function closeDuplicateOpenSessionsSqlite(): void
    {
        $duplicates = DB::select('
            SELECT task_id, MAX(id) AS keep_id
            FROM task_tracking_sessions
            WHERE end_recorded_at IS NULL
            GROUP BY task_id
            HAVING COUNT(*) > 1
        ');

        foreach ($duplicates as $row) {
            DB::table('task_tracking_sessions')
                ->where('task_id', $row->task_id)
                ->whereNull('end_recorded_at')
                ->where('id', '!=', $row->keep_id)
                ->update([
                    'end_recorded_at' => now()->toDateTimeString(),
                    'updated_at' => now()->toDateTimeString(),
                ]);
        }
    }
};
