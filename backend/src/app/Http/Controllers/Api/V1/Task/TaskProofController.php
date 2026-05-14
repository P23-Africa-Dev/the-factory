<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Task;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Task\UploadTaskProofRequest;
use App\Http\Resources\TaskProofResource;
use App\Models\Task;
use App\Models\TaskProof;
use App\Services\Task\TaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TaskProofController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly TaskService $taskService) {}

    public function store(UploadTaskProofRequest $request, Task $task): JsonResponse
    {
        $proof = $this->taskService->uploadProof(
            user: $request->user(),
            task: $task,
            file: $request->file('file'),
            data: $request->validated(),
        );

        return $this->success(
            message: 'Task proof uploaded successfully.',
            data: ['proof' => new TaskProofResource($proof)],
            status: 201,
        );
    }

    public function show(Request $request, Task $task, TaskProof $proof): StreamedResponse
    {
        $proof = $this->taskService->findProofForDownload(
            user: $request->user(),
            task: $task,
            proof: $proof,
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return Storage::disk($proof->disk)->download(
            $proof->file_path,
            $this->taskService->proofDownloadName($proof),
            ['Content-Type' => $proof->mime_type],
        );
    }
}
