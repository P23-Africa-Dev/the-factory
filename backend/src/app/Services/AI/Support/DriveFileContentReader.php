<?php

declare(strict_types=1);

namespace App\Services\AI\Support;

use App\Models\User;
use App\Services\AI\Innovation\CopilotFileTextExtractor;
use App\Services\Drive\CompanyDriveService;
use Throwable;

/**
 * Reads and extracts text from a Company Drive file for ELY, enforcing the
 * exact same role-based access checks used by the Drive download endpoint.
 *
 * Access control is delegated to CompanyDriveService::downloadFile(), which
 * resolves the tenant context and throws when the caller lacks a grant, so a
 * user can never obtain the contents of a file they are not permitted to see.
 */
final class DriveFileContentReader
{
    public function __construct(
        private readonly CompanyDriveService $companyDriveService,
        private readonly CopilotFileTextExtractor $textExtractor,
    ) {}

    public function readAccessibleText(User $user, int $fileId, ?int $companyId = null): ?string
    {
        $tempPath = null;

        try {
            $download = $this->companyDriveService->downloadFile($user, $fileId, $companyId);
        } catch (Throwable) {
            return null;
        }

        $stream = $download['stream'] ?? null;
        if (! is_resource($stream)) {
            return null;
        }

        try {
            $extension = strtolower(pathinfo((string) ($download['filename'] ?? ''), PATHINFO_EXTENSION));
            if ($extension === '') {
                return null;
            }

            $tempPath = tempnam(sys_get_temp_dir(), 'ely-drive-');
            if (! is_string($tempPath) || $tempPath === '') {
                return null;
            }

            $handle = @fopen($tempPath, 'wb');
            if ($handle === false) {
                return null;
            }

            stream_copy_to_stream($stream, $handle);
            fclose($handle);

            return $this->textExtractor->extractFromPath($tempPath, $extension);
        } catch (Throwable) {
            return null;
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
            if (is_string($tempPath) && $tempPath !== '' && is_file($tempPath)) {
                @unlink($tempPath);
            }
        }
    }
}
