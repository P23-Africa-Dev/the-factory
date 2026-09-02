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
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
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
        try {
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
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to queue CRM email', [
                'lead_id' => $lead->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to send email. Please try again.',
                errors: ['send' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function reply(SendCrmEmailRequest $request, Lead $lead, CrmEmailThread $thread): JsonResponse
    {
        try {
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
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to queue CRM email reply', [
                'lead_id' => $lead->id,
                'thread_id' => $thread->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to send reply. Please try again.',
                errors: ['reply' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function markRead(Request $request, Lead $lead, CrmEmailMessage $message): JsonResponse
    {
        try {
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
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to mark CRM email as read', [
                'lead_id' => $lead->id,
                'message_id' => $message->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to mark email as read.',
                errors: ['mark_read' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function markUnread(Request $request, Lead $lead, CrmEmailMessage $message): JsonResponse
    {
        try {
            $message = $this->crmEmailService->markAsUnread(
                $request->user(),
                $lead,
                $message,
                $this->resolveCompanyContextId($request->input('company_id')),
            );

            return $this->success(
                message: 'Email marked as unread.',
                data: ['message' => new CrmEmailMessageResource($message)],
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to mark CRM email as unread', [
                'lead_id' => $lead->id,
                'message_id' => $message->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to mark email as unread.',
                errors: ['mark_unread' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function moveMessage(Request $request, Lead $lead, CrmEmailMessage $message): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['sometimes', 'integer', 'exists:companies,id'],
            'destination' => ['required', 'string', 'in:inbox,spam'],
        ]);

        try {
            $updated = $validated['destination'] === 'spam'
                ? $this->crmEmailService->moveMessageToSpam(
                    $request->user(),
                    $lead,
                    $message,
                    $this->resolveCompanyContextId($validated['company_id'] ?? null),
                )
                : $this->crmEmailService->moveMessageToInbox(
                    $request->user(),
                    $lead,
                    $message,
                    $this->resolveCompanyContextId($validated['company_id'] ?? null),
                );

            return $this->success(
                message: $validated['destination'] === 'spam'
                    ? 'Email moved to spam in Gmail.'
                    : 'Email moved to inbox in Gmail.',
                data: ['message' => new CrmEmailMessageResource($updated)],
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to move CRM email', [
                'lead_id' => $lead->id,
                'message_id' => $message->id,
                'user_id' => $request->user()->id,
                'destination' => $validated['destination'] ?? null,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to move email in Gmail.',
                errors: ['move' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function modifyLabels(Request $request, Lead $lead, CrmEmailMessage $message): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['sometimes', 'integer', 'exists:companies,id'],
            'add' => ['sometimes', 'array'],
            'add.*' => ['string'],
            'remove' => ['sometimes', 'array'],
            'remove.*' => ['string'],
        ]);

        try {
            $result = $this->crmEmailService->modifyMessageLabels(
                $request->user(),
                $lead,
                $message,
                is_array($validated['add'] ?? null) ? $validated['add'] : [],
                is_array($validated['remove'] ?? null) ? $validated['remove'] : [],
                $this->resolveCompanyContextId($validated['company_id'] ?? null),
            );

            return $this->success(
                message: 'Gmail labels updated.',
                data: [
                    'message' => new CrmEmailMessageResource($result['message']),
                    'label_ids' => $result['label_ids'],
                ],
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to modify CRM email labels', [
                'lead_id' => $lead->id,
                'message_id' => $message->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to update Gmail labels.',
                errors: ['labels' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function listLabels(Request $request): JsonResponse
    {
        try {
            $labels = $this->crmEmailService->listGmailLabels(
                $request->user(),
                $this->resolveCompanyContextId($request->input('company_id')),
            );

            return $this->success(
                message: 'Gmail labels fetched successfully.',
                data: ['items' => $labels],
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to list Gmail labels', [
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to list Gmail labels.',
                errors: ['labels' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function createLabel(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['sometimes', 'integer', 'exists:companies,id'],
            'name' => ['required', 'string', 'max:100'],
        ]);

        try {
            $label = $this->crmEmailService->createGmailLabel(
                $request->user(),
                (string) $validated['name'],
                $this->resolveCompanyContextId($validated['company_id'] ?? null),
            );

            return $this->success(
                message: 'Gmail label created.',
                data: ['label' => $label],
                status: 201,
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to create Gmail label', [
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to create Gmail label.',
                errors: ['labels' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function updateLabel(Request $request, string $label): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['sometimes', 'integer', 'exists:companies,id'],
            'name' => ['required', 'string', 'max:100'],
        ]);

        try {
            $updated = $this->crmEmailService->updateGmailLabel(
                $request->user(),
                $label,
                (string) $validated['name'],
                $this->resolveCompanyContextId($validated['company_id'] ?? null),
            );

            return $this->success(
                message: 'Gmail label updated.',
                data: ['label' => $updated],
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to update Gmail label', [
                'user_id' => $request->user()->id,
                'label_id' => $label,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to update Gmail label.',
                errors: ['labels' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function destroyLabel(Request $request, string $label): JsonResponse
    {
        try {
            $this->crmEmailService->deleteGmailLabel(
                $request->user(),
                $label,
                $this->resolveCompanyContextId($request->input('company_id')),
            );

            return $this->success(message: 'Gmail label deleted.');
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to delete Gmail label', [
                'user_id' => $request->user()->id,
                'label_id' => $label,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to delete Gmail label.',
                errors: ['labels' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function destroy(Request $request, Lead $lead, CrmEmailMessage $message): JsonResponse
    {
        try {
            $this->crmEmailService->deleteMessage(
                $request->user(),
                $lead,
                $message,
                $this->resolveCompanyContextId($request->input('company_id')),
            );

            return $this->success(message: 'Email deleted successfully.');
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to delete CRM email', [
                'lead_id' => $lead->id,
                'message_id' => $message->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to delete email.',
                errors: ['delete' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function uploadAttachment(Request $request, Lead $lead): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:10240'],
            'company_id' => ['sometimes', 'integer', 'exists:companies,id'],
        ]);

        try {
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
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to upload CRM email attachment', [
                'lead_id' => $lead->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to upload attachment. Please try again.',
                errors: ['upload' => $e->getMessage()],
                status: 500,
            );
        }
    }

    public function downloadAttachment(Request $request, CrmEmailAttachment $attachment): StreamedResponse|JsonResponse
    {
        try {
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
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to download CRM email attachment', [
                'attachment_id' => $attachment->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to download attachment.',
                errors: ['download' => $e->getMessage()],
                status: 500,
            );
        }
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
