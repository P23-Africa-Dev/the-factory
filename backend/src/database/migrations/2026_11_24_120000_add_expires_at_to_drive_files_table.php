<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Files ELY generates (weekly report PDFs) are kept for a limited time and
 * removed by `drive:prune-expired`. Existing generated files get the same
 * limit, counted from when they were created. Uploads keep expires_at null.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drive_files', function (Blueprint $table): void {
            $table->timestamp('expires_at')->nullable()->index()->after('metadata');
        });

        $days = (int) config('drive.generated_retention_days', 60);
        DB::table('drive_files')
            ->where('source', 'ely_report')
            ->whereNull('expires_at')
            ->orderBy('id')
            ->each(function (object $row) use ($days): void {
                $created = $row->created_at !== null ? \Illuminate\Support\Carbon::parse($row->created_at) : now();
                DB::table('drive_files')->where('id', $row->id)->update(['expires_at' => $created->addDays($days)]);
            });
    }

    public function down(): void
    {
        Schema::table('drive_files', function (Blueprint $table): void {
            $table->dropIndex(['expires_at']);
            $table->dropColumn('expires_at');
        });
    }
};
