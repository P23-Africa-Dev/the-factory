<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TABLE = 'attendance_payroll_summaries';
    private const LEGACY_UNIQUE = 'attendance_payroll_summaries_unique_period';
    private const LEGACY_SUPPORT_INDEX = 'attendance_payroll_summaries_period_legacy_index';
    private const CYCLE_UNIQUE = 'attendance_payroll_summaries_unique_cycle_period';
    private const CYCLE_INDEX = 'attendance_payroll_summaries_cycle_period_index';

    public function up(): void
    {
        Schema::table(self::TABLE, function (Blueprint $table): void {
            if (Schema::hasColumn(self::TABLE, 'cycle_type')) {
                return;
            }

            $table->string('cycle_type', 20)->default('monthly')->after('payroll_setting_id');
            $table->string('status', 20)->default('pending')->after('currency');
            $table->timestamp('approved_at')->nullable()->after('status');
            $table->foreignId('approved_by_user_id')->nullable()->after('approved_at')->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable()->after('approved_by_user_id');
            $table->foreignId('revoked_by_user_id')->nullable()->after('revoked_at')->constrained('users')->nullOnDelete();
            $table->text('approval_reason')->nullable()->after('revoked_by_user_id');
        });

        DB::table(self::TABLE)
            ->whereNull('cycle_type')
            ->update([
                'cycle_type' => 'monthly',
                'status' => 'pending',
            ]);

        // Keep FK compatibility on MySQL by ensuring an alternate index exists
        // before dropping the old unique key.
        if (! $this->indexExists(self::TABLE, self::LEGACY_SUPPORT_INDEX)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->index(['company_id', 'user_id', 'period_year', 'period_month'], self::LEGACY_SUPPORT_INDEX);
            });
        }

        if ($this->indexExists(self::TABLE, self::LEGACY_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->dropUnique(self::LEGACY_UNIQUE);
            });
        }

        if (! $this->indexExists(self::TABLE, self::CYCLE_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->unique(
                    ['company_id', 'user_id', 'cycle_type', 'period_start', 'period_end'],
                    self::CYCLE_UNIQUE
                );
            });
        }

        if (! $this->indexExists(self::TABLE, self::CYCLE_INDEX)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->index(['company_id', 'cycle_type', 'period_start', 'period_end'], self::CYCLE_INDEX);
            });
        }
    }

    public function down(): void
    {
        Schema::table(self::TABLE, function (Blueprint $table): void {
            if (! Schema::hasColumn(self::TABLE, 'cycle_type')) {
                return;
            }

            if (Schema::hasColumn(self::TABLE, 'approved_by_user_id')) {
                $table->dropConstrainedForeignId('approved_by_user_id');
            }
            if (Schema::hasColumn(self::TABLE, 'revoked_by_user_id')) {
                $table->dropConstrainedForeignId('revoked_by_user_id');
            }

            $table->dropColumn([
                'cycle_type',
                'status',
                'approved_at',
                'revoked_at',
                'approval_reason',
            ]);
        });

        if ($this->indexExists(self::TABLE, self::CYCLE_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->dropUnique(self::CYCLE_UNIQUE);
            });
        }

        if ($this->indexExists(self::TABLE, self::CYCLE_INDEX)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->dropIndex(self::CYCLE_INDEX);
            });
        }

        if (! $this->indexExists(self::TABLE, self::LEGACY_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->unique(['company_id', 'user_id', 'period_year', 'period_month'], self::LEGACY_UNIQUE);
            });
        }

        if ($this->indexExists(self::TABLE, self::LEGACY_SUPPORT_INDEX)) {
            Schema::table(self::TABLE, function (Blueprint $table): void {
                $table->dropIndex(self::LEGACY_SUPPORT_INDEX);
            });
        }
    }

    private function indexExists(string $table, string $indexName): bool
    {
        return DB::table('information_schema.statistics')
            ->where('table_schema', DB::getDatabaseName())
            ->where('table_name', $table)
            ->where('index_name', $indexName)
            ->exists();
    }
};
