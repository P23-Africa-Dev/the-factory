<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('record_disclosures', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('admin_id')->nullable()->constrained('admin_users')->nullOnDelete();
            $table->string('report', 80);
            $table->string('action', 20);
            $table->string('requester_type', 40)->nullable();
            $table->string('reference', 191)->nullable();
            $table->text('note')->nullable();
            $table->date('from_date')->nullable();
            $table->date('to_date')->nullable();
            $table->json('filters')->nullable();
            $table->unsignedInteger('row_count')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('admin_id');
            $table->index('report');
            $table->index('action');
            $table->index('requester_type');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('record_disclosures');
    }
};
