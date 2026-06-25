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
        Schema::table('leads', function (Blueprint $table): void {
            $table->decimal('budget_amount', 15, 2)->nullable()->after('priority');
            $table->char('budget_currency', 3)->nullable()->after('budget_amount');
        });

        // Backfill budget_amount from legacy meta.value when present.
        DB::table('leads')
            ->whereNotNull('meta')
            ->orderBy('id')
            ->chunkById(200, function ($leads): void {
                foreach ($leads as $lead) {
                    $meta = json_decode((string) $lead->meta, true);
                    if (! is_array($meta) || ! isset($meta['value']) || ! is_numeric($meta['value'])) {
                        continue;
                    }

                    DB::table('leads')
                        ->where('id', $lead->id)
                        ->update([
                            'budget_amount' => (float) $meta['value'],
                            'budget_currency' => 'USD',
                        ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->dropColumn(['budget_amount', 'budget_currency']);
        });
    }
};
