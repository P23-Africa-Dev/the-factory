<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kpis', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('assigned_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('last_status_updated_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('name');
            $table->string('category', 40)->index();
            $table->text('objective');
            $table->string('target_value');
            $table->text('expected_outcome');
            $table->string('priority', 20)->default('medium')->index();
            $table->string('status', 30)->default('pending')->index();

            $table->date('start_date');
            $table->date('end_date')->index();

            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();

            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_id', 'status', 'end_date']);
            $table->index(['company_id', 'assigned_to_user_id', 'status']);
            $table->index(['company_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kpis');
    }
};
