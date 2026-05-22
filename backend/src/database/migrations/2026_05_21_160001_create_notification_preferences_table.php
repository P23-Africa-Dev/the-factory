<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_preferences', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->string('category')->index();
            $table->boolean('is_enabled')->default(true);
            $table->boolean('in_app_enabled')->default(true);
            $table->boolean('push_enabled')->default(true);
            $table->boolean('email_enabled')->default(true);
            $table->timestamp('muted_until')->nullable();
            $table->json('quiet_hours')->nullable();
            $table->string('digest_mode')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'company_id', 'category'], 'notification_preferences_unique_scope');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_preferences');
    }
};
