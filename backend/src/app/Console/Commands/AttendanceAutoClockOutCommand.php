<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Attendance\AttendanceService;
use Illuminate\Console\Command;

class AttendanceAutoClockOutCommand extends Command
{
    protected $signature = 'attendance:auto-clockout {--company_id= : Limit auto-clockout to a single company id}';

    protected $description = 'Auto clock-out open attendance records after company closing time and dispatch closure alerts.';

    public function __construct(private readonly AttendanceService $attendanceService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $companyId = $this->option('company_id') !== null ? (int) $this->option('company_id') : null;

        $result = $this->attendanceService->autoClockOutForOpenRecords($companyId);

        $this->info(sprintf(
            'Attendance auto-clockout completed. auto_clocked=%d closed_notices=%d issue_alerts=%d',
            (int) ($result['auto_clocked_count'] ?? 0),
            (int) ($result['attendance_closed_notices'] ?? 0),
            (int) ($result['attendance_issue_alerts'] ?? 0),
        ));

        return self::SUCCESS;
    }
}
