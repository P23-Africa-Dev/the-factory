<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_settings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete()->unique();
            $table->time('opening_time');
            $table->time('closing_time');
            $table->json('working_days');
            $table->unsignedSmallInteger('clockin_window_minutes')->default(15);
            $table->boolean('auto_clockout_enabled')->default(true);
            $table->timestamps();

            $table->index(['company_id', 'opening_time', 'closing_time']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_settings');
    }
};
