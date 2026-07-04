<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AdminActionLog;
use Illuminate\Http\Request;

class AdminActionLogger
{
    public function log(
        string $action,
        ?string $targetType = null,
        ?string $targetId = null,
        array $context = [],
        ?Request $request = null,
    ): AdminActionLog {
        $request ??= request();
        $adminId = auth('admin')->id();

        return AdminActionLog::create([
            'admin_id' => $adminId ? (int) $adminId : null,
            'action' => $action,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'context' => $context ?: null,
            'ip_address' => $request?->ip(),
            'user_agent' => substr((string) $request?->userAgent(), 0, 255) ?: null,
            'created_at' => now(),
        ]);
    }
}
