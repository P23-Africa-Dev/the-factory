<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const IS_DEMO_INDEX = 'companies_is_demo_index';

    public function up(): void
    {
        if (! Schema::hasColumn('companies', 'is_demo')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->boolean('is_demo')->default(false)->after('status');
            });
        }

        if (! Schema::hasColumn('companies', 'demo_config')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->json('demo_config')->nullable()->after('is_demo');
            });
        }

        if (! $this->indexExists(self::IS_DEMO_INDEX)) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->index('is_demo');
            });
        }

        DB::table('companies')
            ->whereIn('company_id', ['FAC-DEMOLDN1', 'FAC-DEMOLAG1'])
            ->update([
                'is_demo' => true,
                'subscription_status' => 'grace',
                'subscription_grace_ends_at' => '2099-12-31 23:59:59',
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        if ($this->indexExists(self::IS_DEMO_INDEX)) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->dropIndex(['is_demo']);
            });
        }

        Schema::table('companies', function (Blueprint $table): void {
            foreach (['is_demo', 'demo_config'] as $column) {
                if (Schema::hasColumn('companies', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }

    private function indexExists(string $indexName): bool
    {
        if (DB::getDriverName() === 'sqlite') {
            return DB::table('sqlite_master')
                ->where('type', 'index')
                ->where('name', $indexName)
                ->exists();
        }

        $database = DB::getDatabaseName();

        return DB::table('information_schema.statistics')
            ->where('table_schema', $database)
            ->where('table_name', 'companies')
            ->where('index_name', $indexName)
            ->exists();
    }
};
