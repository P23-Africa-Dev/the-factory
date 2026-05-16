<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lead_activities', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('type', 80)->default('note');
            $table->string('title')->nullable();
            $table->text('description')->nullable();
            $table->timestamp('happened_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['lead_id', 'created_at']);
            $table->index(['company_id', 'type']);
            $table->index(['company_id', 'happened_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_activities');
    }
};
