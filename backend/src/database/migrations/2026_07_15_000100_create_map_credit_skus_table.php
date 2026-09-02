<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('map_credit_skus', function (Blueprint $table): void {
            $table->id();
            $table->string('sku')->unique();
            $table->string('label');
            // Credits charged per billed call (100 credits = $1). Fractional allowed.
            $table->decimal('credit_cost', 12, 4)->default(0);
            // Reference only: Google list price per 1,000 calls (USD), for admin context.
            $table->decimal('usd_per_1k', 12, 4)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('map_credit_skus');
    }
};
