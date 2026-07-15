<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('map_credit_transactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            // allocation | topup | consumption | reset | admin_adjust
            $table->string('type', 32);
            // Google SKU for consumption rows (nearby, details, autocomplete, poi-details).
            $table->string('sku', 64)->nullable();
            // Signed credits: positive for grants/top-ups, negative for consumption.
            $table->decimal('credits', 14, 4);
            // Signed USD equivalent (credits / credits_per_usd).
            $table->decimal('usd_amount', 12, 4)->default(0);
            // Total balance (plan + topup) after applying this row.
            $table->decimal('balance_after', 14, 4)->default(0);
            // dashboard | pwa | admin | webhook | system
            $table->string('source', 32)->default('system');
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'created_at']);
            $table->index(['company_id', 'type']);
            $table->index('sku');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('map_credit_transactions');
    }
};
