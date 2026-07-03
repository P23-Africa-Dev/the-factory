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
        Schema::create('billing_plans', function (Blueprint $table): void {
            $table->id();
            $table->string('plan_key')->unique();
            $table->string('label');
            $table->unsignedInteger('seat_limit');
            $table->unsignedInteger('monthly_amount');
            $table->unsignedInteger('annual_amount');
            $table->string('monthly_price_id')->nullable();
            $table->string('annual_price_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        $plans = (array) config('billing.plans', []);
        $sortOrder = 0;

        foreach ($plans as $planKey => $plan) {
            if (! is_array($plan)) {
                continue;
            }

            DB::table('billing_plans')->insert([
                'plan_key' => (string) $planKey,
                'label' => (string) ($plan['label'] ?? $planKey),
                'seat_limit' => (int) ($plan['seat_limit'] ?? 0),
                'monthly_amount' => (int) ($plan['monthly_amount'] ?? 0),
                'annual_amount' => (int) ($plan['annual_amount'] ?? 0),
                'monthly_price_id' => ($plan['monthly_price_id'] ?? null) ?: null,
                'annual_price_id' => ($plan['annual_price_id'] ?? null) ?: null,
                'is_active' => (bool) ($plan['is_active'] ?? true),
                'sort_order' => (int) ($plan['sort_order'] ?? $sortOrder),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $sortOrder += 10;
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_plans');
    }
};
