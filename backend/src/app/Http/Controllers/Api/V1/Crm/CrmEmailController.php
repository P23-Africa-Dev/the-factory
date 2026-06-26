<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Crm;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\SendCrmEmailRequest;
use App\Http\Resources\CrmEmailAttachmentResource;
use App\Http\Resources\CrmEmailMessageResource;
use App\Http\Resources\CrmEmailThreadResource;
use App\Models\CrmEmailAttachment;
use App\Models\CrmEmailMessage;
use App\Models\CrmEmailThread;
use App\Models\Lead;
use App\Services\Crm\CrmEmailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CrmEmailController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly CrmEmailService $crmEmailService) {}

    public function index(Request $request, Lead $lead): JsonResponse
    {
        $threads = $this->crmEmailService->listThreadsForLead($request->user(), $lead, [
            'company_id' => $this->resolveCompanyContextId($request->input('company_id')),
            'per_page' => $request->input('per_page'),
            'sync' => $request->boolean('sync'),
        ]);

        return $this->success(
            message: 'Lead email threads fetched successfully.',
            data: [
                'items' => CrmEmailThreadResource::collection($threads->items()),
                'pagination' => [
                    'next_page_url' => $threads->nextPageUrl(),
                    'prev_page_url' => $threads->previousPageUrl(),
                    'per_page' => $threads->perPage(),
                    'current_page' => $threads->currentPage(),
                    'last_page' => $threads->lastPage(),
                    'total' => $threads->total(),
                ],
            ],
        );
    }

    public function showThread(Request $request, Lead $lead, CrmEmailThread $thread): JsonResponse
    {
        $thread = $this->crmEmailService->getThreadForLead(
            $request->user(),
            $lead,
            $thread,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Email thread fetched successfully.',
            data: ['thread' => new CrmEmailThreadResource($thread)],
        );
    }

    public function send(SendCrmEmailRequest $request, Lead $lead): JsonResponse
    {
        $message = $this->crmEmailService->queueSend(
            $request->user(),
            $lead,
            $request->validated(),
        );

        return $this->success(
            message: 'Email queued for sending.',
            data: ['message' => new CrmEmailMessageResource($message)],
            status: 202,
        );
    }

    public function reply(SendCrmEmailRequest $request, Lead $lead, CrmEmailThread $thread): JsonResponse
    {
        $payload = $request->validated();
        $payload['gmail_thread_id'] = $thread->gmail_thread_id;

        $message = $this->crmEmailService->queueSend(
            $request->user(),
            $lead,
            $payload,
        );

        return $this->success(
            message: 'Reply queued for sending.',
            data: ['message' => new CrmEmailMessageResource($message)],
            status: 202,
        );
    }

    public function markRead(Request $request, Lead $lead, CrmEmailMessage $message): JsonResponse
    {
        $message = $this->crmEmailService->markAsRead(
            $request->user(),
            $lead,
            $message,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Email marked as read.',
            data: ['message' => new CrmEmailMessageResource($message)],
        );
    }

    public function destroy(Request $request, Lead $lead, CrmEmailMessage $message): JsonResponse
    {
        $this->crmEmailService->deleteMessage(
            $request->user(),
            $lead,
            $message,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(message: 'Email deleted successfully.');
    }

    public function uploadAttachment(Request $request, Lead $lead): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:10240'],
            'company_id' => ['sometimes', 'integer', 'exists:companies,id'],
        ]);

        $attachment = $this->crmEmailService->uploadAttachment(
            $request->user(),
            $lead,
            $request->file('file'),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Attachment uploaded successfully.',
            data: ['attachment' => new CrmEmailAttachmentResource($attachment)],
            status: 201,
        );
    }

    public function downloadAttachment(Request $request, CrmEmailAttachment $attachment): StreamedResponse|JsonResponse
    {
        $attachment = $this->crmEmailService->downloadAttachment(
            $request->user(),
            $attachment,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        if ($attachment->storage_path === null || ! Storage::disk($attachment->storage_disk)->exists($attachment->storage_path)) {
            return $this->error('Attachment file is not available.', status: 404);
        }

        return Storage::disk($attachment->storage_disk)->download(
            $attachment->storage_path,
            $attachment->filename,
            ['Content-Type' => $attachment->mime_type ?? 'application/octet-stream'],
        );
    }

    public function activity(Request $request): JsonResponse
    {
        return $this->success(
            message: 'CRM email activity fetched successfully.',
            data: [
                'items' => $this->crmEmailService->recentActivity(
                    $request->user(),
                    $this->resolveCompanyContextId($request->input('company_id')),
                    max(1, min(20, (int) $request->input('limit', 5))),
                ),
                'stats' => $this->crmEmailService->emailStats(
                    $request->user(),
                    $this->resolveCompanyContextId($request->input('company_id')),
                ),
            ],
        );
    }
}
