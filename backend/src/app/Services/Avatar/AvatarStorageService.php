<?php

declare(strict_types=1);

namespace App\Services\Avatar;

use App\Models\User;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AvatarStorageService
{
    private const ALLOWED_CUSTOM_MIMES = [
        'image/jpeg',
        'image/png',
        'image/webp',
    ];

    private const ALLOWED_ONBOARDING_MIMES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/svg+xml',
    ];

    private const CATALOG_EXTENSIONS = ['png', 'svg', 'jpg', 'jpeg', 'webp'];

    public function disk(): Filesystem
    {
        return Storage::disk($this->diskName());
    }

    public function diskName(): string
    {
        return (string) config('filesystems.avatar_disk', 'avatars');
    }

    public function avatarRoot(): string
    {
        return trim((string) config('internal_onboarding.avatar_storage_root', 'avatar'), '/');
    }

    public function defaultPath(): string
    {
        return trim((string) config('internal_onboarding.default_avatar_path', 'avatar/default/ghost.svg'), '/');
    }

    public function defaultUrl(): string
    {
        $path = $this->defaultPath();

        if ($this->disk()->exists($path)) {
            return $this->url($path);
        }

        $legacyBase = rtrim((string) (
            config('internal_onboarding.avatar_public_base_url')
            ?: config('filesystems.disks.public.url')
            ?: ''
        ), '/');

        if ($legacyBase !== '') {
            return $legacyBase . '/' . ltrim($path, '/');
        }

        return $this->url($path);
    }

    public function url(string $path): string
    {
        return $this->disk()->url(ltrim($path, '/'));
    }

    public function exists(string $path): bool
    {
        return $this->disk()->exists(ltrim($path, '/'));
    }

    public function resolveUrl(mixed $avatar, mixed $gender = null): ?string
    {
        if ($avatar === null) {
            return null;
        }

        $avatarValue = trim((string) $avatar);

        if ($avatarValue === '') {
            return null;
        }

        if (str_starts_with($avatarValue, '/') || preg_match('/^https?:\/\//i', $avatarValue) === 1) {
            return $avatarValue;
        }

        $avatarRoot = $this->avatarRoot();
        $disk = $this->disk();

        if (str_starts_with($avatarValue, "{$avatarRoot}/") && $disk->exists($avatarValue)) {
            return $this->url($avatarValue);
        }

        if (str_starts_with($avatarValue, "{$avatarRoot}/custom/")) {
            if ($disk->exists($avatarValue)) {
                return $this->url($avatarValue);
            }

            return null;
        }

        $avatarFilename = pathinfo($avatarValue, PATHINFO_FILENAME);
        $avatarExtension = strtolower((string) pathinfo($avatarValue, PATHINFO_EXTENSION));

        $candidateKeys = array_values(array_unique(array_filter([
            $avatarValue,
            $avatarFilename,
        ], static fn ($value): bool => is_string($value) && trim($value) !== '')));

        $candidateGenders = [];
        if ($gender !== null && trim((string) $gender) !== '') {
            $candidateGenders[] = strtolower((string) $gender);
        }
        $candidateGenders = array_values(array_unique(array_filter(array_merge($candidateGenders, ['male', 'female']))));

        $candidateExtensions = ['png', 'svg'];
        if ($avatarExtension !== '' && in_array($avatarExtension, $candidateExtensions, true)) {
            array_unshift($candidateExtensions, $avatarExtension);
            $candidateExtensions = array_values(array_unique($candidateExtensions));
        }

        foreach ($candidateGenders as $candidateGender) {
            foreach ($candidateKeys as $candidateKey) {
                foreach ($candidateExtensions as $candidateExtension) {
                    $candidatePath = "{$avatarRoot}/{$candidateGender}/{$candidateKey}.{$candidateExtension}";

                    if ($disk->exists($candidatePath)) {
                        return $this->url($candidatePath);
                    }
                }
            }
        }

        return null;
    }

    public function resolveUrlOrDefault(mixed $avatar, mixed $gender = null): string
    {
        return $this->resolveUrl($avatar, $gender) ?? $this->defaultUrl();
    }

    public function isCustomAvatarPath(string $avatarKey): bool
    {
        $basePath = $this->avatarRoot();

        return str_starts_with($avatarKey, "{$basePath}/custom/");
    }

    /**
     * @return array{male: array<string, array{key: string, url: ?string, svg: ?string}>, female: array<string, array{key: string, url: ?string, svg: ?string}>}
     */
    public function catalog(): array
    {
        $catalog = [
            'male' => [],
            'female' => [],
        ];

        $disk = $this->disk();
        $basePath = $this->avatarRoot();

        foreach (['male', 'female'] as $gender) {
            $genderPath = "{$basePath}/{$gender}";

            if (! $disk->exists($genderPath)) {
                continue;
            }

            $files = $disk->files($genderPath);
            sort($files);

            foreach ($files as $file) {
                $filename = basename($file);
                $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));

                if (! in_array($extension, self::CATALOG_EXTENSIONS, true)) {
                    continue;
                }

                $avatarKey = pathinfo($filename, PATHINFO_FILENAME);
                $entry = [
                    'key' => $avatarKey,
                    'svg' => null,
                    'url' => $this->url($file),
                ];

                if ($extension === 'svg') {
                    try {
                        $entry['svg'] = $disk->get($file);
                    } catch (\Throwable) {
                        // Non-fatal: URL fallback will be used.
                    }
                }

                $catalog[$gender][$avatarKey] = $entry;
            }
        }

        $fallbackCatalog = config('internal_onboarding.avatar_catalog', []);
        if (! is_array($fallbackCatalog)) {
            $fallbackCatalog = [];
        }

        foreach ($fallbackCatalog as $gender => $avatars) {
            if (! isset($catalog[$gender]) || ! is_array($avatars)) {
                continue;
            }

            foreach ($avatars as $avatarKey => $svg) {
                if (! isset($catalog[$gender][$avatarKey])) {
                    $catalog[$gender][$avatarKey] = [
                        'key' => $avatarKey,
                        'svg' => $svg,
                        'url' => null,
                    ];

                    continue;
                }

                $catalog[$gender][$avatarKey]['svg'] = $svg;
            }
        }

        return $catalog;
    }

    /**
     * @return list<array{key: string, url: ?string, file: ?string, extension: string, svg: ?string}>
     */
    public function catalogManifest(string $gender): array
    {
        $catalog = $this->catalog();
        $items = $catalog[$gender] ?? [];
        $manifest = [];

        foreach ($items as $avatarKey => $entry) {
            $extension = 'png';
            if (is_string($entry['svg'] ?? null) && ($entry['url'] ?? null) === null) {
                $extension = 'svg';
            }

            $file = null;
            if (($entry['url'] ?? null) !== null) {
                $file = "{$this->avatarRoot()}/{$gender}/{$avatarKey}.{$extension}";
            }

            $manifest[] = [
                'key' => $avatarKey,
                'url' => $entry['url'] ?? null,
                'file' => $file,
                'extension' => $extension,
                'svg' => $entry['svg'] ?? null,
            ];
        }

        return $manifest;
    }

    public function storeCustom(UploadedFile $avatarFile, int $userId, bool $allowSvg = false): string
    {
        $this->assertValidUpload($avatarFile, $allowSvg);

        $basePath = $this->avatarRoot();
        $directory = "{$basePath}/custom";
        $extension = $this->resolveExtension($avatarFile);
        $filename = sprintf('user_%d_%s.%s', $userId, Str::random(16), $extension);

        $path = $avatarFile->storeAs($directory, $filename, [
            'disk' => $this->diskName(),
            'visibility' => 'public',
        ]);

        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'avatar_file' => ['Failed to store avatar upload.'],
            ]);
        }

        return $path;
    }

    public function deleteIfOrphaned(string $path): void
    {
        $normalizedPath = trim($path);

        if ($normalizedPath === '' || ! $this->isCustomAvatarPath($normalizedPath)) {
            return;
        }

        $referenceCount = User::query()
            ->where('avatar', $normalizedPath)
            ->count();

        if ($referenceCount > 0) {
            return;
        }

        if ($this->disk()->exists($normalizedPath)) {
            $this->disk()->delete($normalizedPath);
        }
    }

    public function replaceCustomAvatar(?string $previousAvatar, ?string $nextAvatar): void
    {
        if (! is_string($previousAvatar) || trim($previousAvatar) === '') {
            return;
        }

        if ($previousAvatar === $nextAvatar) {
            return;
        }

        if (! $this->isCustomAvatarPath($previousAvatar)) {
            return;
        }

        $this->deleteIfOrphaned($previousAvatar);
    }

    public function normalizeLegacyUrl(?string $avatar): ?string
    {
        if ($avatar === null || trim($avatar) === '') {
            return null;
        }

        $avatarValue = trim($avatar);
        $legacyBases = array_values(array_filter([
            rtrim((string) config('internal_onboarding.avatar_public_base_url'), '/'),
            rtrim((string) config('filesystems.disks.public.url'), '/'),
        ]));

        foreach ($legacyBases as $base) {
            if ($base === '') {
                continue;
            }

            $prefix = $base . '/';
            if (str_starts_with($avatarValue, $prefix)) {
                return ltrim(substr($avatarValue, strlen($prefix)), '/');
            }
        }

        return $avatarValue;
    }

    private function assertValidUpload(UploadedFile $avatarFile, bool $allowSvg): void
    {
        $mime = $avatarFile->getMimeType() ?: (string) mime_content_type($avatarFile->getRealPath() ?: '');
        $allowed = $allowSvg ? self::ALLOWED_ONBOARDING_MIMES : self::ALLOWED_CUSTOM_MIMES;

        if (! in_array($mime, $allowed, true)) {
            throw ValidationException::withMessages([
                'avatar_file' => ['The avatar file type is not allowed.'],
            ]);
        }

        if ($avatarFile->getSize() > 5 * 1024 * 1024) {
            throw ValidationException::withMessages([
                'avatar_file' => ['The avatar file may not be greater than 5120 kilobytes.'],
            ]);
        }
    }

    private function resolveExtension(UploadedFile $avatarFile): string
    {
        $mime = $avatarFile->getMimeType() ?: '';

        return match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/svg+xml' => 'svg',
            default => strtolower($avatarFile->extension() ?: 'png'),
        };
    }
}
