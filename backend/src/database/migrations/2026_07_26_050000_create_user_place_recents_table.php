<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_place_recents', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 255);
            $table->string('address', 512)->nullable();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->string('provider', 32)->nullable();
            $table->string('provider_place_id', 191)->nullable();
            $table->timestamp('last_used_at')->useCurrent();
            $table->timestamps();

            $table->index(['user_id', 'last_used_at']);
            $table->index(['user_id', 'provider', 'provider_place_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_place_recents');
    }
};
