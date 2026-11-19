<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\AI\Agent\Chat\ChatRouter;
use App\Services\AI\Agent\Eval\ElyEvalRunner;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * Live ELY evaluation against the real model.
 *
 *   php artisan ely:eval                 # all cases, active stack
 *   php artisan ely:eval --provider=glm  # force one provider
 *   php artisan ely:eval --case=crm-     # cases whose id starts with "crm-"
 *   php artisan ely:eval --lint          # only check the case files (no model calls)
 *
 * Each case runs on a throwaway fixture inside a rolled-back transaction with
 * mail, notifications and queues faked. Model calls are real and cost tokens.
 * A JSON report is written to storage/app/ely-evals/.
 */
class ElyEvalCommand extends Command
{
    protected $signature = 'ely:eval
        {--provider= : Force a provider: glm, openai, claude or nvidia}
        {--case= : Only run cases whose id starts with this}
        {--lint : Only validate the case files}
        {--judge : Also grade each answer 1-5 with the model; a score below 3 fails the case}
        {--min-pass=0 : Fail (exit 1) if the pass rate is below this percentage}';

    protected $description = 'Run the ELY evaluation cases against the live model and report pass/fail.';

    public function handle(ElyEvalRunner $runner, ChatRouter $router): int
    {
        $cases = ElyEvalRunner::loadCases();
        $problems = $runner->lint($cases);
        foreach ($problems as $problem) {
            $this->warn('lint: '.$problem);
        }
        if ($this->option('lint')) {
            $this->info(count($cases).' case(s), '.count($problems).' problem(s).');

            return $problems === [] ? self::SUCCESS : self::FAILURE;
        }

        if (is_string($this->option('provider')) && $this->option('provider') !== '') {
            $router->forceProvider((string) $this->option('provider'));
        }
        $this->app()->instance(ChatRouter::class, $router);

        if (! $router->canUseTools()) {
            $this->error('No configured tool-calling provider for this stack. Set the provider API key first.');

            return self::FAILURE;
        }

        $prefix = (string) ($this->option('case') ?? '');
        $selected = array_values(array_filter($cases, static fn (array $c): bool => $prefix === '' || str_starts_with((string) $c['id'], $prefix)));

        $results = [];
        foreach ($selected as $case) {
            $result = $runner->run($case);
            if ($this->option('judge') && $result['answer'] !== '') {
                $grade = $runner->judge($case, $result['answer'], $result['tools']);
                $result['judge'] = $grade;
                if ($grade['score'] > 0 && $grade['score'] < 3) {
                    $result['passed'] = false;
                    $result['failures'][] = "judge {$grade['score']}/5: {$grade['reason']}";
                }
            }
            $results[] = $result;
            $this->line(sprintf(
                '%s %-40s %5.1fs  tools=[%s]%s',
                $result['passed'] ? '<info>PASS</info>' : '<error>FAIL</error>',
                $result['id'],
                $result['seconds'],
                implode(',', $result['tools']),
                $result['passed'] ? '' : '  '.implode('; ', $result['failures']),
            ));
        }

        $passed = count(array_filter($results, static fn (array $r): bool => $r['passed']));
        $total = count($results);
        $rate = $total > 0 ? round($passed / $total * 100, 1) : 0.0;

        $directory = storage_path('app/ely-evals');
        File::ensureDirectoryExists($directory);
        $path = $directory.'/'.now()->format('Ymd_His').'.json';
        File::put($path, (string) json_encode([
            'ran_at' => now()->toIso8601String(),
            'provider' => $this->option('provider') ?: 'stack',
            'passed' => $passed,
            'total' => $total,
            'pass_rate' => $rate,
            'results' => $results,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        $this->info("{$passed}/{$total} passed ({$rate}%). Report: {$path}");

        $minPass = (float) $this->option('min-pass');

        return $rate >= $minPass ? self::SUCCESS : self::FAILURE;
    }

    private function app(): \Illuminate\Contracts\Foundation\Application
    {
        return $this->laravel;
    }
}
