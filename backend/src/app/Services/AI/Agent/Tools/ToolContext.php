<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools;

use App\Models\User;

/**
 * Who is acting and where. The company and role always come from
 * CompanyContextService, never from model output.
 */
final class ToolContext
{
    /**
     * @param  array{path?: string, entity_type?: string, entity_id?: int|string}  $page
     */
    public function __construct(
        public readonly User $user,
        public readonly int $companyId,
        public readonly string $role,
        public readonly ?string $threadId = null,
        public readonly array $page = [],
        public readonly ?string $timezone = null,
    ) {}

    public function isManager(): bool
    {
        return in_array($this->role, ['owner', 'admin', 'supervisor'], true);
    }
}
