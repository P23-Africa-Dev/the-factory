<?php

use App\Exceptions\AccountAccessDeniedException;
use App\Http\Middleware\EnsureAdminHasPermission;
use App\Http\Middleware\EnsureAdminIsActive;
use App\Http\Middleware\EnsureApiAccessRole;
use App\Http\Middleware\EnsureCompanyHasActiveSubscription;
use App\Http\Middleware\EnsureUserAccountIsActive;
use App\Http\Middleware\NormalizeRequestPath;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Exceptions\InvalidSignatureException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
        apiPrefix: 'api/v1',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(NormalizeRequestPath::class);

        $middleware->redirectGuestsTo(function (Request $request): string {
            if ($request->is('admin/*')) {
                return route('admin.login.show');
            }
            // API routes — the exception renderer returns JSON 401 before this runs.
            // Fallback to frontend login URL to prevent RouteNotFoundException on
            // requests without Accept: application/json (e.g., browser direct hits).
            return rtrim((string) env('FRONTEND_URL', 'https://thefactory23.com'), '/') . '/login';
        });

        $middleware->alias([
            'admin.active' => EnsureAdminIsActive::class,
            'admin.permission' => EnsureAdminHasPermission::class,
            'access.role' => EnsureApiAccessRole::class,
            'account.active' => EnsureUserAccountIsActive::class,
            'subscription.active' => EnsureCompanyHasActiveSubscription::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $jsonError = static function (string $message, ?array $errors, int $status): JsonResponse {
            return response()->json(['success' => false, 'message' => $message, 'data' => null, 'errors' => $errors], $status);
        };

        // For API routes, always return JSON regardless of Accept header.
        // For admin/* web routes, fall through (return null) so Laravel renders HTML.
        $isApiRequest = static fn(Request $request): bool => $request->is('api/*');

        $exceptions->render(function (ValidationException $e, Request $request) use ($jsonError, $isApiRequest): ?JsonResponse {
            if ($isApiRequest($request) || $request->expectsJson()) {
                return $jsonError('The given data was invalid.', $e->errors(), 422);
            }
            return null;
        });
        $exceptions->render(function (AuthenticationException $e, Request $request) use ($jsonError, $isApiRequest): ?JsonResponse {
            if ($isApiRequest($request) || $request->expectsJson()) {
                return $jsonError('Unauthenticated. Please log in to continue.', null, 401);
            }
            return null;
        });
        $exceptions->render(function (AuthorizationException $e, Request $request) use ($jsonError, $isApiRequest): ?JsonResponse {
            if ($isApiRequest($request) || $request->expectsJson()) {
                return $jsonError('You do not have permission to perform this action.', null, 403);
            }
            return null;
        });
        $exceptions->render(function (AccountAccessDeniedException $e, Request $request) use ($isApiRequest): ?JsonResponse {
            if ($isApiRequest($request) || $request->expectsJson()) {
                return EnsureUserAccountIsActive::blockedResponse(
                    message: $e->getMessage(),
                    accountStatus: $e->accountStatus(),
                    suspendedUntil: $e->suspendedUntil(),
                );
            }
            return null;
        });
        $exceptions->render(function (ModelNotFoundException $e, Request $request) use ($jsonError, $isApiRequest): ?JsonResponse {
            if ($isApiRequest($request) || $request->expectsJson()) {
                return $jsonError('The requested resource was not found.', null, 404);
            }
            return null;
        });
        $exceptions->render(function (NotFoundHttpException $e, Request $request) use ($jsonError, $isApiRequest): ?JsonResponse {
            if ($isApiRequest($request) || $request->expectsJson()) {
                return $jsonError('The requested endpoint was not found.', null, 404);
            }
            return null;
        });
        $exceptions->render(function (MethodNotAllowedHttpException $e, Request $request) use ($jsonError, $isApiRequest): ?JsonResponse {
            if ($isApiRequest($request) || $request->expectsJson()) {
                return $jsonError('HTTP method not allowed for this endpoint.', null, 405);
            }
            return null;
        });
        $exceptions->render(function (TooManyRequestsHttpException $e, Request $request) use ($jsonError, $isApiRequest): ?JsonResponse {
            if ($isApiRequest($request) || $request->expectsJson()) {
                return $jsonError('Too many requests. Please slow down and try again later.', null, 429);
            }
            return null;
        });
        $exceptions->render(function (InvalidSignatureException $e, Request $request) use ($jsonError, $isApiRequest): ?JsonResponse {
            if ($isApiRequest($request) || $request->expectsJson()) {
                return $jsonError('This link is invalid or has expired.', null, 403);
            }
            return null;
        });
    })->create();
