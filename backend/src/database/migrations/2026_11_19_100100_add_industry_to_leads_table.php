<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * First-class lead industry (Lead classification). Backfills from values that
 * were previously stored as a custom field (`custom_fields.industry`) or by the
 * AI assistant (`meta.industry`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->string('industry', 120)->nullable()->after('position');
            $table->index(['company_id', 'industry']);
        });

        DB::table('leads')
            ->whereNull('industry')
            ->where(function ($q): void {
                $q->whereNotNull('custom_fields')->orWhereNotNull('meta');
            })
            ->orderBy('id')
            ->select(['id', 'custom_fields', 'meta'])
            ->chunkById(500, function ($rows): void {
                foreach ($rows as $row) {
                    $custom = is_string($row->custom_fields) ? json_decode($row->custom_fields, true) : null;
                    $meta = is_string($row->meta) ? json_decode($row->meta, true) : null;

                    $value = null;
                    foreach ([$custom['industry'] ?? null, $meta['industry'] ?? null] as $candidate) {
                        if (is_string($candidate) && trim($candidate) !== '') {
                            $value = mb_substr(trim($candidate), 0, 120);
                            break;
                        }
                    }

                    if ($value !== null) {
                        DB::table('leads')->where('id', $row->id)->update(['industry' => $value]);
                    }
                }
            });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->dropIndex(['company_id', 'industry']);
            $table->dropColumn('industry');
        });
    }
};
