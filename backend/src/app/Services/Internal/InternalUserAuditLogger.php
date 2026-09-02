<?php

declare(strict_types=1);

namespace App\Services\Internal;

use App\Models\InternalUserAuditLog;

class InternalUserAuditLogger
{
    /**
     * @param  array<string, mixed>  $metadata
     */
    public function log(int $companyId, int $actorUserId, int $targetUserId, string $action, array $metadata = []): InternalUserAuditLog
    {
        return InternalUserAuditLog::query()->create([
            'company_id' => $companyId,
            'actor_user_id' => $actorUserId,
            'target_user_id' => $targetUserId,
            'action' => $action,
            'metadata' => $metadata === [] ? null : $metadata,
        ]);
    }
}
