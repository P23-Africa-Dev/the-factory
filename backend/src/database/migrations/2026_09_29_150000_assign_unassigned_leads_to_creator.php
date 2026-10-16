<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('UPDATE leads SET assigned_to_user_id = created_by_user_id WHERE assigned_to_user_id IS NULL AND created_by_user_id IS NOT NULL');
    }

    public function down(): void
    {
        // The previous assignee is not recoverable once it has been filled from the creator.
    }
};
