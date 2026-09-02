<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Avatar\AvatarStorageService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

class MigrateAvatarsToSpacesCommand extends Command
{
    protected $signature = 'avatars:migrate-to-spaces
                            {--dry-run : Report actions without writing to Spaces or the database}
                            {--resume : Continue from the last processed user id}
                            {--user-id= : Migrate a single user by id}
                            {--only-custom : Only migrate custom avatar uploads, skip catalog sync}
                            {--catalog-only : Only sync catalog/default assets to Spaces, skip user custom avatars}';

    protected $description = 'Migrate avatar assets from local public storage to DigitalOcean Spaces';

    private const PROGRESS_FILE = 'avatar-migration-progress.json';

    public function handle(AvatarStorageService $avatarStorage): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $resume = (bool) $this->option('resume');
        $onlyCustom = (bool) $this->option('only-custom');
        $catalogOnly = (bool) $this->option('catalog-only');
        $singleUserId = $this->option('user-id') !== null ? (int) $this->option('user-id') : null;

        $summary = [
            'catalog_uploaded' => 0,
            'catalog_skipped' => 0,
            'default_uploaded' => 0,
            'default_skipped' => 0,
            'custom_uploaded' => 0,
            'custom_skipped' => 0,
            'custom_missing' => 0,
            'users_normalized' => 0,
            'errors' => 0,
        ];

        if ($dryRun) {
            $this->warn('Dry run mode — no writes will be performed.');
        }

        if (! $onlyCustom) {
            $this->info('Syncing catalog and default avatar assets...');
            $this->syncCatalogAndDefault($avatarStorage, $dryRun, $summary);
            $this->clearAvatarManifestCache();
        }

        if ($catalogOnly) {
            $this->info('Catalog-only mode complete.');

            return $summary['errors'] > 0 ? self::FAILURE : self::SUCCESS;
        }

        $this->info('Migrating user custom avatars...');

        $query = User::query()
            ->whereNotNull('avatar')
            ->orderBy('id');

        if ($singleUserId !== null) {
            $query->whereKey($singleUserId);
        } elseif ($resume) {
            $lastId = $this->readProgress();
            if ($lastId > 0) {
                $query->where('id', '>', $lastId);
                $this->line("Resuming after user id {$lastId}");
            }
        }

        $users = $query->get(['id', 'avatar', 'gender']);
        $bar = $this->output->createProgressBar($users->count());
        $bar->start();

        $localDisk = Storage::disk('public');
        $remoteDisk = $avatarStorage->disk();
        $avatarRoot = $avatarStorage->avatarRoot();

        foreach ($users as $user) {
            try {
                $avatar = trim((string) $user->avatar);

                if ($avatar === '') {
                    $bar->advance();

                    continue;
                }

                $normalized = $avatarStorage->normalizeLegacyUrl($avatar) ?? $avatar;

                if ($normalized !== $avatar && ! $dryRun) {
                    $user->forceFill(['avatar' => $normalized])->save();
                    $summary['users_normalized']++;
                } elseif ($normalized !== $avatar) {
                    $summary['users_normalized']++;
                }

                if ($avatarStorage->isCustomAvatarPath($normalized)) {
                    if ($remoteDisk->exists($normalized)) {
                        $summary['custom_skipped']++;
                    } elseif ($localDisk->exists($normalized)) {
                        if (! $dryRun) {
                            $contents = $localDisk->get($normalized);
                            $remoteDisk->put($normalized, $contents, ['visibility' => 'public']);
                        }
                        $summary['custom_uploaded']++;
                    } else {
                        $this->newLine();
                        $this->warn("Missing local custom avatar for user {$user->id}: {$normalized}");
                        $summary['custom_missing']++;
                    }
                }

                if (! $dryRun && $singleUserId === null) {
                    $this->writeProgress((int) $user->id);
                }
            } catch (\Throwable $exception) {
                $summary['errors']++;
                $this->newLine();
                $this->error("User {$user->id}: {$exception->getMessage()}");
            }

            $bar->advance();
        }

        $bar->finish();
        $this->newLine(2);
        $this->table(
            ['Metric', 'Count'],
            collect($summary)->map(fn (int $count, string $key) => [str_replace('_', ' ', $key), $count])->values()->all(),
        );

        if ($summary['errors'] > 0) {
            return self::FAILURE;
        }

        $this->info('Avatar migration completed.');

        return self::SUCCESS;
    }

    /**
     * @param array<string, int> $summary
     */
    private function syncCatalogAndDefault(AvatarStorageService $avatarStorage, bool $dryRun, array &$summary): void
    {
        $localDisk = Storage::disk('public');
        $remoteDisk = $avatarStorage->disk();
        $avatarRoot = $avatarStorage->avatarRoot();

        foreach (['male', 'female'] as $gender) {
            $genderPath = "{$avatarRoot}/{$gender}";

            if (! $localDisk->exists($genderPath)) {
                $this->warn("Local catalog path missing: {$genderPath}");

                continue;
            }

            foreach ($localDisk->files($genderPath) as $file) {
                if ($remoteDisk->exists($file)) {
                    $summary['catalog_skipped']++;

                    continue;
                }

                if ($dryRun) {
                    $summary['catalog_uploaded']++;

                    continue;
                }

                $remoteDisk->put($file, $localDisk->get($file), ['visibility' => 'public']);
                $summary['catalog_uploaded']++;
            }
        }

        $defaultPath = $avatarStorage->defaultPath();

        if ($remoteDisk->exists($defaultPath)) {
            $summary['default_skipped']++;

            return;
        }

        $sourcePath = resource_path('avatar/default/ghost.svg');

        if (! File::exists($sourcePath)) {
            $this->warn("Default avatar source missing at {$sourcePath}");

            return;
        }

        if ($dryRun) {
            $summary['default_uploaded']++;

            return;
        }

        $remoteDisk->put($defaultPath, File::get($sourcePath), ['visibility' => 'public']);
        $summary['default_uploaded']++;
    }

    private function clearAvatarManifestCache(): void
    {
        foreach (['male', 'female'] as $gender) {
            Cache::forget(sprintf('internal_onboarding.avatar_manifest.%s', $gender));
        }
    }

    private function progressPath(): string
    {
        return storage_path('app/' . self::PROGRESS_FILE);
    }

    private function readProgress(): int
    {
        $path = $this->progressPath();

        if (! File::exists($path)) {
            return 0;
        }

        $payload = json_decode((string) File::get($path), true);

        return is_array($payload) ? (int) ($payload['last_user_id'] ?? 0) : 0;
    }

    private function writeProgress(int $userId): void
    {
        File::put($this->progressPath(), json_encode([
            'last_user_id' => $userId,
            'updated_at' => now()->toIso8601String(),
        ], JSON_PRETTY_PRINT));
    }
}
