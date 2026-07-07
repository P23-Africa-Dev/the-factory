<?php

declare(strict_types=1);

namespace App\Services\AI;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InternalUserInferenceService
{
    /**
     * @param array<string, string> $entities
     * @return array<string, mixed>
     */
    public function infer(string $message, int $companyId, array $entities = []): array
    {
        $name = $this->extractName($message);
        $email = $this->extractEmail($message);
        $role = $this->extractRole($message) ?? 'agent';
        $supervisorId = $role === 'agent'
            ? $this->resolveSupervisorIdFromMessage($message, $companyId, $entities)
            : null;

        return [
            'full_name' => $name ?? '',
            'email' => $email ?? '',
            'role' => $role,
            'assigned_zone' => $this->extractAssignedZone($message) ?? 'General',
            'work_days' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            'base_salary' => 0,
            'salary_type' => 'monthly',
            'commission_enabled' => false,
            'supervisor_user_id' => $supervisorId,
            '__inference' => [
                'missing_full_name' => ! is_string($name) || trim($name) === '',
                'missing_email' => ! is_string($email) || trim($email) === '',
                'missing_supervisor' => $role === 'agent' && $supervisorId === null,
                'role_defaulted' => $this->extractRole($message) === null,
            ],
        ];
    }

    /**
     * @param array<string, mixed> $args
     * @return array<string, mixed>
     */
    public function normalizeProvidedArgs(int $companyId, array $args): array
    {
        $normalized = $args;

        $normalized['full_name'] = Str::limit(trim((string) ($normalized['full_name'] ?? '')), 255, '');
        $normalized['email'] = strtolower(trim((string) ($normalized['email'] ?? '')));
        $normalized['role'] = $this->normalizeRole((string) ($normalized['role'] ?? 'agent'));
        $normalized['assigned_zone'] = Str::limit(trim((string) ($normalized['assigned_zone'] ?? 'General')), 120, '');
        $normalized['work_days'] = is_array($normalized['work_days'] ?? null) && $normalized['work_days'] !== []
            ? array_values(array_map(
                static fn (mixed $day): string => strtolower(trim((string) $day)),
                $normalized['work_days'],
            ))
            : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        $normalized['base_salary'] = is_numeric($normalized['base_salary'] ?? null) ? (float) $normalized['base_salary'] : 0;
        $normalized['salary_type'] = strtolower(trim((string) ($normalized['salary_type'] ?? 'monthly')));
        $normalized['commission_enabled'] = (bool) ($normalized['commission_enabled'] ?? false);

        if (($normalized['role'] ?? 'agent') === 'agent') {
            if (is_numeric($normalized['supervisor_user_id'] ?? null)) {
                $normalized['supervisor_user_id'] = (int) $normalized['supervisor_user_id'];
            } elseif (is_string($normalized['supervisor'] ?? null) && trim((string) $normalized['supervisor']) !== '') {
                $normalized['supervisor_user_id'] = $this->resolveSupervisorIdByToken(
                    (string) $normalized['supervisor'],
                    $companyId,
                );
            }
        } else {
            $normalized['supervisor_user_id'] = null;
        }

        $codes = $this->warningCodes($normalized);
        $normalized['__inference'] = [
            'missing_full_name' => in_array('missing_full_name', $codes, true),
            'missing_email' => in_array('missing_email', $codes, true),
            'missing_supervisor' => in_array('missing_supervisor', $codes, true),
            'role_defaulted' => false,
        ];

        return $normalized;
    }

    /**
     * @param array<string, mixed> $args
     * @return array<int, string>
     */
    public function warningCodes(array $args): array
    {
        $warnings = [];

        if (trim((string) ($args['full_name'] ?? '')) === '') {
            $warnings[] = 'missing_full_name';
        }

        $email = trim((string) ($args['email'] ?? ''));
        if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            $warnings[] = 'missing_email';
        }

        if (($args['role'] ?? 'agent') === 'agent' && ! is_numeric($args['supervisor_user_id'] ?? null)) {
            $warnings[] = 'missing_supervisor';
        }

