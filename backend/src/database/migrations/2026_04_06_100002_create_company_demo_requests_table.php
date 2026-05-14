<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('company_demo_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('full_name');
            $table->string('email')->index();
            $table->string('company_name');
            $table->string('country', 2);
            $table->string('team_size');
            $table->text('use_case');
            $table->string('status')->default('pending');

            $table->foreignId('reviewed_by_admin_id')->nullable()->constrained('admin_users')->nullOnDelete();
            $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('activation_token_hash', 64)->nullable();
            $table->timestamp('activation_link_expires_at')->nullable();
            $table->timestamp('last_activation_sent_at')->nullable();

            $table->timestamp('requested_at')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('activated_at')->nullable();
            $table->text('admin_notes')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index(['email', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('company_demo_requests');
    }
};
