<?php

use App\Http\Middleware\EnsureAdminHasPermission;
use App\Http\Middleware\EnsureAdminIsActive;
use App\Http\Middleware\EnsureApiAccessRole;
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
            return $request->is('admin/*')
                ? route('admin.login.show')
                : route('login');
        });

        $middleware->alias([
            'admin.active' => EnsureAdminIsActive::class,
            'admin.permission' => EnsureAdminHasPermission::class,
            'access.role' => EnsureApiAccessRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $jsonError = static function (string $message, ?array $errors, int $status): JsonResponse {
            return response()->json(['success' => false, 'message' => $message, 'data' => null, 'errors' => $errors], $status);
        };
        $exceptions->render(function (ValidationException $e, Request $request) use ($jsonError): ?JsonResponse {
            return $request->expectsJson() ? $jsonError('The given data was invalid.', $e->errors(), 422) : null;
        });
        $exceptions->render(function (AuthenticationException $e, Request $request) use ($jsonError): ?JsonResponse {
            return $request->expectsJson() ? $jsonError('Unauthenticated. Please log in to continue.', null, 401) : null;
        });
        $exceptions->render(function (AuthorizationException $e, Request $request) use ($jsonError): ?JsonResponse {
            return $request->expectsJson() ? $jsonError('You do not have permission to perform this action.', null, 403) : null;
        });
        $exceptions->render(function (ModelNotFoundException $e, Request $request) use ($jsonError): ?JsonResponse {
            return $request->expectsJson() ? $jsonError('The requested resource was not found.', null, 404) : null;
        });
        $exceptions->render(function (NotFoundHttpException $e, Request $request) use ($jsonError): ?JsonResponse {
            return $request->expectsJson() ? $jsonError('The requested endpoint was not found.', null, 404) : null;
        });
        $exceptions->render(function (MethodNotAllowedHttpException $e, Request $request) use ($jsonError): ?JsonResponse {
            return $request->expectsJson() ? $jsonError('HTTP method not allowed for this endpoint.', null, 405) : null;
        });
        $exceptions->render(function (TooManyRequestsHttpException $e, Request $request) use ($jsonError): ?JsonResponse {
            return $request->expectsJson() ? $jsonError('Too many requests. Please slow down and try again later.', null, 429) : null;
        });
        $exceptions->render(function (InvalidSignatureException $e, Request $request) use ($jsonError): ?JsonResponse {
            return $request->expectsJson() ? $jsonError('This link is invalid or has expired.', null, 403) : null;
        });
    })->create();
