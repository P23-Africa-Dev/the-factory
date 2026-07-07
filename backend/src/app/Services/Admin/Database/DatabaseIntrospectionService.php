<?php

declare(strict_types=1);

namespace App\Services\Admin\Database;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class DatabaseIntrospectionService
{
    /** @return array<int, array{name:string, rows:int, sensitive:bool}> */
    public function listTables(): array
    {
        $connection = DB::connection();
        $driver = $connection->getDriverName();
        $sensitive = (array) config('admin_database.sensitive_tables', []);

        $names = $this->tableNames();
        $tables = [];
        foreach ($names as $name) {
            $tables[] = [
                'name' => $name,
                'rows' => $this->approximateRowCount($name),
                'sensitive' => in_array($name, $sensitive, true),
            ];
        }

        usort($tables, fn ($a, $b) => strcmp($a['name'], $b['name']));

        return $tables;
    }

    /** @return array<int, string> */
    public function tableNames(): array
    {
        $connection = DB::connection();
        $driver = $connection->getDriverName();

        if ($driver === 'mysql') {
            $rows = $connection->select('SHOW TABLES');
            $out = [];
            foreach ($rows as $row) {
                $vars = get_object_vars($row);
                $out[] = (string) reset($vars);
            }
            return $out;
        }

        if ($driver === 'sqlite') {
            $rows = $connection->select("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            return array_map(fn ($r) => (string) $r->name, $rows);
        }

        return Schema::getTables() ? array_map(fn ($t) => $t['name'], Schema::getTables()) : [];
    }

    public function tableExists(string $table): bool
    {
        return in_array($table, $this->tableNames(), true);
    }

    /** @return array<int, array{name:string, type:string, nullable:bool, default:mixed, primary:bool, auto_increment:bool}> */
    public function columns(string $table): array
    {
        $this->assertTable($table);
        $connection = DB::connection();
        $driver = $connection->getDriverName();

        if ($driver === 'mysql') {
            $rows = $connection->select("SHOW FULL COLUMNS FROM `{$table}`");
            $out = [];
            foreach ($rows as $r) {
                $out[] = [
                    'name' => (string) $r->Field,
                    'type' => (string) $r->Type,
                    'nullable' => strtoupper((string) $r->Null) === 'YES',
                    'default' => $r->Default,
                    'primary' => strtoupper((string) $r->Key) === 'PRI',
                    'auto_increment' => str_contains(strtolower((string) $r->Extra), 'auto_increment'),
                    'comment' => (string) ($r->Comment ?? ''),
                ];
            }
            return $out;
        }

        if ($driver === 'sqlite') {
            $rows = $connection->select("PRAGMA table_info(`{$table}`)");
            $out = [];
            foreach ($rows as $r) {
                $out[] = [
                    'name' => (string) $r->name,
                    'type' => (string) $r->type,
                    'nullable' => ! (int) $r->notnull,
                    'default' => $r->dflt_value,
                    'primary' => (bool) ((int) $r->pk),
                    'auto_increment' => (bool) ((int) $r->pk) && strtolower((string) $r->type) === 'integer',
                    'comment' => '',
                ];
            }
            return $out;
        }

        throw new RuntimeException("Unsupported driver: {$driver}");
    }

    public function primaryKey(string $table): ?string
    {
        foreach ($this->columns($table) as $col) {
            if ($col['primary']) {
                return $col['name'];
            }
        }
        return null;
    }

    /** @return array<int, array{name:string, columns:array<int,string>, unique:bool}> */
    public function indexes(string $table): array
    {
        $this->assertTable($table);
        $connection = DB::connection();
        $driver = $connection->getDriverName();

        if ($driver === 'mysql') {
            $rows = $connection->select("SHOW INDEX FROM `{$table}`");
            $groups = [];
            foreach ($rows as $r) {
                $name = (string) $r->Key_name;
                $groups[$name] ??= ['name' => $name, 'columns' => [], 'unique' => ! (int) $r->Non_unique];
                $groups[$name]['columns'][] = (string) $r->Column_name;
            }
            return array_values($groups);
        }

        if ($driver === 'sqlite') {
            $rows = $connection->select("PRAGMA index_list(`{$table}`)");
            $out = [];
            foreach ($rows as $r) {
                $cols = $connection->select("PRAGMA index_info(`{$r->name}`)");
                $out[] = [
                    'name' => (string) $r->name,
                    'columns' => array_map(fn ($c) => (string) $c->name, $cols),
                    'unique' => (bool) ((int) $r->unique),
                ];
            }
            return $out;
        }

        return [];
    }

    public function approximateRowCount(string $table): int
    {
        try {
            return (int) DB::table($table)->count();
        } catch (\Throwable) {
            return 0;
        }
    }

    public function isSensitive(string $table): bool
    {
        return in_array($table, (array) config('admin_database.sensitive_tables', []), true);
    }

    public function isUndroppable(string $table): bool
    {
        return in_array($table, (array) config('admin_database.undroppable_tables', []), true);
    }

    public function assertTable(string $table): void
    {
        if (! preg_match('/^[A-Za-z0-9_]+$/', $table)) {
            throw new RuntimeException("Invalid table name: {$table}");
        }
        if (! $this->tableExists($table)) {
            throw new RuntimeException("Table not found: {$table}");
        }
    }
}
