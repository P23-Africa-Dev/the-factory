<?php

declare(strict_types=1);

namespace App\Services\Admin\Database;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class DatabaseSchemaService
{
    public function __construct(private readonly DatabaseIntrospectionService $introspection) {}

    /**
     * Create a table with the given columns.
     *
     * @param array<int, array{name:string, type:string, nullable?:bool, default?:mixed, length?:int, unsigned?:bool}> $columns
     */
    public function createTable(string $table, array $columns): void
    {
        $this->assertName($table);

        if (Schema::hasTable($table)) {
            throw new RuntimeException("Table already exists: {$table}");
        }

        Schema::create($table, function (Blueprint $blueprint) use ($columns): void {
            $blueprint->id();
            foreach ($columns as $col) {
                $this->addColumn($blueprint, $col);
            }
            $blueprint->timestamps();
        });
    }

    public function dropTable(string $table): void
    {
        $this->introspection->assertTable($table);
        if ($this->introspection->isUndroppable($table)) {
            throw new RuntimeException("Table `{$table}` is protected from deletion.");
        }
        Schema::drop($table);
    }

    /** @param array{name:string, type:string, nullable?:bool, default?:mixed, length?:int, unsigned?:bool} $column */
    public function addColumnToTable(string $table, array $column): void
    {
        $this->introspection->assertTable($table);
        $this->assertName($column['name'] ?? '');
        Schema::table($table, function (Blueprint $blueprint) use ($column): void {
            $this->addColumn($blueprint, $column);
        });
    }

    public function dropColumn(string $table, string $column): void
    {
        $this->introspection->assertTable($table);
        $this->assertName($column);
        if ($this->introspection->isUndroppable($table)) {
            throw new RuntimeException("Columns of `{$table}` cannot be dropped via this UI.");
        }
        $pk = $this->introspection->primaryKey($table);
        if ($pk === $column) {
            throw new RuntimeException("Cannot drop primary key column `{$column}`.");
        }
        Schema::table($table, fn (Blueprint $b) => $b->dropColumn($column));
    }

    public function renameColumn(string $table, string $from, string $to): void
    {
        $this->introspection->assertTable($table);
        $this->assertName($from);
        $this->assertName($to);
        Schema::table($table, fn (Blueprint $b) => $b->renameColumn($from, $to));
    }

    /** @param array{name:string, type:string, nullable?:bool, default?:mixed, length?:int, unsigned?:bool} $column */
    private function addColumn(Blueprint $blueprint, array $column): void
    {
        $name = (string) ($column['name'] ?? '');
        $type = (string) ($column['type'] ?? 'string');
        $this->assertName($name);

        $col = match ($type) {
            'string' => $blueprint->string($name, (int) ($column['length'] ?? 255)),
            'text' => $blueprint->text($name),
            'longText' => $blueprint->longText($name),
            'integer' => $blueprint->integer($name),
            'bigInteger' => $blueprint->bigInteger($name),
            'unsignedBigInteger' => $blueprint->unsignedBigInteger($name),
            'boolean' => $blueprint->boolean($name),
            'decimal' => $blueprint->decimal($name, (int) ($column['length'] ?? 10), 2),
            'float' => $blueprint->float($name),
            'date' => $blueprint->date($name),
            'dateTime' => $blueprint->dateTime($name),
            'timestamp' => $blueprint->timestamp($name),
            'json' => $blueprint->json($name),
            'uuid' => $blueprint->uuid($name),
            default => throw new RuntimeException("Unsupported column type: {$type}"),
        };

        if (! empty($column['nullable'])) {
            $col->nullable();
        }
        if (array_key_exists('default', $column) && $column['default'] !== null && $column['default'] !== '') {
            $col->default($column['default']);
        }
    }

    private function assertName(string $name): void
    {
        if (! preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name)) {
            throw new RuntimeException("Invalid identifier: {$name}");
        }
    }

    /** @return array<int, string> */
    public static function supportedColumnTypes(): array
    {
        return [
            'string', 'text', 'longText', 'integer', 'bigInteger', 'unsignedBigInteger',
            'boolean', 'decimal', 'float', 'date', 'dateTime', 'timestamp', 'json', 'uuid',
        ];
    }
}
