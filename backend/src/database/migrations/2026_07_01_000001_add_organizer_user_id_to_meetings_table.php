<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('meetings', function (Blueprint $table): void {
            $table->foreignId('organizer_user_id')->nullable()->after('created_by_user_id')->constrained('users')->nullOnDelete();
            $table->index('organizer_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('meetings', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('organizer_user_id');
        });
    }
};
