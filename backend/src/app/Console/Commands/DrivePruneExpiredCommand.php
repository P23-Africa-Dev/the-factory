<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\DriveFileSource;
use App\Models\DriveFile;
use App\Services\Drive\CompanyDriveStorageService;
use Illuminate\Console\Command;
use Throwable;

/**
 * Removes Drive files ELY generated (e.g. weekly report PDFs) once they pass
 * their expires_at. Files people upload are never touched.
 */
class DrivePruneExpiredCommand extends Command
{
    protected $signature = 'drive:prune-expired
        {--dry-run : List what would be removed without deleting anything}';

    protected $description = 'Delete ELY-generated Drive files that have passed their retention period.';

    public function handle(CompanyDriveStorageService $storage): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $removed = 0;
        $failed = 0;

        DriveFile::query()
            ->where('source', DriveFileSource::ELY_REPORT->value)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->orderBy('id')
            ->chunkById(100, function ($files) use ($storage, $dryRun, &$removed, &$failed): void {
                foreach ($files as $file) {
                    if ($dryRun) {
                        $this->line("would remove #{$file->id} {$file->original_name} (company {$file->company_id}, expired {$file->expires_at?->toDateString()})");
                        $removed++;

                        continue;
                    }

                    try {
                        // Storage first: if it fails the row stays and the next run retries.
                        $storage->delete((string) $file->disk, (string) $file->file_path);
                        $file->delete();
                        $removed++;
                    } catch (Throwable $e) {
                        $failed++;
                        $this->warn("could not remove #{$file->id}: {$e->getMessage()}");
                    }
                }
            });

        $this->info(($dryRun ? 'Would remove' : 'Removed')." {$removed} expired ELY file(s)".($failed > 0 ? ", {$failed} failed (will retry next run)" : '').'.');

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
