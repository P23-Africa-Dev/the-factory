<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('assigned_agent_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('last_status_updated_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('title');
            $table->string('type');
            $table->text('description');
            $table->text('location_text');
            $table->text('address_full');
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->dateTime('due_at')->index();
            $table->json('required_actions')->nullable();
            $table->string('priority')->default('medium')->index();
            $table->unsignedSmallInteger('minimum_photos_required')->default(0);
            $table->boolean('visit_verification_required')->default(false);
            $table->string('status')->default('pending')->index();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'status', 'due_at']);
            $table->index(['company_id', 'assigned_agent_id', 'status']);
            $table->index(['company_id', 'type', 'priority']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
