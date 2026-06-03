<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // `tasks.status` is already a string column from the base migration.
        // Normalize legacy in-progress formatting before supporting paused/resumed states.
        DB::table('tasks')
            ->where('status', 'in-progress')
            ->update(['status' => 'in_progress']);
    }

    public function down(): void
    {
        DB::table('tasks')
            ->where('status', 'in_progress')
            ->update(['status' => 'in-progress']);
    }
};
