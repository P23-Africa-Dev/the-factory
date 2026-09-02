<?php

declare(strict_types=1);

namespace App\Services\Drive;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CompanyDriveStorageService
{
    public function disk(): Filesystem
    {
        return Storage::disk($this->diskName());
    }

    public function diskName(): string
    {
        return (string) config('filesystems.drive_disk', 'drive');
    }

    public function root(): string
    {
        return trim((string) config('drive.root', 'drive'), '/');
    }

    public function companyPrefix(int $companyId): string
    {
        return $this->root() . '/company-' . $companyId;
    }

    public function storeUploadedFile(int $companyId, int $folderId, UploadedFile $file): array
    {
        $this->assertAllowedUpload($file);

        $extension = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: 'bin');
        $storedName = Str::uuid()->toString() . '.' . $extension;
        $directory = $this->companyPrefix($companyId) . '/folders/' . $folderId;
        $path = $file->storeAs($directory, $storedName, [
            'disk' => $this->diskName(),
            'visibility' => 'private',
        ]);

        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'file' => ['Unable to store the uploaded file.'],
            ]);
        }

        return [
            'disk' => $this->diskName(),
            'file_path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType() ?: 'application/octet-stream',
            'size_bytes' => (int) $file->getSize(),
        ];
    }

    /**
     * @return array{disk: string, file_path: string, original_name: string, mime_type: string, size_bytes: int}
     */
    public function storeRawContent(
        int $companyId,
        int $folderId,
        string $content,
        string $originalName,
        string $mimeType,
    ): array {
        $extension = pathinfo($originalName, PATHINFO_EXTENSION) ?: 'bin';
        $storedName = Str::uuid()->toString() . '.' . strtolower($extension);
        $directory = $this->companyPrefix($companyId) . '/folders/' . $folderId;
        $path = $directory . '/' . $storedName;

        $this->disk()->put($path, $content, ['visibility' => 'private']);

        return [
            'disk' => $this->diskName(),
            'file_path' => $path,
            'original_name' => $originalName,
            'mime_type' => $mimeType,
            'size_bytes' => strlen($content),
        ];
    }

    public function delete(string $disk, string $path): void
    {
        if ($disk === $this->diskName() && $this->disk()->exists($path)) {
            $this->disk()->delete($path);
        }
    }

    public function readStream(string $disk, string $path)
    {
        if ($disk !== $this->diskName() || ! $this->disk()->exists($path)) {
            return null;
        }

        return $this->disk()->readStream($path);
    }

    private function assertAllowedUpload(UploadedFile $file): void
    {
        $maxBytes = (int) config('drive.max_upload_bytes', 50 * 1024 * 1024);
        $size = (int) $file->getSize();

        if ($size > $maxBytes) {
            throw ValidationException::withMessages([
                'file' => ['File exceeds the maximum upload size of ' . (int) ($maxBytes / 1024 / 1024) . ' MB.'],
            ]);
        }

        $mime = (string) $file->getMimeType();
        $allowed = config('drive.allowed_mimes', []);

        if (is_array($allowed) && $allowed !== [] && ! in_array($mime, $allowed, true)) {
            throw ValidationException::withMessages([
                'file' => ['This file type is not allowed in company drive.'],
            ]);
        }
    }
}
