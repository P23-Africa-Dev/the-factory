<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A task can be tracked more than once over its lifetime (e.g. after a
 * reassignment ends the previous agent's session, or a paused task is resumed).
 * The original `task_id` UNIQUE constraint made a second `start()` fail with a
 * duplicate-key error. We replace the unique index with a plain index so each
 * start/complete cycle gets its own session row (and its own location trail),
 * while application logic still guarantees only one ACTIVE session at a time.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Add a plain index first so the foreign key keeps a usable index when
        // the unique index is dropped (MySQL requires an index for the FK).
        Schema::table('task_tracking_sessions', function (Blueprint $table): void {
            $table->index('task_id', 'task_tracking_sessions_task_id_index');
        });

        Schema::table('task_tracking_sessions', function (Blueprint $table): void {
            $table->dropUnique('task_tracking_sessions_task_id_unique');
        });
    }

    public function down(): void
    {
        Schema::table('task_tracking_sessions', function (Blueprint $table): void {
            $table->unique('task_id', 'task_tracking_sessions_task_id_unique');
        });

        Schema::table('task_tracking_sessions', function (Blueprint $table): void {
            $table->dropIndex('task_tracking_sessions_task_id_index');
        });
    }
};
