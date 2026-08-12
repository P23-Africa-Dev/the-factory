<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Resources\EmailAccountResource;
use App\Models\EmailAccount;
use App\Services\Email\EmailAccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class EmailAccountController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(
        private readonly EmailAccountService $emailAccountService,
    ) {}

    /**
     * List all connected email accounts for the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $accounts = $this->emailAccountService->listForUser(
            $request->user(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Email accounts fetched successfully.',
            data: ['items' => EmailAccountResource::collection($accounts)],
        );
    }

    /**
     * Connect a new email account.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', 'in:google,microsoft,zoho,imap_smtp'],
            'email' => ['required', 'email', 'max:255'],
            'display_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'access_token' => ['required_unless:provider,imap_smtp', 'nullable', 'string'],
            'refresh_token' => ['nullable', 'string'],
            'token_expires_at' => ['nullable', 'date'],
            'scopes' => ['nullable', 'array'],
            'scopes.*' => ['string'],
            'provider_metadata' => ['nullable', 'array'],
            'is_default' => ['nullable', 'boolean'],
            'smtp_host' => ['required_if:provider,imap_smtp', 'nullable', 'string', 'max:255'],
            'smtp_port' => ['required_if:provider,imap_smtp', 'nullable', 'integer', 'min:1', 'max:65535'],
            'smtp_encryption' => ['nullable', 'string', 'in:tls,ssl'],
            'smtp_username' => ['nullable', 'string', 'max:255'],
            'smtp_password' => ['required_if:provider,imap_smtp', 'nullable', 'string', 'max:1024'],
            'imap_host' => ['required_if:provider,imap_smtp', 'nullable', 'string', 'max:255'],
            'imap_port' => ['required_if:provider,imap_smtp', 'nullable', 'integer', 'min:1', 'max:65535'],
            'imap_encryption' => ['nullable', 'string', 'in:tls,ssl'],
            'imap_username' => ['nullable', 'string', 'max:255'],
            'imap_password' => ['required_if:provider,imap_smtp', 'nullable', 'string', 'max:1024'],
            'company_id' => ['sometimes', 'integer', 'exists:companies,id'],
        ]);

        try {
            $account = $this->emailAccountService->connect($request->user(), $validated);
            $connectionTest = $this->runImapSmtpConnectionTest(
                $request->user(),
                $account,
                $this->resolveCompanyContextId($request->input('company_id')),
            );

            return $this->success(
                message: $connectionTest['ok'] ?? true
                    ? 'Email account connected successfully.'
                    : 'Email account saved, but connection validation failed.',
                data: [
                    'account' => new EmailAccountResource($account->fresh()),
                    'connection_test' => $connectionTest,
                ],
                status: 201,
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to connect email account', [
                'user_id' => $request->user()->id,
                'provider' => $validated['provider'] ?? 'unknown',
                'email' => $validated['email'] ?? 'unknown',
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to connect email account. Please try again.',
                errors: ['connect' => $e->getMessage()],
                status: 500,
            );
        }
    }

    /**
     * Show a specific email account.
     */
    public function show(Request $request, EmailAccount $account): JsonResponse
    {
        $context = $this->emailAccountService->listForUser(
            $request->user(),
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        if ($context->doesntContain('id', $account->id)) {
            throw ValidationException::withMessages([
                'account' => ['Email account not found.'],
            ]);
        }

        return $this->success(
            message: 'Email account fetched successfully.',
            data: ['account' => new EmailAccountResource($account)],
        );
    }

    /**
     * Update an email account (rename, set default, IMAP/SMTP settings).
     */
    public function update(Request $request, EmailAccount $account): JsonResponse
    {
        $validated = $request->validate([
            'display_name' => ['nullable', 'string', 'max:255'],
            'is_default' => ['nullable', 'boolean'],
            'email' => ['sometimes', 'email', 'max:255'],
            'smtp_host' => ['sometimes', 'nullable', 'string', 'max:255'],
            'smtp_port' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:65535'],
            'smtp_encryption' => ['nullable', 'string', 'in:tls,ssl'],
            'smtp_username' => ['nullable', 'string', 'max:255'],
            'smtp_password' => ['nullable', 'string', 'max:1024'],
            'imap_host' => ['sometimes', 'nullable', 'string', 'max:255'],
            'imap_port' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:65535'],
            'imap_encryption' => ['nullable', 'string', 'in:tls,ssl'],
            'imap_username' => ['nullable', 'string', 'max:255'],
            'imap_password' => ['nullable', 'string', 'max:1024'],
            'company_id' => ['sometimes', 'integer', 'exists:companies,id'],
        ]);

        try {
            $companyId = $this->resolveCompanyContextId($request->input('company_id'));
            $account = $this->emailAccountService->updateSettings(
                $request->user(),
                $account,
                $validated,
                $companyId,
            );

            $connectionTest = $this->runImapSmtpConnectionTest(
                $request->user(),
                $account,
                $companyId,
            );

            return $this->success(
                message: ($connectionTest['ran'] ?? false) && ! ($connectionTest['ok'] ?? true)
                    ? 'Email account updated, but connection validation failed.'
                    : 'Email account updated successfully.',
                data: [
                    'account' => new EmailAccountResource($account->fresh()),
                    'connection_test' => $connectionTest,
                ],
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to update email account', [
                'account_id' => $account->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to update email account.',
                errors: ['update' => $e->getMessage()],
                status: 500,
            );
        }
    }

    /**
     * @return array{ran:bool,ok?:bool,message?:string,smtp?:mixed,imap?:mixed}
     */
    private function runImapSmtpConnectionTest($user, EmailAccount $account, ?int $companyId): array
    {
        if ($account->provider !== 'imap_smtp') {
            return ['ran' => false];
        }

        $result = $this->emailAccountService->testConnection($user, $account, $companyId);

        return [
            'ran' => true,
            'ok' => (bool) ($result['ok'] ?? false),
            'message' => (string) ($result['message'] ?? ''),
            'smtp' => $result['smtp'] ?? null,
            'imap' => $result['imap'] ?? null,
        ];
    }

    /**
     * Disconnect an email account.
     */
    public function destroy(Request $request, EmailAccount $account): JsonResponse
    {
        try {
            $this->emailAccountService->disconnect(
                $request->user(),
                $account,
                $this->resolveCompanyContextId($request->input('company_id')),
            );

            return $this->success(message: 'Email account removed successfully.');
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to disconnect email account', [
                'account_id' => $account->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to remove email account.',
                errors: ['disconnect' => $e->getMessage()],
                status: 500,
            );
        }
    }

    /**
     * Test the connection for an email account.
     */
    public function test(Request $request, EmailAccount $account): JsonResponse
    {
        $result = $this->emailAccountService->testConnection(
            $request->user(),
            $account,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        if (! $result['ok']) {
            return response()->json([
                'success' => false,
                'message' => $result['message'],
                'data' => [
                    'connection_test' => [
                        'ran' => true,
                        'ok' => false,
                        'message' => $result['message'],
                        'smtp' => $result['smtp'] ?? null,
                        'imap' => $result['imap'] ?? null,
                    ],
                ],
                'errors' => [
                    'connection' => [$result['message']],
                    'smtp' => isset($result['smtp']['message']) ? [$result['smtp']['message']] : null,
                    'imap' => isset($result['imap']['message']) ? [$result['imap']['message']] : null,
                ],
            ], 422);
        }

        return $this->success(
            message: $result['message'],
            data: [
                'connection_test' => [
                    'ran' => true,
                    'ok' => true,
                    'message' => $result['message'],
                    'smtp' => $result['smtp'] ?? null,
                    'imap' => $result['imap'] ?? null,
                ],
            ],
        );
    }

    /**
     * Refresh OAuth tokens for an account.
     */
    public function refresh(Request $request, EmailAccount $account): JsonResponse
    {
        $validated = $request->validate([
            'access_token' => ['required', 'string'],
            'refresh_token' => ['nullable', 'string'],
            'token_expires_at' => ['nullable', 'date'],
            'company_id' => ['sometimes', 'integer', 'exists:companies,id'],
        ]);

        try {
            $account = $this->emailAccountService->refreshTokens(
                $request->user(),
                $account,
                (string) $validated['access_token'],
                isset($validated['refresh_token']) ? (string) $validated['refresh_token'] : '',
                isset($validated['token_expires_at']) ? (string) $validated['token_expires_at'] : null,
                $this->resolveCompanyContextId($request->input('company_id')),
            );

            return $this->success(
                message: 'Tokens refreshed successfully.',
                data: ['account' => new EmailAccountResource($account)],
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Failed to refresh email account tokens', [
                'account_id' => $account->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Failed to refresh tokens.',
                errors: ['refresh' => $e->getMessage()],
                status: 500,
            );
        }
    }
}
