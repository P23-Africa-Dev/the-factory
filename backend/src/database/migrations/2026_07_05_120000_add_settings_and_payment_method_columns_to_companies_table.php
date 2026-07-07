<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('companies', 'pm_type')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->string('pm_type')->nullable()->after('stripe_id');
            });
        }

        if (! Schema::hasColumn('companies', 'pm_last_four')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->string('pm_last_four', 4)->nullable()->after('pm_type');
            });
        }

        if (! Schema::hasColumn('companies', 'pm_exp_month')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->unsignedTinyInteger('pm_exp_month')->nullable()->after('pm_last_four');
            });
        }

        if (! Schema::hasColumn('companies', 'pm_exp_year')) {
            Schema::table('companies', function (Blueprint $table): void {
                $table->unsignedSmallInteger('pm_exp_year')->nullable()->after('pm_exp_month');
            });
        }

        if (! Schema::hasColumn('companies', 'settings')) {
            Schema::table('companies', function (Blueprint $table): void {
                $after = Schema::hasColumn('companies', 'demo_config') ? 'demo_config' : 'stripe_id';
                $table->json('settings')->nullable()->after($after);
            });
        }
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            foreach ([
                'pm_type',
                'pm_last_four',
                'pm_exp_month',
                'pm_exp_year',
                'settings',
            ] as $column) {
                if (Schema::hasColumn('companies', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
