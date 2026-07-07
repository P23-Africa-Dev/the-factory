<?php

declare(strict_types=1);

namespace App\Services\Admin\Database;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class DatabaseRowService
{
    public function __construct(private readonly DatabaseIntrospectionService $introspection) {}

    public function paginate(string $table, int $perPage = 25, ?string $search = null): LengthAwarePaginator
    {
        $this->introspection->assertTable($table);
        $pk = $this->introspection->primaryKey($table);

        $query = DB::table($table);

        if ($search !== null && trim($search) !== '') {
            $needle = '%' . trim($search) . '%';
            $textCols = array_filter($this->introspection->columns($table), function (array $c): bool {
                return preg_match('/(char|text|json|enum|uuid)/i', $c['type']) === 1;
            });
            $query->where(function ($q) use ($textCols, $needle): void {
                foreach ($textCols as $c) {
                    $q->orWhere($c['name'], 'like', $needle);
                }
            });
        }

        if ($pk) {
            $query->orderBy($pk, 'desc');
        }

        return $query->paginate($perPage)->withQueryString();
    }

    /** @return object|null */
    public function find(string $table, string $primaryValue): ?object
    {
        $this->introspection->assertTable($table);
        $pk = $this->introspection->primaryKey($table)
            ?? throw new RuntimeException("Table {$table} has no primary key; row lookup unsupported.");

        return DB::table($table)->where($pk, $primaryValue)->first();
    }

    /** @param array<string, mixed> $data */
    public function insert(string $table, array $data): int|string
    {
        $this->introspection->assertTable($table);
        $data = $this->filterFillable($table, $data);
        $pk = $this->introspection->primaryKey($table);

        if ($pk) {
            return DB::table($table)->insertGetId($data);
        }
        DB::table($table)->insert($data);
        return 0;
    }

    /** @param array<string, mixed> $data */
    public function update(string $table, string $primaryValue, array $data): int
    {
        $this->introspection->assertTable($table);
        $pk = $this->introspection->primaryKey($table)
            ?? throw new RuntimeException("Table {$table} has no primary key; row update unsupported.");
        $data = $this->filterFillable($table, $data, allowPrimary: false);

        return DB::table($table)->where($pk, $primaryValue)->update($data);
    }

    public function delete(string $table, string $primaryValue): int
    {
        $this->introspection->assertTable($table);
        $pk = $this->introspection->primaryKey($table)
            ?? throw new RuntimeException("Table {$table} has no primary key; row delete unsupported.");

        return DB::table($table)->where($pk, $primaryValue)->delete();
    }

    /** @param array<string,mixed> $data */
    private function filterFillable(string $table, array $data, bool $allowPrimary = true): array
    {
        $columns = $this->introspection->columns($table);
        $allowed = [];
        foreach ($columns as $col) {
            $name = $col['name'];
            if (! $allowPrimary && $col['primary'] && $col['auto_increment']) {
                continue;
            }
            if (! array_key_exists($name, $data)) {
                continue;
            }
            $value = $data[$name];
            if ($value === '' && $col['nullable']) {
                $allowed[$name] = null;
            } else {
                $allowed[$name] = $value;
            }
        }
        return $allowed;
    }
}
