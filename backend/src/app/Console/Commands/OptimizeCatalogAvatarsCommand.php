<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Avatar\AvatarStorageService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
use Throwable;

/**
 * Catalog avatars were exported as ~1MB+ SVGs with embedded 1024px PNGs.
 * Re-encode each to a tiny SVG wrapping a 192px WebP so onboarding loads quickly.
 */
class OptimizeCatalogAvatarsCommand extends Command
{
    protected $signature = 'avatars:optimize-catalog
                            {--dry-run : Report savings without writing}
                            {--gender= : Limit to male or female}
                            {--min-bytes=80000 : Only rewrite files at least this large}
                            {--size=192 : Output pixel size}
                            {--quality=72 : WebP quality}
                            {--limit=0 : Stop after N files (0 = all)}';

    protected $description = 'Compress oversized catalog avatar SVGs (embedded raster) in avatar storage';

    public function handle(AvatarStorageService $avatarStorage): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $minBytes = max(1, (int) $this->option('min-bytes'));
        $size = max(64, min(512, (int) $this->option('size')));
        $quality = max(40, min(90, (int) $this->option('quality')));
        $limit = max(0, (int) $this->option('limit'));
        $genderOpt = $this->option('gender');

        $genders = ['male', 'female'];
        if (is_string($genderOpt) && $genderOpt !== '') {
            $normalized = strtolower(trim($genderOpt));
            if (! in_array($normalized, $genders, true)) {
                $this->error('Gender must be male or female.');

                return self::FAILURE;
            }
            $genders = [$normalized];
        }

        $script = $this->resolveOptimizerScript();
        if ($script === null) {
            $this->error('Could not find scripts/optimize-avatar-svg.mjs (run from the monorepo root checkout).');

            return self::FAILURE;
        }

        if ($dryRun) {
            $this->warn('Dry run — no files will be overwritten.');
        }

        $disk = $avatarStorage->disk();
        $root = $avatarStorage->avatarRoot();
        $summary = [
            'scanned' => 0,
            'optimized' => 0,
            'skipped' => 0,
            'errors' => 0,
            'bytes_before' => 0,
            'bytes_after' => 0,
        ];

        foreach ($genders as $gender) {
            $dir = "{$root}/{$gender}";
            $this->info("Scanning {$dir} ...");

            try {
                $files = $disk->files($dir);
            } catch (Throwable $e) {
                $this->error("Failed to list {$dir}: " . $e->getMessage());
                $summary['errors']++;

                continue;
            }

            sort($files);

            foreach ($files as $file) {
                if (strtolower((string) pathinfo($file, PATHINFO_EXTENSION)) !== 'svg') {
                    continue;
                }

                if ($limit > 0 && ($summary['optimized'] + $summary['skipped'] + $summary['errors']) >= $limit) {
                    break 2;
                }

                $summary['scanned']++;

                try {
                    $original = $disk->get($file);
                } catch (Throwable $e) {
                    $this->error("Read failed {$file}: " . $e->getMessage());
                    $summary['errors']++;

                    continue;
                }

                $before = strlen($original);
                if ($before < $minBytes) {
                    $summary['skipped']++;
                    $this->line("  skip {$file} ({$before} bytes)");

                    continue;
                }

                $result = $this->optimizeWithNode($script, $original, $size, $quality);
                if ($result === null) {
                    $summary['errors']++;
                    $this->error("  optimize failed {$file}");

                    continue;
                }

                if (($result['skipped'] ?? false) === true) {
                    $summary['skipped']++;
                    $this->line('  skip ' . $file . ' (' . $result['reason'] . ')');

                    continue;
                }

                $optimized = (string) $result['svg'];
                $after = strlen($optimized);
                if ($after <= 0 || $after >= $before) {
                    $summary['skipped']++;
                    $this->line("  skip {$file} (no size win: {$before} → {$after})");

                    continue;
                }

                $summary['bytes_before'] += $before;
                $summary['bytes_after'] += $after;
                $pct = $before > 0 ? round((1 - ($after / $before)) * 100, 1) : 0;
                $this->info("  {$file}: " . number_format($before) . ' → ' . number_format($after) . " bytes (−{$pct}%)");

                if (! $dryRun) {
                    try {
                        $disk->put($file, $optimized, 'public');
                        $summary['optimized']++;
                    } catch (Throwable $e) {
                        $this->error("  write failed {$file}: " . $e->getMessage());
                        $summary['errors']++;
                    }
                } else {
                    $summary['optimized']++;
                }
            }
        }

