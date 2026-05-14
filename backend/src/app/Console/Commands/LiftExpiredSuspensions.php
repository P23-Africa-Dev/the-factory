<?php

namespace App\Console\Commands;

use App\Services\Admin\UserAdminService;
use Illuminate\Console\Command;

class LiftExpiredSuspensions extends Command
{
    protected $signature = 'users:lift-expired-suspensions';

    protected $description = 'Automatically clear suspended_until for users whose suspension has expired';

    public function __construct(private readonly UserAdminService $userAdminService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $count = $this->userAdminService->liftExpiredSuspensions();

        $this->info("Lifted {$count} expired suspension(s).");

        return self::SUCCESS;
    }
}
