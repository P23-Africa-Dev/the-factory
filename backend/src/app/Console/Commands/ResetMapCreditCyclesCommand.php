<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\CompanyMapCredit;
use App\Services\Billing\MapCreditService;
use Illuminate\Console\Command;

class ResetMapCreditCyclesCommand extends Command
{
    protected $signature = 'credits:reset-cycles';

    protected $description = 'Reset plan-allocated map credits for organizations whose monthly credit cycle has ended (top-up credits are preserved).';

    public function __construct(private readonly MapCreditService $mapCredits)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $due = CompanyMapCredit::query()
            ->with('company')
            ->whereNotNull('period_end')
            ->where('period_end', '<=', now())
            ->get();

        $reset = 0;

        foreach ($due as $record) {
            $company = $record->company;

            if ($company === null) {
                continue;
            }

            $this->mapCredits->resetPlanCredits($company, 'system');
            $reset++;
        }

        $this->info("Reset map credit cycles for {$reset} organization(s).");

        return self::SUCCESS;
    }
}