        if (! $dryRun && $summary['optimized'] > 0) {
            $this->clearAvatarManifestCache();
            $this->info('Cleared avatar manifest cache.');
        }

        $this->newLine();
        $this->table(['Metric', 'Value'], [
            ['Scanned', (string) $summary['scanned']],
            ['Optimized', (string) $summary['optimized']],
            ['Skipped', (string) $summary['skipped']],
            ['Errors', (string) $summary['errors']],
            ['Bytes before', number_format($summary['bytes_before'])],
            ['Bytes after', number_format($summary['bytes_after'])],
            [
                'Saved',
                number_format(max(0, $summary['bytes_before'] - $summary['bytes_after'])) .
                    ($summary['bytes_before'] > 0
                        ? ' (' . round((1 - ($summary['bytes_after'] / $summary['bytes_before'])) * 100, 1) . '%)'
                        : ''),
            ],
        ]);

        return $summary['errors'] > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @return array{svg?: string, skipped?: bool, reason?: string}|null
     */
    private function optimizeWithNode(string $script, string $svg, int $size, int $quality): ?array
    {
        $tmpIn = tempnam(sys_get_temp_dir(), 'avatar_in_');
        $tmpOut = tempnam(sys_get_temp_dir(), 'avatar_out_');
        if ($tmpIn === false || $tmpOut === false) {
            return null;
        }

        try {
            file_put_contents($tmpIn, $svg);

            // sharp lives in the monorepo root node_modules; run from there.
            $repoRoot = dirname($script, 2);
            $process = Process::path($repoRoot)->timeout(120)->env([
                'AVATAR_OPT_STATS' => '1',
            ])->run([
                'node',
                $script,
                '--file',
                $tmpIn,
                '--size',
                (string) $size,
                '--quality',
                (string) $quality,
            ]);

            if (! $process->successful()) {
                $this->warn(trim($process->errorOutput()) ?: 'node optimizer exited non-zero');

                return null;
            }

            $optimized = $process->output();
            $statsLine = trim($process->errorOutput());
            $stats = $statsLine !== '' ? json_decode($statsLine, true) : null;

            if (is_array($stats) && ($stats['skipped'] ?? false) === true) {
                return [
                    'skipped' => true,
                    'reason' => (string) ($stats['reason'] ?? 'skipped'),
                ];
            }

            if ($optimized === '') {
                return null;
            }

            // Persist via temp for binary-safe length checks when needed.
            file_put_contents($tmpOut, $optimized);

            return [
                'svg' => $optimized,
                'skipped' => false,
            ];
        } catch (Throwable $e) {
            $this->warn($e->getMessage());

            return null;
        } finally {
            @unlink($tmpIn);
            @unlink($tmpOut);
        }
    }

    private function resolveOptimizerScript(): ?string
    {
        $candidates = [
            base_path('../../scripts/optimize-avatar-svg.mjs'),
            base_path('../scripts/optimize-avatar-svg.mjs'),
            base_path('scripts/optimize-avatar-svg.mjs'),
            dirname(base_path()) . '/scripts/optimize-avatar-svg.mjs',
            dirname(base_path(), 2) . '/scripts/optimize-avatar-svg.mjs',
        ];

        foreach ($candidates as $candidate) {
            $real = realpath($candidate);
            if ($real !== false && is_file($real)) {
                return $real;
            }
        }

        return null;
    }

    private function clearAvatarManifestCache(): void
    {
        foreach (['male', 'female'] as $gender) {
            Cache::forget("internal_onboarding.avatar_manifest.{$gender}");
            Cache::forget("internal_onboarding.avatar_manifest.v2.{$gender}");
            Cache::forget("internal_onboarding.avatar_manifest.v3.{$gender}");
            Cache::forget("internal_onboarding.avatar_manifest.v4.{$gender}");
        }
    }
}
