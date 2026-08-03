<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('field_daily_summaries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('field_activity_session_id')->nullable()->constrained('field_activity_sessions')->nullOnDelete();
            $table->date('summary_date');

            $table->unsignedBigInteger('distance_meters')->default(0);
            $table->unsignedInteger('travel_seconds')->default(0);
            $table->unsignedInteger('stationary_seconds')->default(0);
            $table->unsignedInteger('stop_count')->default(0);
            $table->unsignedInteger('visit_count')->default(0);
            $table->unsignedInteger('unknown_stop_count')->default(0);
            $table->unsignedInteger('personal_stop_count')->default(0);
            $table->unsignedInteger('ignored_stop_count')->default(0);

            $table->text('narrative')->nullable();
            $table->json('metrics')->nullable();
            $table->timestamp('generated_at')->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'user_id', 'summary_date'], 'field_daily_summaries_unique_day');
            $table->index(['company_id', 'summary_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('field_daily_summaries');
    }
};
