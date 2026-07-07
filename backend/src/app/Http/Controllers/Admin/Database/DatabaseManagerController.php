<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Database;

use App\Http\Controllers\Controller;
use App\Services\Admin\AdminActionLogger;
use App\Services\Admin\Database\DatabaseIntrospectionService;
use App\Services\Admin\Database\DatabaseRowService;
use App\Services\Admin\Database\DatabaseSchemaService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

class DatabaseManagerController extends Controller
{
    public function __construct(
        private readonly DatabaseIntrospectionService $introspection,
        private readonly DatabaseRowService $rows,
        private readonly DatabaseSchemaService $schema,
        private readonly AdminActionLogger $logger,
    ) {}

    public function index(): View
    {
        return view('admin.database.index', [
            'tables' => $this->introspection->listTables(),
            'connection' => DB::connection()->getName(),
            'driver' => DB::connection()->getDriverName(),
        ]);
    }

    public function showTable(string $table, Request $request): View
    {
        $this->introspection->assertTable($table);
        $view = $request->string('view', 'data')->toString();
        if (! in_array($view, ['data', 'structure', 'indexes'], true)) {
            $view = 'data';
        }

        $rows = $view === 'data'
            ? $this->rows->paginate($table, 25, $request->string('search')->toString() ?: null)
            : null;

        return view('admin.database.table', [
            'table' => $table,
            'view' => $view,
            'columns' => $this->introspection->columns($table),
            'indexes' => $this->introspection->indexes($table),
            'primaryKey' => $this->introspection->primaryKey($table),
            'sensitive' => $this->introspection->isSensitive($table),
            'undroppable' => $this->introspection->isUndroppable($table),
            'rows' => $rows,
            'search' => $request->string('search')->toString(),
        ]);
    }

    public function createRow(string $table): View
    {
        $this->introspection->assertTable($table);
        return view('admin.database.row-form', [
            'table' => $table,
            'columns' => $this->introspection->columns($table),
            'primaryKey' => $this->introspection->primaryKey($table),
            'sensitive' => $this->introspection->isSensitive($table),
            'row' => null,
            'mode' => 'create',
        ]);
    }

    public function storeRow(string $table, Request $request): RedirectResponse
    {
        $this->introspection->assertTable($table);
        $data = $request->except(['_token', 'confirm']);
        $newId = $this->rows->insert($table, $data);
        $this->logger->log('db_manager.row.create', $table, (string) $newId, ['fields' => array_keys($data)]);

        return redirect()->route('admin.database.tables.show', $table)
            ->with('status', "Row inserted (id: {$newId}).");
    }

    public function editRow(string $table, string $id): View
    {
        $this->introspection->assertTable($table);
        $row = $this->rows->find($table, $id);
        abort_if($row === null, 404, 'Row not found.');

        return view('admin.database.row-form', [
            'table' => $table,
            'columns' => $this->introspection->columns($table),
            'primaryKey' => $this->introspection->primaryKey($table),
            'sensitive' => $this->introspection->isSensitive($table),
            'row' => (array) $row,
            'mode' => 'edit',
            'rowId' => $id,
        ]);
    }

    public function updateRow(string $table, string $id, Request $request): RedirectResponse
    {
        $this->introspection->assertTable($table);
        $data = $request->except(['_token', '_method', 'confirm']);
        $this->rows->update($table, $id, $data);
        $this->logger->log('db_manager.row.update', $table, $id, ['fields' => array_keys($data)]);

        return redirect()->route('admin.database.tables.show', $table)
            ->with('status', "Row {$id} updated.");
    }

    public function destroyRow(string $table, string $id): RedirectResponse
    {
        $this->introspection->assertTable($table);
        $this->rows->delete($table, $id);
        $this->logger->log('db_manager.row.delete', $table, $id);

        return redirect()->route('admin.database.tables.show', $table)
            ->with('status', "Row {$id} deleted.");
    }

    public function createTableForm(): View
    {
        return view('admin.database.table-create', [
            'types' => DatabaseSchemaService::supportedColumnTypes(),
        ]);
    }

    public function storeTable(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'regex:/^[A-Za-z_][A-Za-z0-9_]*$/'],
            'columns' => ['required', 'array', 'min:1'],
            'columns.*.name' => ['required', 'string', 'regex:/^[A-Za-z_][A-Za-z0-9_]*$/'],
            'columns.*.type' => ['required', 'string'],
            'columns.*.nullable' => ['sometimes', 'boolean'],
        ]);

        $this->schema->createTable($data['name'], $data['columns']);
        $this->logger->log('db_manager.schema.table.create', $data['name'], null, ['columns' => $data['columns']]);

        return redirect()->route('admin.database.tables.show', $data['name'])
            ->with('status', "Table `{$data['name']}` created.");
    }

    public function dropTable(string $table): RedirectResponse
    {
        $this->schema->dropTable($table);
        $this->logger->log('db_manager.schema.table.drop', $table);
        return redirect()->route('admin.database.index')->with('status', "Table `{$table}` dropped.");
    }

    public function addColumn(string $table, Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'regex:/^[A-Za-z_][A-Za-z0-9_]*$/'],
            'type' => ['required', 'string'],
            'nullable' => ['sometimes', 'boolean'],
            'default' => ['nullable', 'string'],
            'length' => ['nullable', 'integer', 'min:1', 'max:65535'],
        ]);

        $this->schema->addColumnToTable($table, $data);
        $this->logger->log('db_manager.schema.column.add', $table, null, $data);

        return redirect()->route('admin.database.tables.show', ['table' => $table, 'view' => 'structure'])
            ->with('status', "Column `{$data['name']}` added.");
    }

    public function dropColumn(string $table, string $column): RedirectResponse
    {
        $this->schema->dropColumn($table, $column);
        $this->logger->log('db_manager.schema.column.drop', $table, $column);
        return redirect()->route('admin.database.tables.show', ['table' => $table, 'view' => 'structure'])
            ->with('status', "Column `{$column}` dropped from `{$table}`.");
    }
}
