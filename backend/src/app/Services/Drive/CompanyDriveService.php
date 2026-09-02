<?php

declare(strict_types=1);

namespace App\Services\Drive;

use App\Enums\DriveFileSource;
use App\Enums\DriveGranteeType;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\DriveFile;
use App\Models\DriveFileGrant;
use App\Models\DriveFolder;
use App\Models\User;
use App\Notifications\DriveFileSharedNotification;
use App\Services\Notification\NotificationService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

class CompanyDriveService
{
    public function __construct(
        private readonly DriveAccessService $accessService,
        private readonly CompanyDriveStorageService $storageService,
        private readonly CompanyDriveQuotaService $quotaService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * @return array{used_bytes: int, limit_bytes: int, remaining_bytes: int, percent: float}
     */
    public function usage(User $user, ?int $companyId = null): array
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->ensureSystemFolders($context);

        return $this->quotaService->usage($context->company);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listFolders(User $user, ?int $parentId = null, ?int $companyId = null): array
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->ensureSystemFolders($context);

        $query = DriveFolder::query()
            ->where('company_id', $context->company->id)
            ->when($parentId === null, fn ($q) => $q->whereNull('parent_id'))
            ->when($parentId !== null, fn ($q) => $q->where('parent_id', $parentId))
            ->orderBy('is_system', 'desc')
            ->orderBy('name');

        if ($context->isAgent()) {
            $accessibleFolderIds = $this->accessibleFolderIdsForAgent($context);
            $query->whereIn('id', $accessibleFolderIds);
        }

        return $query->get()->map(fn (DriveFolder $folder) => $this->folderPayload($folder))->values()->all();
    }

    /**
     * @return array<string, mixed>
     */
    public function createFolder(User $actor, string $name, ?int $parentId = null, ?int $companyId = null): array
    {
        $context = $this->accessService->resolve($actor, $companyId);
        $this->accessService->ensureCanManage($context);
        $this->ensureSystemFolders($context);

        $name = trim($name);
        if ($name === '') {
            throw ValidationException::withMessages(['name' => ['Folder name is required.']]);
        }

        if ($parentId !== null) {
            $this->findFolderForCompany($context, $parentId);
        }

        $folder = DriveFolder::query()->create([
            'company_id' => $context->company->id,
            'parent_id' => $parentId,
            'name' => $name,
            'is_system' => false,
            'created_by_user_id' => $context->userId,
        ]);

        return $this->folderPayload($folder);
    }

    /**
     * @return array<string, mixed>
     */
    public function updateFolder(User $actor, int $folderId, array $data, ?int $companyId = null): array
    {
        $context = $this->accessService->resolve($actor, $companyId);
        $this->accessService->ensureCanManage($context);

        $folder = $this->findFolderForCompany($context, $folderId);

        if ($folder->is_system) {
            throw ValidationException::withMessages([
                'folder_id' => ['System folders cannot be renamed or moved.'],
            ]);
        }

        if (isset($data['name'])) {
            $name = trim((string) $data['name']);
            if ($name === '') {
                throw ValidationException::withMessages(['name' => ['Folder name is required.']]);
            }
            $folder->name = $name;
        }

        if (array_key_exists('parent_id', $data)) {
            $parentId = $data['parent_id'];
            if ($parentId !== null) {
                $this->findFolderForCompany($context, (int) $parentId);
            }
            $folder->parent_id = $parentId;
        }

        $folder->save();

        return $this->folderPayload($folder->fresh());
    }

    public function deleteFolder(User $actor, int $folderId, ?int $companyId = null): void
    {
        $context = $this->accessService->resolve($actor, $companyId);
        $this->accessService->ensureCanManage($context);

        $folder = $this->findFolderForCompany($context, $folderId);

        if ($folder->is_system) {
            throw ValidationException::withMessages([
                'folder_id' => ['System folders cannot be deleted.'],
            ]);
        }

        if ($folder->children()->exists() || $folder->files()->exists()) {
            throw ValidationException::withMessages([
                'folder_id' => ['Folder must be empty before it can be deleted.'],
            ]);
        }

        $folder->delete();
    }

