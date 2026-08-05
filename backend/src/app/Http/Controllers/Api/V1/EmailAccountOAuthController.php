<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Resources\EmailAccountResource;
use App\Models\User;
use App\Services\Email\EmailAccountService;
use App\Services\Email\OAuth\GoogleMailOAuthService;
use App\Services\Email\OAuth\MicrosoftMailOAuthService;
use App\Services\Email\OAuth\ZohoMailOAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class EmailAccountOAuthController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(
        private readonly EmailAccountService $emailAccountService,
        private readonly GoogleMailOAuthService $googleMailOAuthService,
        private readonly MicrosoftMailOAuthService $microsoftMailOAuthService,
        private readonly ZohoMailOAuthService $zohoMailOAuthService,
    ) {}

    public function authorize(Request $request, string $provider): JsonResponse
    {
        $provider = strtolower(trim($provider));

        if (! in_array($provider, ['google', 'microsoft', 'zoho'], true)) {
            throw ValidationException::withMessages([
                'provider' => ['Unsupported OAuth provider.'],
            ]);
        }

        $companyId = $this->resolveCompanyContextId($request->input('company_id'));
        $forcePicker = $request->boolean('force_account_picker', false);
        $user = $request->user();

        $data = match ($provider) {
            'google' => $this->googleMailOAuthService->buildAuthorizationUrl((int) $companyId, (int) $user->id, $forcePicker),
            'microsoft' => $this->microsoftMailOAuthService->buildAuthorizationUrl((int) $companyId, (int) $user->id, $forcePicker),
            'zoho' => $this->zohoMailOAuthService->buildAuthorizationUrl((int) $companyId, (int) $user->id, $forcePicker),
        };

        return $this->success(
            message: ucfirst($provider) . ' authorization URL generated successfully.',
            data: $data,
        );
    }

    public function callback(Request $request, string $provider): JsonResponse|Response
    {
        $provider = strtolower(trim($provider));

        if (! in_array($provider, ['google', 'microsoft', 'zoho'], true)) {
            return $this->browserCallbackResponse(false, 'Unsupported email provider.', $provider);
        }

        $authenticated = $request->expectsJson() || $request->wantsJson();
        $error = trim((string) $request->query('error', ''));
        $errorDescription = trim((string) $request->query('error_description', ''));

        if ($error !== '') {
            $message = $this->humanizeOAuthError($error, $errorDescription, $provider);

            if ($authenticated) {
                throw ValidationException::withMessages([
                    'integration' => [$message],
                ]);
            }

            return $this->browserCallbackResponse(false, $message, $provider, 422);
        }

        $validated = $request->validate([
            'code' => ['required', 'string'],
            'state' => ['required', 'string'],
        ]);

        try {
            $state = match ($provider) {
                'google' => $this->googleMailOAuthService->consumeState((string) $validated['state']),
                'microsoft' => $this->microsoftMailOAuthService->consumeState((string) $validated['state']),
                'zoho' => $this->zohoMailOAuthService->consumeState((string) $validated['state']),
            };

            $tokens = match ($provider) {
                'google' => $this->googleMailOAuthService->exchangeCode((string) $validated['code']),
                'microsoft' => $this->microsoftMailOAuthService->exchangeCode((string) $validated['code']),
                'zoho' => $this->zohoMailOAuthService->exchangeCode((string) $validated['code']),
            };

            $user = User::query()->find((int) $state['user_id']);

            if ($user === null) {
                throw ValidationException::withMessages([
                    'integration' => ['User for this OAuth session no longer exists.'],
                ]);
            }

            $account = $this->emailAccountService->connectFromOAuth($user, [
                'company_id' => (int) $state['company_id'],
                'provider' => $provider,
                'email' => $tokens['email'],
                'display_name' => $tokens['display_name'] ?? null,
                'access_token' => $tokens['access_token'],
                'refresh_token' => $tokens['refresh_token'] ?? null,
                'token_expires_at' => $tokens['token_expires_at'] ?? null,
                'scopes' => $tokens['scopes'] ?? [],
                'provider_metadata' => $tokens['provider_metadata'] ?? [],
            ]);

            if ($authenticated) {
                return $this->success(
                    message: ucfirst($provider) . ' email account connected successfully.',
                    data: ['account' => new EmailAccountResource($account)],
                );
            }

            return $this->browserCallbackResponse(
                true,
                ucfirst($provider) . ' email connected successfully.',
                $provider,
                200,
                ['email' => $account->email, 'account_id' => $account->id],
            );
        } catch (ValidationException $e) {
            $message = collect($e->errors())->flatten()->first() ?: 'Email OAuth connection failed.';

            if ($authenticated) {
                throw $e;
            }

            return $this->browserCallbackResponse(false, (string) $message, $provider, 422);
        } catch (\Throwable $e) {
            Log::error('Email account OAuth callback failed.', [
                'provider' => $provider,
                'error' => $e->getMessage(),
            ]);

            if ($authenticated) {
                return $this->error(
                    message: 'Email OAuth connection failed. Please try again.',
                    errors: ['integration' => $e->getMessage()],
                    status: 500,
                );
            }

            return $this->browserCallbackResponse(false, 'Email OAuth connection failed. Please try again.', $provider, 500);
        }
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function browserCallbackResponse(
        bool $success,
        string $message,
        string $provider,
        int $status = 200,
        array $extra = [],
    ): Response {
        $payload = json_encode([
            'type' => 'email-account-oauth',
            'success' => $success,
            'provider' => $provider,
            'message' => $message,
            'extra' => $extra,
        ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

        $safeMessage = e($message);
        $redirectUrl = e($this->frontendRedirectUrl($success, $provider, $message));

        $html = <<<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Email Account Connection</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #0b1215; }
    .card { width: min(92vw, 480px); background: #fff; border: 1px solid #e6e8ec; border-radius: 14px; padding: 20px; box-shadow: 0 8px 24px rgba(10, 20, 30, 0.08); }
    h1 { margin: 0 0 10px; font-size: 18px; }
    p { margin: 0 0 14px; line-height: 1.5; font-size: 14px; }
    a { color: #0b252c; font-weight: 600; }
    .success { color: #0f766e; }
    .error { color: #b91c1c; }
  </style>
</head>
<body>
  <main class="card">
    <h1 class="%s">%s</h1>
    <p>Redirecting you back to Factory 23…</p>
    <p><a id="continue-link" href="%s">Continue to settings</a></p>
  </main>
  <script>
    (function () {
      var payload = %s;
      var redirectUrl = %s;
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, "*");
          setTimeout(function () {
            try { window.close(); } catch (error) { /* noop */ }
            if (!window.closed) {
              window.location.replace(redirectUrl);
            }
          }, 300);
          return;
        }
      } catch (error) {
        // Ignore cross-window access errors and fall through to redirect.
      }
      window.location.replace(redirectUrl);
    })();
  </script>
</body>
</html>
HTML;

        return response(
            sprintf(
                $html,
                $success ? 'success' : 'error',
                $safeMessage,
                $redirectUrl,
                $payload,
                json_encode($this->frontendRedirectUrl($success, $provider, $message), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT),
            ),
            $status,
            ['Content-Type' => 'text/html; charset=UTF-8'],
        );
    }

    private function frontendRedirectUrl(bool $success, string $provider, string $message): string
    {
        $frontendBase = rtrim((string) config('app.frontend_url', 'https://thefactory23.com'), '/');

        return $frontendBase . '/settings/email-accounts?' . http_build_query([
            'email_oauth' => $success ? 'success' : 'error',
            'provider' => $provider,
            'message' => $message,
        ]);
    }

    private function humanizeOAuthError(string $error, string $errorDescription, string $provider): string
    {
        $normalized = strtolower(trim($error));
        $description = trim($errorDescription);
        $label = match ($provider) {
            'microsoft' => 'Microsoft',
            'zoho' => 'Zoho',
            default => 'Google',
        };

        return match ($normalized) {
            'access_denied' => "{$label} permissions were not granted. Reconnect and approve the requested permissions.",
            'org_internal' => 'This OAuth app is currently restricted. Switch the app to External and retry.',
            default => $description !== ''
                ? "{$label} OAuth error: {$description}"
                : "{$label} OAuth error: " . ($normalized !== '' ? $normalized : 'unknown_error') . '. Please retry connection.',
        };
    }
}
