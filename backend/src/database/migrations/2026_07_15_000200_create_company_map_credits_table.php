<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('company_map_credits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->unique()->constrained('companies')->cascadeOnDelete();
            // Plan-allocated credits: reset to `allocation_credits` each billing cycle.
            $table->decimal('plan_credits', 14, 4)->default(0);
            // Purchased top-up credits: roll over, never expire.
            $table->decimal('topup_credits', 14, 4)->default(0);
            // Snapshot of the current monthly allocation (5% of plan price -> credits).
            $table->decimal('allocation_credits', 14, 4)->default(0);
            // Lifetime counters (never reset) for reporting.
            $table->decimal('lifetime_consumed', 16, 4)->default(0);
            $table->decimal('lifetime_topped_up', 16, 4)->default(0);
            $table->timestamp('period_start')->nullable();
            $table->timestamp('period_end')->nullable();
            $table->timestamp('last_reset_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('company_map_credits');
    }
};
