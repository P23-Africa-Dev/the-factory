<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            $table->string('stripe_id')->nullable()->index()->after('activated_at');
            $table->string('subscription_plan_key')->nullable()->after('stripe_id');
            $table->string('subscription_billing_interval')->nullable()->after('subscription_plan_key');
            $table->string('subscription_status')->default('none')->after('subscription_billing_interval');
            $table->timestamp('subscription_current_period_start')->nullable()->after('subscription_status');
            $table->timestamp('subscription_current_period_end')->nullable()->after('subscription_current_period_start');
            $table->timestamp('subscription_grace_ends_at')->nullable()->after('subscription_current_period_end');
            $table->string('assigned_plan_key')->nullable()->after('subscription_grace_ends_at');
            $table->string('assigned_billing_interval')->nullable()->after('assigned_plan_key');
            $table->string('payment_link_token_hash')->nullable()->after('assigned_billing_interval');
            $table->timestamp('payment_link_expires_at')->nullable()->after('payment_link_token_hash');

            $table->index(['subscription_status', 'subscription_current_period_end']);
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            $table->dropIndex(['subscription_status', 'subscription_current_period_end']);
            $table->dropColumn([
                'stripe_id',
                'subscription_plan_key',
                'subscription_billing_interval',
                'subscription_status',
                'subscription_current_period_start',
                'subscription_current_period_end',
                'subscription_grace_ends_at',
                'assigned_plan_key',
                'assigned_billing_interval',
                'payment_link_token_hash',
                'payment_link_expires_at',
            ]);
        });
    }
};
