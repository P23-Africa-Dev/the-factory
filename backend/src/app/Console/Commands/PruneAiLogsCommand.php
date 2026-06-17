<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\AiLog;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class PruneAiLogsCommand extends Command
{
    protected $signature = 'ai:prune-logs {--days=30 : Number of days of logs to retain}';
    protected $description = 'Delete AI logs older than the configured retention period.';

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $cutoff = Carbon::now()->subDays($days);

        $this->info("Pruning AI logs older than {$cutoff->toDateTimeString()} ({$days} day retention)...");

        $deleted = 0;
        do {
            $chunk = AiLog::query()
                ->where('created_at', '<', $cutoff)
                ->limit(1000)
                ->delete();
            $deleted += $chunk;
        } while ($chunk > 0);

        $this->info("Pruned {$deleted} AI log record(s).");

        return self::SUCCESS;
    }
}
