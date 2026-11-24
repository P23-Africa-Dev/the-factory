<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\DriveFile;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Sets every stored Drive object to private, so files can only be reached
 * through the app (which checks who may see them), never by a direct URL.
 */
class DriveMakePrivateCommand extends Command
{
    protected $signature = 'drive:make-private
        {--dry-run : Count the files without changing anything}';

    protected $description = 'Set every Drive file in storage to private visibility.';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $done = 0;
        $missing = 0;
        $failed = 0;

        DriveFile::query()->orderBy('id')->chunkById(200, function ($files) use ($dryRun, &$done, &$missing, &$failed): void {
            foreach ($files as $file) {
                $disk = (string) $file->disk;
                if (! is_array(config("filesystems.disks.{$disk}"))) {
                    $missing++;

                    continue;
                }

                try {
                    $storage = Storage::disk($disk);
                    if (! $storage->fileExists((string) $file->file_path)) {
                        $missing++;

                        continue;
                    }
                    if (! $dryRun && $storage->setVisibility((string) $file->file_path, 'private') === false) {
                        throw new \RuntimeException('storage refused the change');
                    }
                    $done++;
                } catch (Throwable $e) {
                    $failed++;
                    $this->warn("#{$file->id} {$file->original_name}: {$e->getMessage()}");
                }
            }
        });

        $this->info(($dryRun ? 'Would make private: ' : 'Made private: ')."{$done}; not in storage: {$missing}; failed: {$failed}.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
