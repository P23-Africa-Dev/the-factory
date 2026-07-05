<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            $table->string('pm_type')->nullable()->after('stripe_id');
            $table->string('pm_last_four', 4)->nullable()->after('pm_type');
            $table->unsignedTinyInteger('pm_exp_month')->nullable()->after('pm_last_four');
            $table->unsignedSmallInteger('pm_exp_year')->nullable()->after('pm_exp_month');
            $table->json('settings')->nullable()->after('demo_config');
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            $table->dropColumn([
                'pm_type',
                'pm_last_four',
                'pm_exp_month',
                'pm_exp_year',
                'settings',
            ]);
        });
    }
};
