<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lead_contacts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('location')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['lead_id', 'sort_order']);
            $table->index('email');
            $table->index('phone');
        });

        DB::table('leads')
            ->select(['id', 'name', 'email', 'phone', 'location'])
            ->orderBy('id')
            ->chunkById(500, function ($leads): void {
                $now = now();
                $rows = $leads->map(static fn (object $lead): array => [
                    'lead_id' => (int) $lead->id,
                    'name' => (string) $lead->name,
                    'email' => $lead->email,
                    'phone' => $lead->phone,
                    'location' => $lead->location,
                    'sort_order' => 0,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all();

                if ($rows !== []) {
                    DB::table('lead_contacts')->insert($rows);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_contacts');
    }
};
