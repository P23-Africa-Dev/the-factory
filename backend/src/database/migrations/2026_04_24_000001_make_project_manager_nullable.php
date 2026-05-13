<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table): void {
            $table->dropForeign(['project_manager_user_id']);
            $table->foreignId('project_manager_user_id')
                ->nullable()
                ->change()
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table): void {
            $table->dropForeign(['project_manager_user_id']);
            $table->foreignId('project_manager_user_id')
                ->nullable(false)
                ->change()
                ->constrained('users')
                ->cascadeOnDelete();
        });
    }
};
