<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Avatar\AvatarStorageService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class DiagnoseAvatarsCommand extends Command
{
    protected $signature = 'avatars:diagnose';

    protected $description = 'Validate avatar storage configuration and Spaces connectivity';

    public function handle(AvatarStorageService $avatarStorage): int
    {
        $diskName = $avatarStorage->diskName();
        $diskConfig = config("filesystems.disks.{$diskName}", []);

        $this->info('Avatar storage diagnostics');
        $this->table(['Setting', 'Value'], [
            ['avatar_disk', $diskName],
            ['driver', (string) ($diskConfig['driver'] ?? 'missing')],
            ['bucket', (string) ($diskConfig['bucket'] ?? 'missing')],
            ['region', (string) ($diskConfig['region'] ?? 'missing')],
            ['endpoint', (string) ($diskConfig['endpoint'] ?? 'missing')],
            ['public_base_url', $avatarStorage->publicBaseUrl() ?: '(not set)'],
            ['avatar_root', $avatarStorage->avatarRoot()],
            ['default_path', $avatarStorage->defaultPath()],
            ['default_url', $avatarStorage->defaultUrl()],
        ]);

        $checks = [
            $avatarStorage->defaultPath() => 'default ghost',
            "{$avatarStorage->avatarRoot()}/male/male_01.png" => 'catalog male_01 png',
            "{$avatarStorage->avatarRoot()}/male/male_01.svg" => 'catalog male_01 svg',
        ];

        $rows = [];
        foreach ($checks as $path => $label) {
            $exists = $avatarStorage->exists($path);
            $rows[] = [$label, $path, $exists ? 'yes' : 'no', $avatarStorage->pathToPublicUrl($path)];
        }

        $this->newLine();
        $this->info('Object checks (exists on disk + resolved URL)');
        $this->table(['Asset', 'Path', 'Exists', 'Public URL'], $rows);

        $key = (string) config("filesystems.disks.{$diskName}.key");
        $secret = (string) config("filesystems.disks.{$diskName}.secret");

        if ($key === '' || $secret === '') {
            $this->error('AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is missing. Uploads and exists() checks will fail.');

            return self::FAILURE;
        }

        try {
            $avatarStorage->disk()->files($avatarStorage->avatarRoot());
            $this->info('Spaces list operation succeeded.');
        } catch (\Throwable $exception) {
            $this->error('Spaces list operation failed: ' . $exception->getMessage());

            return self::FAILURE;
        }

        $this->info('Diagnostics complete.');

        return self::SUCCESS;
    }
}
