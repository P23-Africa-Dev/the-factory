<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_logs', function (Blueprint $table): void {
            $table->string('routing_purpose', 40)->nullable()->after('tool_name')->index();
        });
    }

    public function down(): void
    {
        Schema::table('ai_logs', function (Blueprint $table): void {
            $table->dropColumn('routing_purpose');
        });
    }
};
