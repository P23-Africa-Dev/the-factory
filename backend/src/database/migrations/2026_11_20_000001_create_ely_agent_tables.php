<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Storage for the tool-calling ELY engine: threads and messages (including
 * tool calls), actions waiting for confirmation, and an audit log of every
 * action ELY ran.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ely_threads', function (Blueprint $table): void {
            $table->string('id', 64)->primary();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('title', 255)->nullable();
            $table->text('summary')->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_id', 'user_id', 'last_message_at']);
        });

        Schema::create('ely_messages', function (Blueprint $table): void {
            $table->id();
            $table->string('thread_id', 64);
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('role', 20); // user | assistant | tool
            $table->longText('content')->nullable();
            $table->json('tool_calls')->nullable();
            $table->string('tool_call_id', 128)->nullable();
            $table->string('tool_name', 120)->nullable();
            $table->boolean('is_error')->default(false);
            $table->json('payload')->nullable();
            $table->string('provider', 40)->nullable();
            $table->string('model', 120)->nullable();
            $table->unsignedInteger('input_tokens')->nullable();
            $table->unsignedInteger('output_tokens')->nullable();
            $table->timestamps();

            $table->foreign('thread_id')->references('id')->on('ely_threads')->cascadeOnDelete();
            $table->index(['thread_id', 'id']);
        });

        Schema::create('ely_pending_actions', function (Blueprint $table): void {
            $table->string('id', 64)->primary();
            $table->string('thread_id', 64);
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('tool', 120);
            $table->json('args');
            $table->string('args_hash', 64);
            $table->unsignedInteger('version')->default(1);
            $table->string('status', 20)->default('pending'); // pending|confirmed|cancelled|expired|failed
            $table->string('tool_call_id', 128)->nullable();
            $table->json('result')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->foreign('thread_id')->references('id')->on('ely_threads')->cascadeOnDelete();
            $table->index(['thread_id', 'status']);
            $table->index(['company_id', 'user_id', 'status']);
        });

        Schema::create('ely_action_audits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('role', 20);
            $table->string('thread_id', 64)->nullable();
            $table->string('tool', 120);
            $table->json('args')->nullable();
            $table->string('outcome', 20); // succeeded|failed|denied
            $table->text('error')->nullable();
            $table->json('result')->nullable();
            $table->string('pending_action_id', 64)->nullable();
            $table->boolean('confirmed')->default(false);
            $table->json('undo')->nullable();
            $table->timestamp('undone_at')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamps();

            $table->index(['company_id', 'created_at']);
            $table->index(['company_id', 'user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ely_action_audits');
        Schema::dropIfExists('ely_pending_actions');
        Schema::dropIfExists('ely_messages');
        Schema::dropIfExists('ely_threads');
    }
};
