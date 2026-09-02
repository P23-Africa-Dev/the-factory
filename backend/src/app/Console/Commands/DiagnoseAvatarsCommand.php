<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Avatar\AvatarStorageService;
use Illuminate\Console\Command;

class DiagnoseAvatarsCommand extends Command
{
    protected $signature = 'avatars:diagnose';

    protected $description = 'Validate avatar storage configuration and Spaces connectivity';

    public function handle(AvatarStorageService $avatarStorage): int
    {
        $diskName = $avatarStorage->diskName();
        $diskConfig = config("filesystems.disks.{$diskName}", []);
        $key = (string) config("filesystems.disks.{$diskName}.key");
        $secret = (string) config("filesystems.disks.{$diskName}.secret");

        $this->info('Avatar storage diagnostics');
        $this->table(['Setting', 'Value'], [
            ['avatar_disk', $diskName],
            ['driver', (string) ($diskConfig['driver'] ?? 'missing')],
            ['bucket', (string) ($diskConfig['bucket'] ?? 'missing')],
            ['region', (string) ($diskConfig['region'] ?? 'missing')],
            ['endpoint', (string) ($diskConfig['endpoint'] ?? 'missing')],
            ['access_key_id', $this->maskSecret($key)],
            ['secret_configured', $secret !== '' ? 'yes' : 'no'],
            ['public_base_url (used for URLs)', $avatarStorage->publicBaseUrl() ?: '(not set)'],
            ['avatar_public_base_url (env)', (string) config('filesystems.avatar_public_base_url') ?: '(not set)'],
            ['aws_url (env, legacy)', (string) config('filesystems.disks.avatars.url') ?: '(not set)'],
            ['avatar_root', $avatarStorage->avatarRoot()],
            ['default_path', $avatarStorage->defaultPath()],
            ['default_url', $avatarStorage->defaultUrl()],
        ]);

        if ($key === '' || $secret === '') {
            $this->error('AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is missing in the pod environment.');
            $this->line('Add both to factory23-secret and restart backend pods.');

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Testing Spaces API credentials...');

        try {
            $avatarStorage->disk()->files($avatarStorage->avatarRoot());
            $this->info('Spaces authentication succeeded.');
        } catch (\Throwable $exception) {
            $message = $exception->getMessage();

            $this->error('Spaces authentication failed.');
            $this->line($message);
            $this->newLine();

            if (str_contains($message, 'InvalidAccessKeyId')) {
                $this->warn('InvalidAccessKeyId means the Spaces access key in factory23-secret is wrong, revoked, or for a different bucket/region.');
                $this->line('Fix: DigitalOcean Control Panel → API → Spaces access keys → create a new key');
                $this->line('     Grant read/write on bucket factory23-storage, then update factory23-secret:');
                $this->line('       AWS_ACCESS_KEY_ID');
                $this->line('       AWS_SECRET_ACCESS_KEY');
                $this->line('     Then: kubectl rollout restart deployment/backend -n factory23');
            }

            $this->newLine();
            $this->warn('Object "Exists" checks were skipped — they return false when credentials fail, even if files are on Spaces.');
            $this->line('Your ghost.svg may already be reachable in the browser while the API cannot verify it yet.');

            return self::FAILURE;
        }

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
        $this->info('Object checks (after successful auth)');
        $this->table(['Asset', 'Path', 'Exists', 'Public URL'], $rows);

        if (! $avatarStorage->exists($avatarStorage->defaultPath())) {
            $this->warn('Default ghost is missing on Spaces. Upload to: ' . $avatarStorage->defaultPath());
            $this->line('Direct URL should be: ' . $avatarStorage->defaultUrl());
        }

        $this->info('Diagnostics complete.');

        return self::SUCCESS;
    }

    private function maskSecret(string $value): string
    {
        if ($value === '') {
            return '(not set)';
        }

        if (strlen($value) <= 8) {
            return '****';
        }

        return substr($value, 0, 6) . '...' . substr($value, -4);
    }
}
