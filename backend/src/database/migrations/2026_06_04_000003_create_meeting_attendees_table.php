<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meeting_attendees', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('meeting_id')->constrained('meetings')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('email');
            $table->string('display_name')->nullable();
            $table->string('response_status')->default('needs_action')->index();
            $table->boolean('is_optional')->default(false);
            $table->boolean('is_organizer')->default(false);
            $table->timestamps();

            $table->unique(['meeting_id', 'email']);
            $table->index(['user_id', 'response_status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meeting_attendees');
    }
};
