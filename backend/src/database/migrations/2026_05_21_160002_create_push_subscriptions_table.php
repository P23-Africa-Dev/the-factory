<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->string('provider')->default('fcm')->index();
            $table->string('platform')->nullable()->index();
            $table->string('device_token', 2048);
            $table->char('device_token_hash', 64)->unique();
            $table->string('endpoint', 2048)->nullable();
            $table->json('subscription_payload')->nullable();
            $table->text('user_agent')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedInteger('failed_attempts')->default(0);
            $table->text('last_failure_reason')->nullable();
            $table->timestamp('last_failed_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'company_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
    }
};
