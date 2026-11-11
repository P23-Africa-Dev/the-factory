<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_subtasks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('assigned_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('completed_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('title', 255);
            $table->dateTime('due_at')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->boolean('is_completed')->default(false);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['task_id', 'position']);
            $table->index(['company_id', 'assigned_user_id', 'is_completed']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_subtasks');
    }
};
