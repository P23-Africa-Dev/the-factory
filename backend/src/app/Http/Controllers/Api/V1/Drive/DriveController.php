<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Drive;

use App\Http\Controllers\Controller;
use App\Services\Drive\CompanyDriveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DriveController extends Controller
{
    public function __construct(private readonly CompanyDriveService $driveService) {}

    public function usage(Request $request): JsonResponse
    {
        $data = $this->driveService->usage(
            $request->user(),
            $request->integer('company_id') ?: null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Drive usage fetched successfully.',
            'data' => $data,
            'errors' => null,
        ]);
    }

    public function folders(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'parent_id' => ['nullable', 'integer'],
        ]);

        $items = $this->driveService->listFolders(
            $request->user(),
            isset($validated['parent_id']) ? (int) $validated['parent_id'] : null,
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Drive folders fetched successfully.',
            'data' => ['items' => $items],
            'errors' => null,
        ]);
    }

    public function storeFolder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'name' => ['required', 'string', 'max:120'],
            'parent_id' => ['nullable', 'integer'],
        ]);

        $folder = $this->driveService->createFolder(
            $request->user(),
            $validated['name'],
            isset($validated['parent_id']) ? (int) $validated['parent_id'] : null,
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Drive folder created successfully.',
            'data' => $folder,
            'errors' => null,
        ], 201);
    }

    public function updateFolder(Request $request, int $folderId): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'name' => ['sometimes', 'string', 'max:120'],
            'parent_id' => ['nullable', 'integer'],
        ]);

        $companyId = isset($validated['company_id']) ? (int) $validated['company_id'] : null;
        unset($validated['company_id']);

        $folder = $this->driveService->updateFolder($request->user(), $folderId, $validated, $companyId);

        return response()->json([
            'success' => true,
            'message' => 'Drive folder updated successfully.',
            'data' => $folder,
            'errors' => null,
        ]);
    }

    public function destroyFolder(Request $request, int $folderId): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $this->driveService->deleteFolder(
            $request->user(),
            $folderId,
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Drive folder deleted successfully.',
            'data' => null,
            'errors' => null,
        ]);
    }

    public function files(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'folder_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $data = $this->driveService->listFiles(
            $request->user(),
            isset($validated['folder_id']) ? (int) $validated['folder_id'] : null,
            $validated['search'] ?? null,
            (int) ($validated['per_page'] ?? 20),
            (int) ($validated['page'] ?? 1),
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Drive files fetched successfully.',
            'data' => $data,
            'errors' => null,
        ]);
    }

    public function storeFile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'folder_id' => ['required', 'integer'],
            'file' => ['required', 'file'],
            'share_with_all' => ['sometimes', 'boolean'],
            'user_ids' => ['sometimes', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $file = $this->driveService->uploadFile(
            $request->user(),
            $request->file('file'),
            (int) $validated['folder_id'],
            $validated['user_ids'] ?? [],
            (bool) ($validated['share_with_all'] ?? false),
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Drive file uploaded successfully.',
            'data' => $file,
            'errors' => null,
        ], 201);
    }

    public function showFile(Request $request, int $fileId): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $file = $this->driveService->showFile(
            $request->user(),
            $fileId,
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Drive file fetched successfully.',
            'data' => $file,
            'errors' => null,
        ]);
    }

    public function downloadFile(Request $request, int $fileId): StreamedResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $payload = $this->driveService->downloadFile(
            $request->user(),
            $fileId,
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return response()->streamDownload(function () use ($payload): void {
            fpassthru($payload['stream']);
            if (is_resource($payload['stream'])) {
                fclose($payload['stream']);
            }
        }, $payload['filename'], [
            'Content-Type' => $payload['mime_type'],
        ]);
    }

    public function updateFile(Request $request, int $fileId): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'original_name' => ['sometimes', 'string', 'max:255'],
            'folder_id' => ['sometimes', 'integer'],
        ]);

        $companyId = isset($validated['company_id']) ? (int) $validated['company_id'] : null;
        unset($validated['company_id']);

        $file = $this->driveService->updateFile($request->user(), $fileId, $validated, $companyId);

        return response()->json([
            'success' => true,
            'message' => 'Drive file updated successfully.',
            'data' => $file,
            'errors' => null,
        ]);
    }

    public function destroyFile(Request $request, int $fileId): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $this->driveService->deleteFile(
            $request->user(),
            $fileId,
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Drive file deleted successfully.',
            'data' => null,
            'errors' => null,
        ]);
    }

    public function syncGrants(Request $request, int $fileId): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'share_with_all' => ['sometimes', 'boolean'],
            'user_ids' => ['sometimes', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $file = $this->driveService->syncFileGrants(
            $request->user(),
            $fileId,
            $validated['user_ids'] ?? [],
            (bool) ($validated['share_with_all'] ?? false),
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Drive file sharing updated successfully.',
            'data' => $file,
            'errors' => null,
        ]);
    }
}
