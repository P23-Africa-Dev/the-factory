<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_alerts', function (Blueprint $table): void {
            $table->id();
            $table->string('type', 60)->index();
            $table->string('provider', 40)->nullable()->index();
            $table->string('severity', 20)->default('warning')->index();
            $table->string('title', 200);
            $table->text('message');
            $table->string('status', 20)->default('active')->index();
            $table->timestamp('resolved_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_alerts');
    }
};
