<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Attendance\AttendancePayrollService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class GenerateMonthlyAttendancePayrollCommand extends Command
{
    protected $signature = 'attendance:generate-monthly-payroll
        {--company_id= : Limit generation to a single company id}
        {--year= : Target period year (e.g. 2026)}
        {--month= : Target period month (1-12)}';

    protected $description = 'Generate monthly attendance payroll summaries with attendance-based payout adjustments.';

    public function __construct(private readonly AttendancePayrollService $attendancePayrollService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $companyId = $this->option('company_id') !== null ? (int) $this->option('company_id') : null;
        $yearOption = $this->option('year');
        $monthOption = $this->option('month');

        if (($yearOption === null) xor ($monthOption === null)) {
            $this->error('Both --year and --month must be provided together.');

            return self::INVALID;
        }

        if ($yearOption !== null && $monthOption !== null) {
            $year = (int) $yearOption;
            $month = (int) $monthOption;

            if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) {
                $this->error('Invalid period. Year must be 2000-2100 and month must be 1-12.');

                return self::INVALID;
            }
        } else {
            $period = Carbon::now()->subMonthNoOverflow();
            $year = (int) $period->year;
            $month = (int) $period->month;
        }

        if ($companyId !== null) {
            $generated = $this->attendancePayrollService->generateForCompanyPeriod($companyId, $year, $month, null);
        } else {
            $generated = $this->attendancePayrollService->generateForAllCompaniesPeriod($year, $month);
        }

        $this->info(sprintf(
            'Attendance payroll summaries generated. period=%04d-%02d generated=%d',
            $year,
            $month,
            $generated,
        ));

        return self::SUCCESS;
    }
}