    /**
     * @return array{items: array<int, array<string, mixed>>, pagination: array<string, mixed>}
     */
    public function listFiles(
        User $user,
        ?int $folderId = null,
        ?string $search = null,
        int $perPage = 20,
        int $page = 1,
        ?int $companyId = null,
    ): array {
        $context = $this->accessService->resolve($user, $companyId);
        $this->ensureSystemFolders($context);

        $query = DriveFile::query()
            ->with(['folder:id,name,system_key', 'grants'])
            ->where('company_id', $context->company->id)
            ->when($folderId !== null, fn ($q) => $q->where('folder_id', $folderId))
            ->when($search, function ($q) use ($search): void {
                $term = '%' . trim($search) . '%';
                $q->where('original_name', 'like', $term);
            })
            ->orderByDesc('created_at');

        if ($context->isAgent()) {
            $query->where(function ($sub) use ($context): void {
                $sub->whereHas('grants', fn ($g) => $g->where('grantee_type', DriveGranteeType::ALL->value))
                    ->orWhereHas('grants', fn ($g) => $g
                        ->where('grantee_type', DriveGranteeType::USER->value)
                        ->where('user_id', $context->userId));
            });
        }

        $paginated = $query->paginate($perPage, ['*'], 'page', $page);

        return [
            'items' => collect($paginated->items())
                ->map(fn (DriveFile $file) => $this->filePayload($file, $context))
                ->values()
                ->all(),
            'pagination' => [
                'total' => $paginated->total(),
                'per_page' => $paginated->perPage(),
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function uploadFile(
        User $actor,
        UploadedFile $file,
        int $folderId,
        ?array $userIds = null,
        bool $shareWithAll = false,
        ?int $companyId = null,
    ): array {
        $context = $this->accessService->resolve($actor, $companyId);
        $this->accessService->ensureCanManage($context);
        $this->ensureSystemFolders($context);

        $folder = $this->findFolderForCompany($context, $folderId);
        $this->quotaService->assertCanStore($context->company, (int) $file->getSize());

        $stored = $this->storageService->storeUploadedFile((int) $context->company->id, $folder->id, $file);

        return DB::transaction(function () use ($actor, $context, $folder, $stored, $userIds, $shareWithAll): array {
            $driveFile = DriveFile::query()->create([
                'company_id' => $context->company->id,
                'folder_id' => $folder->id,
                'disk' => $stored['disk'],
                'file_path' => $stored['file_path'],
                'original_name' => $stored['original_name'],
                'mime_type' => $stored['mime_type'],
                'size_bytes' => $stored['size_bytes'],
                'source' => DriveFileSource::MANUAL->value,
                'uploaded_by_user_id' => $context->userId,
            ]);

            $this->syncGrants($actor, $context, $driveFile, $userIds ?? [], $shareWithAll);

            return $this->filePayload($driveFile->fresh(['grants', 'folder']), $context);
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function showFile(User $user, int $fileId, ?int $companyId = null): array
    {
        $context = $this->accessService->resolve($user, $companyId);
        $file = $this->findFileForAccess($context, $fileId);

        return $this->filePayload($file->load(['grants', 'folder']), $context);
    }

    /**
     * @return array{stream: resource, filename: string, mime_type: string}
     */
    public function downloadFile(User $user, int $fileId, ?int $companyId = null): array
    {
        $context = $this->accessService->resolve($user, $companyId);
        $file = $this->findFileForAccess($context, $fileId);

        $stream = $this->storageService->readStream($file->disk, $file->file_path);

        if ($stream === null) {
            throw new HttpException(404, 'File content was not found.');
        }

        return [
            'stream' => $stream,
            'filename' => $file->original_name,
            'mime_type' => $file->mime_type ?: 'application/octet-stream',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function updateFile(User $actor, int $fileId, array $data, ?int $companyId = null): array
    {
        $context = $this->accessService->resolve($actor, $companyId);
        $this->accessService->ensureCanManage($context);

        $file = DriveFile::query()
            ->where('company_id', $context->company->id)
            ->whereKey($fileId)
            ->firstOrFail();

        if (isset($data['original_name'])) {
            $name = trim((string) $data['original_name']);
            if ($name !== '') {
                $file->original_name = $name;
            }
        }

        if (isset($data['folder_id'])) {
            $this->findFolderForCompany($context, (int) $data['folder_id']);
            $file->folder_id = (int) $data['folder_id'];
        }

        $file->save();

        return $this->filePayload($file->fresh(['grants', 'folder']), $context);
    }

    public function deleteFile(User $actor, int $fileId, ?int $companyId = null): void
    {
        $context = $this->accessService->resolve($actor, $companyId);
        $this->accessService->ensureCanManage($context);

        $file = DriveFile::query()
            ->where('company_id', $context->company->id)
            ->whereKey($fileId)
            ->firstOrFail();

        $this->storageService->delete($file->disk, $file->file_path);
        $file->delete();
    }

    /**
     * @param  array<int>  $userIds
     * @return array<string, mixed>
     */
    public function syncFileGrants(
        User $actor,
        int $fileId,
        array $userIds,
        bool $shareWithAll,
        ?int $companyId = null,
    ): array {
        $context = $this->accessService->resolve($actor, $companyId);
        $this->accessService->ensureCanManage($context);

        $file = DriveFile::query()
            ->where('company_id', $context->company->id)
            ->whereKey($fileId)
            ->firstOrFail();

        $this->syncGrants($actor, $context, $file, $userIds, $shareWithAll);

        return $this->filePayload($file->fresh(['grants', 'folder']), $context);
    }

    public function ensureSystemFolders(DriveAccessContext $context): void
    {
        $systemKey = (string) config('drive.ely_reports_system_key', 'ely_reports');
        $folderName = (string) config('drive.ely_reports_folder_name', 'ELY Reports');

        DriveFolder::query()->firstOrCreate(
            [
                'company_id' => $context->company->id,
                'system_key' => $systemKey,
            ],
            [
                'name' => $folderName,
                'is_system' => true,
                'parent_id' => null,
                'created_by_user_id' => null,
            ],
        );
    }

    public function elyReportsFolder(DriveAccessContext $context): DriveFolder
    {
        $this->ensureSystemFolders($context);
        $systemKey = (string) config('drive.ely_reports_system_key', 'ely_reports');

        return DriveFolder::query()
            ->where('company_id', $context->company->id)
            ->where('system_key', $systemKey)
            ->firstOrFail();
    }

    /**
     * @return array<string, mixed>
     */
    public function archiveElyReport(
        User $actor,
        string $reportId,
        string $originalName,
        string $pdfContent,
        ?int $companyId = null,
    ): array {
        $context = $this->accessService->resolve($actor, $companyId);
        $this->accessService->ensureCanManage($context);

        $existing = DriveFile::query()
            ->where('company_id', $context->company->id)
            ->where('ely_report_id', $reportId)
            ->first();

        if ($existing) {
            return $this->filePayload($existing->load(['grants', 'folder']), $context);
        }

        $folder = $this->elyReportsFolder($context);
        $this->quotaService->assertCanStore($context->company, strlen($pdfContent));

        $stored = $this->storageService->storeRawContent(
            (int) $context->company->id,
            (int) $folder->id,
            $pdfContent,
            $originalName,
            'application/pdf',
        );

        $driveFile = DriveFile::query()->create([
            'company_id' => $context->company->id,
            'folder_id' => $folder->id,
            'disk' => $stored['disk'],
            'file_path' => $stored['file_path'],
            'original_name' => $stored['original_name'],
            'mime_type' => $stored['mime_type'],
            'size_bytes' => $stored['size_bytes'],
            'source' => DriveFileSource::ELY_REPORT->value,
            'ely_report_id' => $reportId,
            'uploaded_by_user_id' => $context->userId,
            'metadata' => ['report_type' => 'weekly_executive_summary'],
        ]);

        DriveFileGrant::query()->create([
            'drive_file_id' => $driveFile->id,
            'grantee_type' => DriveGranteeType::USER->value,
            'user_id' => $context->userId,
            'granted_by_user_id' => $context->userId,
        ]);

        return $this->filePayload($driveFile->fresh(['grants', 'folder']), $context);
    }

    private function syncGrants(
        User $actor,
        DriveAccessContext $context,
        DriveFile $file,
        array $userIds,
        bool $shareWithAll,
    ): void {
        $hadAllGrant = DriveFileGrant::query()
            ->where('drive_file_id', $file->id)
            ->where('grantee_type', DriveGranteeType::ALL->value)
            ->exists();

        $previousUserIds = DriveFileGrant::query()
            ->where('drive_file_id', $file->id)
            ->where('grantee_type', DriveGranteeType::USER->value)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        DriveFileGrant::query()->where('drive_file_id', $file->id)->delete();

        $normalizedUserIds = collect($userIds)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->filter()
            ->values()
            ->all();

        if ($shareWithAll) {
            DriveFileGrant::query()->create([
                'drive_file_id' => $file->id,
                'grantee_type' => DriveGranteeType::ALL->value,
                'user_id' => null,
                'granted_by_user_id' => $context->userId,
            ]);
        }

        foreach ($normalizedUserIds as $userId) {
            DriveFileGrant::query()->create([
                'drive_file_id' => $file->id,
                'grantee_type' => DriveGranteeType::USER->value,
                'user_id' => $userId,
                'granted_by_user_id' => $context->userId,
            ]);
        }

        $recipientIds = $this->resolveGrantRecipients($context, $normalizedUserIds, $shareWithAll)
            ->reject(fn (int $id) => $id === $context->userId);

        if ($shareWithAll && $hadAllGrant) {
            $recipientIds = $recipientIds->reject(fn (int $id) => in_array($id, $previousUserIds, true));
        } elseif (! $shareWithAll) {
            $recipientIds = collect($normalizedUserIds)
                ->reject(fn (int $id) => $id === $context->userId)
                ->reject(fn (int $id) => in_array($id, $previousUserIds, true));
        }

        $this->notifyNewGrantees($actor, $context, $file, $recipientIds);
    }

    /**
     * @return Collection<int, int>
     */
    private function resolveGrantRecipients(DriveAccessContext $context, array $userIds, bool $shareWithAll): Collection
    {
        if ($shareWithAll) {
            return DB::table('company_users')
                ->where('company_id', $context->company->id)
                ->pluck('user_id')
                ->map(fn ($id) => (int) $id);
        }

        return collect($userIds)->map(fn ($id) => (int) $id);
    }

    /**
     * @param  Collection<int, int>|iterable<int, int>  $recipientIds
     */
    private function notifyNewGrantees(User $actor, DriveAccessContext $context, DriveFile $file, iterable $recipientIds): void
    {
        $frontendBase = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        foreach ($recipientIds as $recipientId) {
            $recipient = User::query()->find($recipientId);
            if (! $recipient) {
                continue;
            }

            $membershipRole = DB::table('company_users')
                ->where('company_id', $context->company->id)
                ->where('user_id', $recipientId)
                ->value('role');

            $basePath = $membershipRole === 'agent' ? '/agent' : '';
            $actionUrl = $basePath . '/drive?file=' . $file->id;
            $emailUrl = $frontendBase . $actionUrl;

            $this->notificationService->notifyUser($recipientId, [
                'company_id' => (int) $context->company->id,
                'type' => 'drive.file_shared',
                'category' => NotificationCategory::DRIVE->value,
                'title' => 'New file shared with you',
                'message' => sprintf('%s shared "%s" with you in Company Drive.', $actor->name, $file->original_name),
                'reference_type' => DriveFile::class,
                'reference_id' => (int) $file->id,
                'action_url' => $actionUrl,
                'action_route' => 'drive.file.show',
                'priority' => NotificationPriority::NORMAL->value,
                'created_by_user_id' => $context->userId,
                'metadata' => [
                    'drive_file_id' => $file->id,
                    'folder_id' => $file->folder_id,
                ],
                'dedupe_key' => 'drive-share:' . $file->id . ':' . $recipientId,
            ]);

            try {
                $recipient->notify(new DriveFileSharedNotification(
                    sharerName: $actor->name,
                    fileName: $file->original_name,
                    companyName: (string) $context->company->name,
                    actionUrl: $emailUrl,
                ));
            } catch (Throwable $exception) {
                Log::warning('drive.file_shared email failed', [
                    'drive_file_id' => $file->id,
                    'recipient_id' => $recipientId,
                    'error' => $exception->getMessage(),
                ]);
            }
        }
    }

    private function findFolderForCompany(DriveAccessContext $context, int $folderId): DriveFolder
    {
        return DriveFolder::query()
            ->where('company_id', $context->company->id)
            ->whereKey($folderId)
            ->firstOrFail();
    }

    private function findFileForAccess(DriveAccessContext $context, int $fileId): DriveFile
    {
        $file = DriveFile::query()
            ->where('company_id', $context->company->id)
            ->whereKey($fileId)
            ->firstOrFail();

        if ($context->isManagement()) {
            return $file;
        }

        $hasAccess = DriveFileGrant::query()
            ->where('drive_file_id', $file->id)
            ->where(function ($query) use ($context): void {
                $query->where('grantee_type', DriveGranteeType::ALL->value)
                    ->orWhere(function ($sub) use ($context): void {
                        $sub->where('grantee_type', DriveGranteeType::USER->value)
                            ->where('user_id', $context->userId);
                    });
            })
            ->exists();

        if (! $hasAccess) {
            throw new HttpException(403, 'You do not have access to this drive file.');
        }

        return $file;
    }

    /**
     * @return array<int, int>
     */
    private function accessibleFolderIdsForAgent(DriveAccessContext $context): array
    {
        return DriveFile::query()
            ->where('company_id', $context->company->id)
            ->where(function ($query) use ($context): void {
                $query->whereHas('grants', fn ($g) => $g->where('grantee_type', DriveGranteeType::ALL->value))
                    ->orWhereHas('grants', fn ($g) => $g
                        ->where('grantee_type', DriveGranteeType::USER->value)
                        ->where('user_id', $context->userId));
            })
            ->pluck('folder_id')
            ->unique()
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function folderPayload(DriveFolder $folder): array
    {
        return [
            'id' => (int) $folder->id,
            'company_id' => (int) $folder->company_id,
            'parent_id' => $folder->parent_id !== null ? (int) $folder->parent_id : null,
            'name' => (string) $folder->name,
            'is_system' => (bool) $folder->is_system,
            'system_key' => $folder->system_key,
            'created_at' => $folder->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function filePayload(DriveFile $file, DriveAccessContext $context): array
    {
        return [
            'id' => (int) $file->id,
            'company_id' => (int) $file->company_id,
            'folder_id' => (int) $file->folder_id,
            'folder' => $file->relationLoaded('folder') && $file->folder
                ? $this->folderPayload($file->folder)
                : null,
            'original_name' => (string) $file->original_name,
            'mime_type' => $file->mime_type,
            'size_bytes' => (int) $file->size_bytes,
            'source' => (string) $file->source,
            'ely_report_id' => $file->ely_report_id,
            'uploaded_by_user_id' => $file->uploaded_by_user_id !== null ? (int) $file->uploaded_by_user_id : null,
            'can_manage' => $context->canManageDrive(),
            'grants' => $file->relationLoaded('grants')
                ? $file->grants->map(fn (DriveFileGrant $grant) => [
                    'grantee_type' => $grant->grantee_type,
                    'user_id' => $grant->user_id !== null ? (int) $grant->user_id : null,
                ])->values()->all()
                : [],
            'created_at' => $file->created_at?->toIso8601String(),
        ];
    }
}