        return $warnings;
    }

    /**
     * @param array<string, mixed> $args
     * @param array<int, string> $warnings
     */
    public function buildPreviewSummary(array $args, array $warnings = [], bool $blocking = false): string
    {
        $role = ucfirst((string) ($args['role'] ?? 'agent'));
        $name = (string) ($args['full_name'] ?? 'Unknown');
        $email = (string) ($args['email'] ?? 'Missing email');
        $base = sprintf(
            'ELY action ready: create %s "%s" with email %s. Click Confirm Action to proceed.',
            $role,
            $name,
            $email,
        );

        if ($warnings !== []) {
            $base .= ' Notes: ' . implode(' ', array_map(static fn (string $w): string => '[' . $w . ']', $warnings));
        }
        if ($blocking) {
            $base .= ' Confirmation is currently blocked until the required fields are corrected.';
        }

        return $base;
    }

    private function extractRole(string $message): ?string
    {
        if (preg_match('/\b(?:create|add|invite|onboard)\b.{0,30}\bagent\b/i', $message) === 1 || preg_match('/\bnew\s+agent\b/i', $message) === 1) {
            return 'agent';
        }

        if (preg_match('/\b(?:create|add|invite|onboard)\b.{0,30}\bsupervisor\b/i', $message) === 1 || preg_match('/\bnew\s+supervisor\b/i', $message) === 1) {
            return 'supervisor';
        }

        if (preg_match('/\b(?:create|add|invite|onboard)\b.{0,30}\badmin(?:istrator)?\b/i', $message) === 1 || preg_match('/\bnew\s+admin(?:istrator)?\b/i', $message) === 1) {
            return 'admin';
        }

        if (preg_match('/\badmin(?:istrator)?\b/i', $message) === 1) {
            return 'admin';
        }
        if (preg_match('/\bsupervisor\b/i', $message) === 1) {
            return 'supervisor';
        }
        if (preg_match('/\bagent\b/i', $message) === 1) {
            return 'agent';
        }

        return null;
    }

    private function extractName(string $message): ?string
    {
        if (preg_match('/\b(?:name|full\s+name)\s*[:\-]?\s*([A-Za-z][A-Za-z\'\-]+(?:\s+[A-Za-z][A-Za-z\'\-]+){1,3})/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\b(?:agent|supervisor|admin)\s+(?:with\s+name\s+|named\s+)?([A-Za-z][A-Za-z\'\-]+(?:\s+[A-Za-z][A-Za-z\'\-]+){1,3})/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        return null;
    }

    private function extractEmail(string $message): ?string
    {
        if (preg_match('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', $message, $m) === 1) {
            return strtolower(trim((string) $m[0]));
        }

        return null;
    }

    private function extractAssignedZone(string $message): ?string
    {
        if (preg_match('/\b(?:zone|territory|assigned\s+zone)\s*[:\-]?\s*([A-Za-z0-9\-\s]{2,120})/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        return null;
    }

    /**
     * @param array<string, string> $entities
     */
    private function resolveSupervisorIdFromMessage(string $message, int $companyId, array $entities): ?int
    {
        if (preg_match('/\b(?:under|to|report(?:ing)?\s+to|supervisor)\s+([A-Za-z][A-Za-z\'\-]+(?:\s+[A-Za-z][A-Za-z\'\-]+){0,3})/i', $message, $m) === 1) {
            return $this->resolveSupervisorIdByToken((string) $m[1], $companyId);
        }

        if (is_string($entities['agent'] ?? null) && trim((string) $entities['agent']) !== '') {
            return $this->resolveSupervisorIdByToken((string) $entities['agent'], $companyId);
        }

        return null;
    }

    private function resolveSupervisorIdByToken(string $token, int $companyId): ?int
    {
        $candidate = trim($token);
        if ($candidate === '') {
            return null;
        }

        $userId = DB::table('company_users')
            ->join('users', 'users.id', '=', 'company_users.user_id')
            ->where('company_users.company_id', $companyId)
            ->whereIn('company_users.role', ['owner', 'admin', 'supervisor'])
            ->where(function ($query) use ($candidate): void {
                $query->where('users.email', 'like', '%' . $candidate . '%')
                    ->orWhere('users.name', 'like', '%' . $candidate . '%');
            })
            ->value('users.id');

        return is_numeric($userId) ? (int) $userId : null;
    }

    private function normalizeRole(string $role): string
    {
        $normalized = strtolower(trim($role));

        return match ($normalized) {
            'administrator' => 'admin',
            'manager' => 'supervisor',
            default => in_array($normalized, ['admin', 'supervisor', 'agent'], true) ? $normalized : 'agent',
        };
    }
}
