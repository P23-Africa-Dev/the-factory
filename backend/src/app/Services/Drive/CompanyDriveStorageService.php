<?php

declare(strict_types=1);

namespace App\Services\Drive;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use League\Flysystem\FilesystemException;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

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

        // With throw=false a failed write only returns false; never create a
        // Drive row that points at nothing.
        $stored = $this->guard(fn () => $this->disk()->put($path, $content, ['visibility' => 'private']));
        if ($stored !== true) {
            throw new RuntimeException("Unable to save {$originalName} to Drive storage.");
        }

        return [
            'disk' => $this->diskName(),
            'file_path' => $path,
            'original_name' => $originalName,
            'mime_type' => $mimeType,
            'size_bytes' => strlen($content),
        ];
    }

    /**
     * Deletes the stored object. A missing object counts as deleted. Throws a
     * 503 when storage can't be reached, so the caller keeps the Drive row.
     */
    public function delete(string $disk, string $path): void
    {
        $filesystem = $this->diskFor($disk);
        if ($filesystem === null) {
            return;
        }

        // Deleting a missing object succeeds on S3/Spaces; false means the
        // storage refused the request.
        if ($this->guard(fn () => $filesystem->delete($path)) === false) {
            throw $this->unavailable(new RuntimeException("Delete was refused for {$path}."));
        }
    }

    /**
     * @return resource|null null when the file is not in storage (404)
     */
    public function readStream(string $disk, string $path)
    {
        $filesystem = $this->diskFor($disk);
        if ($filesystem === null || ! $this->guard(fn () => $filesystem->fileExists($path))) {
            return null;
        }

        $stream = $this->guard(fn () => $filesystem->readStream($path));
        if (! is_resource($stream)) {
            throw $this->unavailable(new RuntimeException("Read was refused for {$path}."));
        }

        return $stream;
    }

    /** The disk a Drive row was stored on, or null if that disk no longer exists. */
    private function diskFor(string $disk): ?Filesystem
    {
        if ($disk === '' || ! is_array(config("filesystems.disks.{$disk}"))) {
            return null;
        }

        return Storage::disk($disk);
    }

    /**
     * Runs a storage call. Errors from the storage service (e.g. a rejected
     * access key) become a 503 with a clear message instead of a raw 500.
     *
     * @template T
     *
     * @param  callable(): T  $call
     * @return T
     */
    private function guard(callable $call): mixed
    {
        try {
            return $call();
        } catch (FilesystemException $e) {
            throw $this->unavailable($e);
        } catch (\Aws\Exception\AwsException $e) {
            throw $this->unavailable($e);
        }
    }

    private function unavailable(Throwable $cause): HttpException
    {
        report($cause);

        return new HttpException(503, 'Drive storage is unavailable right now. Please try again later.', $cause);
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
