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
        Schema::table('lead_contacts', function (Blueprint $table): void {
            $table->string('position', 120)->nullable()->after('location');
            $table->json('profile_urls')->nullable()->after('position');
        });

        DB::table('leads')
            ->select(['id', 'position', 'profile_urls'])
            ->where(function ($query): void {
                $query->whereNotNull('position')->orWhereNotNull('profile_urls');
            })
            ->orderBy('id')
            ->chunkById(500, function ($leads): void {
                foreach ($leads as $lead) {
                    DB::table('lead_contacts')
                        ->where('lead_id', (int) $lead->id)
                        ->where('sort_order', 0)
                        ->update([
                            'position' => $lead->position,
                            'profile_urls' => $lead->profile_urls,
                        ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('lead_contacts', function (Blueprint $table): void {
            $table->dropColumn(['position', 'profile_urls']);
        });
    }
};
