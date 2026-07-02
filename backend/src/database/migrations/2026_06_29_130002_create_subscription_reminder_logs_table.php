<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_reminder_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('reminder_type');
            $table->unsignedSmallInteger('days_remaining')->nullable();
            $table->timestamp('sent_at');
            $table->timestamps();

            $table->unique(['company_id', 'reminder_type', 'days_remaining', 'sent_at'], 'subscription_reminder_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_reminder_logs');
    }
};
