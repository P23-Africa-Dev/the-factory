<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\AI\Admin\AiProviderDiagnosticService;
use Illuminate\Console\Command;

class DiagnoseAiProvidersCommand extends Command
{
    protected $signature = 'ai:diagnose {--json : Output raw JSON only} {--simulate-failover : Run HTTP-faked failover simulation}';

    protected $description = 'Deep diagnostic for OpenAI and Claude connectivity, completions, intent routing, and failover';

    public function handle(AiProviderDiagnosticService $diagnosticService): int
    {
        $report = $diagnosticService->run(simulateFailover: (bool) $this->option('simulate-failover'));

        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            return self::SUCCESS;
        }

        $this->info('ELY AI Provider Diagnostics');
        $this->newLine();

        foreach (['openai' => 'OpenAI', 'claude' => 'Claude (Anthropic)'] as $key => $label) {
            $health = $report['health'][$key] ?? [];
            $completion = $report['completions'][$key] ?? [];
            $this->line("<fg=cyan>{$label}</>");
            $this->line('  Health: ' . ($health['label'] ?? 'unknown') . ' — ' . ($health['message'] ?? ''));
            if (isset($health['resolved_model'])) {
                $this->line('  Resolved model: ' . $health['resolved_model']);
            }
            $this->line('  Completion: ' . (($completion['ok'] ?? false) ? 'OK' : 'FAILED')
                . ' (' . ($completion['status'] ?? 'unknown') . ') — ' . ($completion['message'] ?? ''));
            if (isset($completion['resolved_model'])) {
                $this->line('  Completion model: ' . $completion['resolved_model']);
            }
            if (isset($completion['latency_ms'])) {
                $this->line('  Latency: ' . $completion['latency_ms'] . 'ms');
            }
            $this->newLine();
        }

        $failover = $report['failover'] ?? [];
        if (($failover['skipped'] ?? false) === true) {
            $this->line('Failover simulation: skipped (use --simulate-failover to run)');
        } else {
            $this->line('Failover simulation: ' . (($failover['ok'] ?? false) ? 'OK' : 'FAILED'));
            if (isset($failover['provider'])) {
                $this->line('  Winning provider: ' . $failover['provider']);
            }
            if (isset($failover['failover_from'])) {
                $this->line('  Failover from: ' . $failover['failover_from']);
            }
        }

        $this->newLine();
        $this->info('Intent smoke tests');
        $rows = $report['intent_smoke'] ?? [];
        $this->table(
            ['Prompt', 'Expected', 'Actual', 'Pass'],
            collect($rows)->map(static fn (array $row): array => [
                mb_substr((string) ($row['prompt'] ?? ''), 0, 48),
                ($row['expected_type'] ?? '') . ':' . ($row['expected_tool'] ?? ''),
                ($row['actual_type'] ?? '') . ':' . ($row['actual_tool'] ?? ''),
                ($row['passed'] ?? false) ? 'yes' : 'no',
            ])->all(),
        );

        return self::SUCCESS;
    }
}
