<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('push_subscriptions')) {
            $this->repairExistingPushSubscriptionsTable();

            return;
        }

        Schema::create('push_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->string('provider')->default('fcm')->index();
            $table->string('platform')->nullable()->index();
            $table->string('device_token', 2048);
            $table->char('device_token_hash', 64)->unique();
            $table->string('endpoint', 2048)->nullable();
            $table->json('subscription_payload')->nullable();
            $table->text('user_agent')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedInteger('failed_attempts')->default(0);
            $table->text('last_failure_reason')->nullable();
            $table->timestamp('last_failed_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'company_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
    }

    private function repairExistingPushSubscriptionsTable(): void
    {
        Schema::table('push_subscriptions', function (Blueprint $table): void {
            if (! Schema::hasColumn('push_subscriptions', 'device_token_hash')) {
                $table->char('device_token_hash', 64)->nullable()->after('device_token');
            }
        });

        if ($this->indexExists('push_subscriptions', 'push_subscriptions_device_token_unique')) {
            Schema::table('push_subscriptions', function (Blueprint $table): void {
                $table->dropUnique('push_subscriptions_device_token_unique');
            });
        }

        DB::statement(
            "UPDATE push_subscriptions SET device_token_hash = SHA2(device_token, 256) WHERE device_token_hash IS NULL OR device_token_hash = ''"
        );

        // Keep the newest row per token hash to satisfy unique constraint creation.
        DB::statement(
            'DELETE older FROM push_subscriptions older INNER JOIN push_subscriptions newer ON older.device_token_hash = newer.device_token_hash AND older.id < newer.id'
        );

        if (! $this->indexExists('push_subscriptions', 'push_subscriptions_device_token_hash_unique')) {
            Schema::table('push_subscriptions', function (Blueprint $table): void {
                $table->unique('device_token_hash');
            });
        }

        if (! $this->indexExists('push_subscriptions', 'push_subscriptions_user_id_company_id_is_active_index')) {
            Schema::table('push_subscriptions', function (Blueprint $table): void {
                $table->index(['user_id', 'company_id', 'is_active']);
            });
        }
    }

    private function indexExists(string $tableName, string $indexName): bool
    {
        return DB::table('information_schema.statistics')
            ->where('table_schema', DB::getDatabaseName())
            ->where('table_name', $tableName)
            ->where('index_name', $indexName)
            ->exists();
    }
};
