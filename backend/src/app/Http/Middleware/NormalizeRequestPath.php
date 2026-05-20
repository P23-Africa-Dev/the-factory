<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class NormalizeRequestPath
{
    public function handle(Request $request, Closure $next): Response
    {
        $requestUri = $request->server->get('REQUEST_URI');

        if (! is_string($requestUri) || $requestUri === '') {
            return $next($request);
        }

        $parts = explode('?', $requestUri, 2);
        $path = $parts[0] ?? '';
        $query = $parts[1] ?? null;

        if (! str_starts_with($path, '/api/')) {
            return $next($request);
        }

        $normalizedPath = preg_replace('#/{2,}#', '/', $path);

        if (! is_string($normalizedPath) || $normalizedPath === $path) {
            return $next($request);
        }

        $normalizedUri = $query !== null ? $normalizedPath . '?' . $query : $normalizedPath;

        $request->server->set('REQUEST_URI', $normalizedUri);
        $request->server->set('PATH_INFO', $normalizedPath);

        return $next($request);
    }
}
