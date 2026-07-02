<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TABLE = 'users';

    private const LEGACY_EMAIL_UNIQUE = 'users_email_unique';

    private const ACTIVE_EMAIL_UNIQUE = 'users_email_active_unique';

    private const ACTIVE_EMAIL_COLUMN = 'active_email_unique';

    public function up(): void
    {
        if ($this->indexExists(self::TABLE, self::LEGACY_EMAIL_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->dropUnique(self::LEGACY_EMAIL_UNIQUE);
            });
        }

        $driver = DB::getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $this->createMysqlOrMariaDbActiveEmailUniqueIndex();

            return;
        }

        $this->createPartialActiveEmailUniqueIndex();
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            if ($this->indexExists(self::TABLE, self::ACTIVE_EMAIL_UNIQUE)) {
                Schema::table(self::TABLE, function (Blueprint $table): void {
                    $table->dropUnique(self::ACTIVE_EMAIL_UNIQUE);
                });
            }

            if (Schema::hasColumn(self::TABLE, self::ACTIVE_EMAIL_COLUMN)) {
                DB::statement(sprintf(
                    'ALTER TABLE %s DROP COLUMN %s',
                    self::TABLE,
                    self::ACTIVE_EMAIL_COLUMN,
                ));
            }
        } else {
            DB::statement('DROP INDEX IF EXISTS ' . self::ACTIVE_EMAIL_UNIQUE);
        }

        if (! $this->indexExists(self::TABLE, self::LEGACY_EMAIL_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->unique('email', self::LEGACY_EMAIL_UNIQUE);
            });
        }
    }

    private function createMysqlOrMariaDbActiveEmailUniqueIndex(): void
    {
        if (! Schema::hasColumn(self::TABLE, self::ACTIVE_EMAIL_COLUMN)) {
            DB::statement(sprintf(
                'ALTER TABLE %s ADD COLUMN %s VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN deleted_at IS NULL THEN email ELSE NULL END) STORED',
                self::TABLE,
                self::ACTIVE_EMAIL_COLUMN,
            ));
        }

        if (! $this->indexExists(self::TABLE, self::ACTIVE_EMAIL_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->unique(self::ACTIVE_EMAIL_COLUMN, self::ACTIVE_EMAIL_UNIQUE);
            });
        }
    }

    private function createPartialActiveEmailUniqueIndex(): void
    {
        if ($this->indexExists(self::TABLE, self::ACTIVE_EMAIL_UNIQUE)) {
            return;
        }

        DB::statement(sprintf(
            'CREATE UNIQUE INDEX %s ON %s (email) WHERE deleted_at IS NULL',
            self::ACTIVE_EMAIL_UNIQUE,
            self::TABLE,
        ));
    }

    private function indexExists(string $table, string $indexName): bool
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            $rows = DB::select("PRAGMA index_list('{$table}')");

            foreach ($rows as $row) {
                if ((string) ($row->name ?? '') === $indexName) {
                    return true;
                }
            }

            return false;
        }

        if ($driver === 'pgsql') {
            return DB::table('pg_indexes')
                ->where('schemaname', 'public')
                ->where('tablename', $table)
                ->where('indexname', $indexName)
                ->exists();
        }

        return DB::table('information_schema.statistics')
            ->where('table_schema', DB::getDatabaseName())
            ->where('table_name', $table)
            ->where('index_name', $indexName)
            ->exists();
    }
};
