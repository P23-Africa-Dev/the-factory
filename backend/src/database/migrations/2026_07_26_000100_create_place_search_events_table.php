<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('place_search_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('source', 32)->default('system');
            $table->string('operation', 32);
            $table->string('provider_final', 32)->nullable();
            $table->json('providers_tried')->nullable();
            $table->boolean('cache_hit')->default(false);
            $table->unsignedTinyInteger('fallback_depth')->default(0);
            $table->unsignedInteger('latency_ms')->default(0);
            $table->unsignedInteger('result_count')->default(0);
            $table->decimal('confidence', 8, 4)->nullable();
            $table->string('sku', 64)->nullable();
            $table->decimal('credits_charged', 12, 4)->default(0);
            $table->decimal('estimated_usd', 12, 6)->default(0);
            $table->string('query_hash', 64)->nullable()->index();
            $table->string('query_truncated', 120)->nullable();
            $table->string('status', 32)->default('ok');
            $table->string('ip_hash', 64)->nullable();
            $table->timestamp('created_at')->useCurrent()->index();

            $table->index(['company_id', 'created_at']);
            $table->index(['provider_final', 'created_at']);
            $table->index(['operation', 'created_at']);
            $table->index(['source', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('place_search_events');
    }
};
