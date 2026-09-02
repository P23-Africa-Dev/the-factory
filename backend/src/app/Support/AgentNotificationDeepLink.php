<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Maps dashboard / backend action URLs onto Agent PWA routes.
 * Keep behaviour aligned with the-factory-agent-pwa resolveAgentDeepLink.ts.
 */
final class AgentNotificationDeepLink
{
    public static function resolve(?string $rawUrl): string
    {
        $input = is_string($rawUrl) ? trim($rawUrl) : '';
        if ($input === '') {
            return '/';
        }

        if (preg_match('#^https?://#i', $input) === 1) {
            $parts = parse_url($input);
            if (is_array($parts) && isset($parts['path'])) {
                $path = $parts['path'];
                if (! empty($parts['query'])) {
                    $path .= '?'.$parts['query'];
                }
                if (! empty($parts['fragment'])) {
                    $path .= '#'.$parts['fragment'];
                }

                return self::resolve($path);
            }

            return '/';
        }

        $path = str_starts_with($input, '/') ? $input : '/'.$input;
        if (strlen($path) > 1 && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }

        $pathname = $path;
        $search = '';
        if (str_contains($path, '?')) {
            [$pathname, $query] = explode('?', $path, 2);
            $search = '?'.$query;
        }
        $pathname = $pathname !== '' ? $pathname : '/';

        if ($pathname === '/agent') {
            $pathname = '/';
        } elseif (str_starts_with($pathname, '/agent/')) {
            $pathname = substr($pathname, strlen('/agent'));
        }

        if (preg_match('#^/tasks/(\d+)(?:/.*)?$#', $pathname, $m) === 1) {
            return '/task/'.$m[1].$search;
        }
        if (str_starts_with($pathname, '/tasks/reassignments')) {
            return '/tasks'.$search;
        }
        if ($pathname === '/tasks') {
            return '/tasks'.$search;
        }

        if (preg_match('#^/meetings/(\d+)#', $pathname, $m) === 1) {
            return '/meetings/'.$m[1].$search;
        }
        if (str_starts_with($pathname, '/meetings')) {
            return $pathname.$search;
        }

        if (preg_match('#^/crm/leads/(\d+)#', $pathname, $m) === 1) {
            return '/crm/leads/'.$m[1].$search;
        }
        if (str_starts_with($pathname, '/crm')) {
            return $pathname.$search;
        }

        if (str_starts_with($pathname, '/field-activity')) {
            return $pathname.$search;
        }
        if ($pathname === '/map' || str_starts_with($pathname, '/map/')) {
            return '/map'.$search;
        }

        if (
            str_starts_with($pathname, '/operations/attendance')
            || $pathname === '/operations'
            || str_starts_with($pathname, '/operations/')
        ) {
            return '/';
        }

        if ($pathname === '/user/profile' || $pathname === '/profile') {
            return '/profile';
        }
        if ($pathname === '/assistant' || str_starts_with($pathname, '/assistant/')) {
            return '/assistant';
        }

        $homeAliases = [
            '/',
            '/dashboard',
            '/home',
            '/notifications',
            '/insight',
            '/payroll',
            '/subscribe',
        ];
        if (
            in_array($pathname, $homeAliases, true)
            || str_starts_with($pathname, '/projects/')
            || str_starts_with($pathname, '/enterprise/')
            || str_starts_with($pathname, '/internal')
            || str_starts_with($pathname, '/auth/')
            || str_starts_with($pathname, '/drive')
        ) {
            return '/';
        }

        $knownPrefixes = [
            '/task/',
            '/tasks',
            '/map',
            '/meetings',
            '/crm',
            '/field-activity',
            '/profile',
            '/assistant',
            '/sync',
            '/login',
        ];
        foreach ($knownPrefixes as $prefix) {
            if ($pathname === $prefix || str_starts_with($pathname, $prefix)) {
                return $pathname.$search;
            }
        }

        return '/';
    }
}
