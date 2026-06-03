<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_automation_rules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->text('prompt');
            $table->string('trigger_type', 40);
            $table->string('trigger_expression', 255)->nullable();
            $table->string('action_tool', 120);
            $table->json('action_args')->nullable();
            $table->string('status', 40)->default('active');
            $table->timestamp('last_run_at')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'action_tool']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_automation_rules');
    }
};
