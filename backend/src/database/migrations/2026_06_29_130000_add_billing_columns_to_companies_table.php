<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const STATUS_PERIOD_INDEX = 'companies_sub_status_period_idx';

    public function up(): void
    {
        if (! Schema::hasColumn('companies', 'stripe_id')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->string('stripe_id')->nullable()->index()->after('activated_at');
            });
        }

        if (! Schema::hasColumn('companies', 'subscription_plan_key')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->string('subscription_plan_key')->nullable()->after('stripe_id');
            });
        }

        if (! Schema::hasColumn('companies', 'subscription_billing_interval')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->string('subscription_billing_interval')->nullable()->after('subscription_plan_key');
            });
        }

        if (! Schema::hasColumn('companies', 'subscription_status')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->string('subscription_status')->default('none')->after('subscription_billing_interval');
            });
        }

        if (! Schema::hasColumn('companies', 'subscription_current_period_start')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->timestamp('subscription_current_period_start')->nullable()->after('subscription_status');
            });
        }

        if (! Schema::hasColumn('companies', 'subscription_current_period_end')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->timestamp('subscription_current_period_end')->nullable()->after('subscription_current_period_start');
            });
        }

        if (! Schema::hasColumn('companies', 'subscription_grace_ends_at')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->timestamp('subscription_grace_ends_at')->nullable()->after('subscription_current_period_end');
            });
        }

        if (! Schema::hasColumn('companies', 'assigned_plan_key')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->string('assigned_plan_key')->nullable()->after('subscription_grace_ends_at');
            });
        }

        if (! Schema::hasColumn('companies', 'assigned_billing_interval')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->string('assigned_billing_interval')->nullable()->after('assigned_plan_key');
            });
        }

        if (! Schema::hasColumn('companies', 'payment_link_token_hash')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->string('payment_link_token_hash')->nullable()->after('assigned_billing_interval');
            });
        }

        if (! Schema::hasColumn('companies', 'payment_link_expires_at')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->timestamp('payment_link_expires_at')->nullable()->after('payment_link_token_hash');
            });
        }

        if (! $this->indexExists(self::STATUS_PERIOD_INDEX)) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->index(['subscription_status', 'subscription_current_period_end'], self::STATUS_PERIOD_INDEX);
            });
        }
    }

    public function down(): void
    {
        if ($this->indexExists(self::STATUS_PERIOD_INDEX)) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->dropIndex(self::STATUS_PERIOD_INDEX);
            });
        }

        Schema::table('companies', function (Blueprint $table): void {
            foreach ([
                'stripe_id',
                'subscription_plan_key',
                'subscription_billing_interval',
                'subscription_status',
                'subscription_current_period_start',
                'subscription_current_period_end',
                'subscription_grace_ends_at',
                'assigned_plan_key',
                'assigned_billing_interval',
                'payment_link_token_hash',
                'payment_link_expires_at',
            ] as $column) {
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
