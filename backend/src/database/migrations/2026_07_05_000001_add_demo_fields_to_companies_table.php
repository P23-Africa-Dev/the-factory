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
        Schema::table('companies', function (Blueprint $table): void {
            $table->boolean('is_demo')->default(false)->after('status');
            $table->json('demo_config')->nullable()->after('is_demo');
            $table->index('is_demo');
        });

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
        Schema::table('companies', function (Blueprint $table): void {
            $table->dropIndex(['is_demo']);
            $table->dropColumn(['is_demo', 'demo_config']);
        });
    }
};
