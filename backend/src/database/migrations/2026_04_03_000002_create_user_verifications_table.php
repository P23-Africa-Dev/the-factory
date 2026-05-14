<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_verifications', function (Blueprint $table): void {
            $table->id();
            $table->string('email')->index();
            $table->string('otp_code');         // HMAC-SHA256 hash of the raw OTP
            $table->string('type')->default('registration');
            $table->string('ip_address')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->timestamps();

            $table->index(['email', 'type', 'used_at', 'expires_at'], 'verifications_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_verifications');
    }
};
