<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\LoginRateLimiter;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ThrottleLoginAttempts
{
    public function handle(Request $request, Closure $next): Response
    {
        if (LoginRateLimiter::tooManyAttempts($request)) {
            $seconds = LoginRateLimiter::availableIn($request);

            return $this->buildTooManyAttemptsResponse($seconds);
        }

        return $next($request);
    }

    private function buildTooManyAttemptsResponse(int $seconds): JsonResponse
    {
        $message = $seconds > 0
            ? "Too many failed login attempts. Try again in {$seconds} seconds."
            : 'Too many failed login attempts. Please try again later.';

        return response()
            ->json([
                'success' => false,
                'message' => $message,
                'data' => null,
                'errors' => null,
            ], 429)
            ->withHeaders([
                'Retry-After' => (string) max($seconds, 1),
            ]);
    }
}
