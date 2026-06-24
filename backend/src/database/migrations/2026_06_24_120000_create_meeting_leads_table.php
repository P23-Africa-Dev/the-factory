<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meeting_leads', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('meeting_id')->constrained('meetings')->cascadeOnDelete();
            $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['meeting_id', 'lead_id']);
            $table->index(['lead_id', 'meeting_id']);
        });

        Schema::table('meeting_attendees', function (Blueprint $table): void {
            $table->foreignId('lead_id')->nullable()->after('user_id')->constrained('leads')->nullOnDelete();
            $table->index(['lead_id', 'meeting_id']);
        });
    }

    public function down(): void
    {
        Schema::table('meeting_attendees', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('lead_id');
        });

        Schema::dropIfExists('meeting_leads');
    }
};
