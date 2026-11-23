<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Maps dashboard / backend action URLs onto Agent PWA routes.
 * Keep behaviour aligned with the-factory-agent-pwa resolveAgentDeepLink.ts.
 */
final class AgentNotificationDeepLink
{
    /**
     * Source identifiers forwarded with push / realtime payloads so the PWA can open the
     * exact record for the user's mode (agent or manager), regardless of action_url.
     *
     * @return array{raw_action_url: string, action_route: string, reference_type: string, reference_id: string, task_id: string, lead_id: string, meeting_id: string}
     */
    public static function clickContext(\App\Models\AppNotification $notification): array
    {
        $metadata = is_array($notification->metadata) ? $notification->metadata : [];
        $id = static function (mixed $value): string {
            return is_numeric($value) && (int) $value > 0 ? (string) (int) $value : '';
        };

        return [
            'raw_action_url' => (string) ($notification->action_url ?? ''),
            'action_route' => (string) ($notification->action_route ?? ''),
            'reference_type' => (string) ($notification->reference_type ?? ''),
            'reference_id' => $id($notification->reference_id),
            'task_id' => $id($metadata['task_id'] ?? null),
            'lead_id' => $id($metadata['lead_id'] ?? null),
            'meeting_id' => $id($metadata['meeting_id'] ?? null),
        ];
    }

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
