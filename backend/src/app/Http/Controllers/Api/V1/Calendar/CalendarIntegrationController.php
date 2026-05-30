<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Calendar;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Services\Calendar\CompanyCalendarConnectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class CalendarIntegrationController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly CompanyCalendarConnectionService $connectionService) {}

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

    public function callback(Request $request): JsonResponse|Response
    {
        // API clients (tests and SDK integrations) keep the existing JSON behavior.
        if ($request->expectsJson() || $request->wantsJson()) {
            $error = trim((string) $request->query('error', ''));
            if ($error !== '') {
                throw ValidationException::withMessages([
                    'integration' => ['Google returned an OAuth error: ' . $error . '. Please retry connection.'],
                ]);
            }

            $validated = $request->validate([
                'code' => ['required', 'string'],
                'state' => ['required', 'string'],
            ]);

            $data = $this->connectionService->completeCallback(
                code: (string) $validated['code'],
                state: (string) $validated['state'],
            );

            return $this->success(
                message: 'Google Calendar integration connected successfully.',
                data: $data,
            );
        }

        $error = trim((string) $request->query('error', ''));
        if ($error !== '') {
            return $this->browserCallbackResponse(
                success: false,
                message: 'Google returned an OAuth error: ' . $error . '. Please retry connection.',
                status: 422,
            );
        }

        try {
            $validated = $request->validate([
                'code' => ['required', 'string'],
                'state' => ['required', 'string'],
            ]);

            $this->connectionService->completeCallback(
                code: (string) $validated['code'],
                state: (string) $validated['state'],
            );
        } catch (ValidationException $exception) {
            $errors = $exception->errors();
            $message = trim((string) ($errors['integration'][0] ?? $exception->getMessage()));

            if ($message === '') {
                $message = 'Google Calendar connection failed. Please retry from your dashboard.';
            }

            return $this->browserCallbackResponse(success: false, message: $message, status: 422);
        }

        return $this->browserCallbackResponse(
            success: true,
            message: 'Google Calendar connected successfully. You can close this window.',
            status: 200,
        );
    }

    private function browserCallbackResponse(bool $success, string $message, int $status): Response
    {
        $payload = json_encode([
            'type' => 'google-calendar-oauth',
            'status' => $success ? 'success' : 'error',
            'message' => $message,
        ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

        if (! is_string($payload) || trim($payload) === '') {
            $payload = '{"type":"google-calendar-oauth","status":"error","message":"Invalid callback payload."}';
        }

        $safeMessage = e($message);

        $html = <<<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Google Calendar Connection</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #0b1215; }
    .card { width: min(92vw, 480px); background: #fff; border: 1px solid #e6e8ec; border-radius: 14px; padding: 20px; box-shadow: 0 8px 24px rgba(10, 20, 30, 0.08); }
    h1 { margin: 0 0 10px; font-size: 18px; }
    p { margin: 0; line-height: 1.5; font-size: 14px; }
    .success { color: #0f766e; }
    .error { color: #b91c1c; }
  </style>
</head>
<body>
  <main class="card">
    <h1 class="%s">%s</h1>
    <p>You can return to the app window now.</p>
  </main>
  <script>
    (function () {
      var payload = %s;
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, "*");
        }
      } catch (error) {
        // Ignore cross-window access errors.
      }
      setTimeout(function () {
        try { window.close(); } catch (error) { /* noop */ }
      }, 200);
    })();
  </script>
</body>
</html>
HTML;

        return response(
            sprintf($html, $success ? 'success' : 'error', $safeMessage, $payload),
            $status,
            ['Content-Type' => 'text/html; charset=UTF-8'],
        );
    }
}
