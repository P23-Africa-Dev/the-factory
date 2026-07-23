<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Calendar;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Services\Calendar\CompanyCalendarConnectionService;
use App\Services\Calendar\UserCalendarConnectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class CalendarIntegrationController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(
        private readonly CompanyCalendarConnectionService $connectionService,
        private readonly UserCalendarConnectionService $userConnectionService,
    ) {}

    public function status(Request $request): JsonResponse
    {
        $data = $this->connectionService->status(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Calendar integration status fetched successfully.',
            data: $data,
        );
    }

    public function connectUrl(Request $request): JsonResponse
    {
        $data = $this->connectionService->createConnectUrl(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Google Calendar authorization URL generated successfully.',
            data: $data,
        );
    }

    public function disconnect(Request $request): JsonResponse
    {
        $data = $this->connectionService->disconnect(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Google Calendar integration disconnected successfully.',
            data: $data,
        );
    }

    public function switchUrl(Request $request): JsonResponse
    {
        $data = $this->connectionService->switchAccountConnectUrl(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Google Calendar switch-account URL generated successfully.',
            data: $data,
        );
    }

    public function reconnectUrl(Request $request): JsonResponse
    {
        $data = $this->connectionService->reconnectUrl(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Google Calendar reconnect URL generated successfully.',
            data: $data,
        );
    }

    public function callback(Request $request): JsonResponse|Response
    {
        $authenticated = $request->expectsJson() || $request->wantsJson();
        $error = trim((string) $request->query('error', ''));
        $errorDescription = trim((string) $request->query('error_description', ''));

        if ($error !== '') {
            if ($authenticated) {
                throw ValidationException::withMessages([
                    'integration' => [$this->humanizeOAuthError($error, $errorDescription)],
                ]);
            }

            return $this->browserCallbackResponse(
                success: false,
                message: $this->humanizeOAuthError($error, $errorDescription),
                status: 422,
            );
        }

        $validated = $request->validate([
            'code' => ['required', 'string'],
            'state' => ['required', 'string'],
        ]);

        $connectionType = 'company';
        try {
            /** @var array<string,mixed> $payload */
            $payload = decrypt((string) $validated['state']);
            $connectionType = trim((string) ($payload['connection_type'] ?? 'company'));
        } catch (\Throwable) {
            // ignore; completion service will handle invalid state.
        }

        try {
            if ($connectionType === 'user') {
                $data = $this->userConnectionService->completeCallback(
                    code: (string) $validated['code'],
                    state: (string) $validated['state'],
                );
            } else {
                $data = $this->connectionService->completeCallback(
                    code: (string) $validated['code'],
                    state: (string) $validated['state'],
                );
            }
        } catch (ValidationException $exception) {
            if ($authenticated) {
                throw $exception;
            }

            $errors = $exception->errors();
            $message = trim((string) ($errors['integration'][0] ?? $exception->getMessage()));

            if ($message === '') {
                $message = 'Google Calendar connection failed. Please retry from your dashboard.';
            }

            return $this->browserCallbackResponse(
                success: false,
                message: $message,
                status: 422,
                connectionType: $connectionType,
            );
        }

        $gmailEnabled = (bool) ($data['gmail_enabled'] ?? false);

        if ($authenticated) {
            return $this->success(
                message: 'Google Calendar integration connected successfully.',
                data: $data,
            );
        }

        if ($gmailEnabled) {
            return $this->browserCallbackResponse(
                success: true,
                message: 'Google account connected successfully for calendar and email.',
                status: 200,
                connectionType: $connectionType,
                extra: ['gmail_enabled' => true],
            );
        }

        return $this->browserCallbackResponse(
            success: false,
            message: 'Google connected for calendar only. Gmail permissions were not granted. Reconnect and approve all Gmail permissions to enable email.',
            status: 200,
            connectionType: $connectionType,
            extra: ['gmail_enabled' => false, 'requires_gmail_reconnect' => true],
        );
    }

    private function browserCallbackResponse(
        bool $success,
        string $message,
        int $status,
        string $connectionType = 'company',
        array $extra = [],
    ): Response {
        $payload = json_encode(array_merge([
            'type' => 'google-calendar-oauth',
            'status' => $success ? 'success' : 'error',
            'message' => $message,
        ], $extra), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

        if (! is_string($payload) || trim($payload) === '') {
            $payload = '{"type":"google-calendar-oauth","status":"error","message":"Invalid callback payload."}';
        }

        $safeMessage = e($message);
        $redirectUrl = e($this->frontendRedirectUrl($success, $connectionType, $message, $extra));

        $html = <<<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Google Account Connection</title>
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
                json_encode($this->frontendRedirectUrl($success, $connectionType, $message, $extra), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT),
            ),
            $status,
            ['Content-Type' => 'text/html; charset=UTF-8'],
        );
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function frontendRedirectUrl(bool $success, string $connectionType, string $message, array $extra = []): string
    {
        $frontendBase = rtrim((string) config('app.frontend_url', 'https://thefactory23.com'), '/');
        $settingsPath = $connectionType === 'user' ? '/settings/calendar' : '/settings/meetings';

        $query = [
            'google_oauth' => $success ? 'success' : 'error',
            'message' => $message,
        ];

        if (array_key_exists('gmail_enabled', $extra)) {
            $query['gmail_enabled'] = ((bool) $extra['gmail_enabled']) ? '1' : '0';
        }

        if (array_key_exists('requires_gmail_reconnect', $extra)) {
            $query['requires_gmail_reconnect'] = ((bool) $extra['requires_gmail_reconnect']) ? '1' : '0';
        }

        return $frontendBase.$settingsPath.'?'.http_build_query($query);
    }

    private function humanizeOAuthError(string $error, string $errorDescription = ''): string
    {
        $normalized = strtolower(trim($error));
        $description = trim($errorDescription);

        return match ($normalized) {
            'org_internal' => 'This Google OAuth app is currently restricted to one organization. Switch the app to External in Google Cloud Console and retry.',
            'access_denied' => 'Google permissions were not granted. Reconnect and approve all requested Gmail permissions.',
            'admin_policy_enforced' => 'Your Google Workspace admin blocked this app or requested scopes. Contact your admin to allow access.',
            default => $description !== ''
                ? 'Google OAuth error: ' . $description
                : 'Google OAuth error: ' . ($normalized !== '' ? $normalized : 'unknown_error') . '. Please retry connection.',
        };
    }
}
