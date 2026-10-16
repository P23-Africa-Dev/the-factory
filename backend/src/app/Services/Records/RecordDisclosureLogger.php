<?php

declare(strict_types=1);

namespace App\Services\Records;

use App\Models\RecordDisclosure;
use Illuminate\Http\Request;

class RecordDisclosureLogger
{
    /**
     * @param  array<string, mixed>  $filters
     */
    public function record(
        string $report,
        string $action,
        RecordFilters $filters,
        ?int $rowCount = null,
        ?string $requesterType = null,
        ?string $reference = null,
        ?string $note = null,
        ?Request $request = null,
    ): RecordDisclosure {
        $request ??= request();
        $adminId = auth('admin')->id();

        return RecordDisclosure::query()->create([
            'admin_id' => $adminId ? (int) $adminId : null,
            'report' => $report,
            'action' => $action,
            'requester_type' => $requesterType,
            'reference' => $reference !== null && trim($reference) !== '' ? trim($reference) : null,
            'note' => $note !== null && trim($note) !== '' ? trim($note) : null,
            'from_date' => $filters->from->toDateString(),
            'to_date' => $filters->to->toDateString(),
            'filters' => $filters->toArray(),
            'row_count' => $rowCount,
            'ip_address' => $request?->ip(),
            'user_agent' => $this->userAgent($request),
            'created_at' => now(),
        ]);
    }

    private function userAgent(?Request $request): ?string
    {
        $agent = substr((string) $request?->userAgent(), 0, 255);

        return $agent !== '' ? $agent : null;
    }
}
