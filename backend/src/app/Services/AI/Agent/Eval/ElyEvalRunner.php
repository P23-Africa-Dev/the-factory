<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Eval;

use App\Models\ElyActionAudit;
use App\Models\ElyMessage;
use App\Models\ElyPendingAction;
use App\Services\AI\Agent\ElyAgent;
use App\Services\AI\Agent\Tools\ToolContext;
use App\Services\AI\Agent\Tools\ToolKind;
use App\Services\AI\Agent\Tools\ToolRegistry;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Throwable;

/**
 * Runs the ELY eval cases (tests/Ely/cases/*.json) against the real model.
 *
 * Each case runs inside a database transaction on a fresh fixture that is
 * rolled back afterwards; mail, notifications and queued jobs are faked, so
 * nothing leaves the system. The model calls are real and cost tokens.
 */
class ElyEvalRunner
{
    public function __construct(
        private readonly ElyEvalFixture $fixture,
        private readonly ToolRegistry $tools,
    ) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function loadCases(?string $directory = null): array
    {
        $directory ??= base_path('tests/Ely/cases');
        $cases = [];
        foreach (File::glob($directory.'/*.json') ?: [] as $path) {
            $decoded = json_decode((string) File::get($path), true);
            foreach ((array) ($decoded['cases'] ?? []) as $case) {
                if (is_array($case)) {
                    $case['file'] = basename($path);
                    $cases[] = $case;
                }
            }
        }

        return $cases;
    }

    /**
     * @param  array<string, mixed>  $case
     * @return array{id: string, passed: bool, failures: array<int, string>, tools: array<int, string>, confirmation: bool, answer: string, seconds: float}
     */
    public function run(array $case): array
    {
        Mail::fake();
        Notification::fake();
        Queue::fake();
        Bus::fake();

        $started = microtime(true);
        DB::beginTransaction();

        try {
            $seed = $this->fixture->seed();
            $user = $seed['users'][(string) ($case['role'] ?? 'admin')] ?? $seed['users']['admin'];
            $role = in_array($case['role'] ?? 'admin', ['agent', 'other_agent'], true) ? 'agent' : (string) ($case['role'] ?? 'admin');

            $message = $this->fill((string) $case['message'], $seed);
            $page = [];
            if (is_array($case['page'] ?? null)) {
                foreach ($case['page'] as $key => $value) {
                    $page[$key] = $key === 'entity_id' ? (int) $this->fill((string) $value, $seed) : $this->fill((string) $value, $seed);
                }
            }

            $context = new ToolContext($user, (int) $seed['company']->id, $role, null, $page, 'Europe/London');
            $result = app(ElyAgent::class)->chat($context, (string) $seed['company']->name, $message, null);

            $threadId = (string) $result['thread_id'];
            $calledTools = ElyMessage::query()
                ->where('thread_id', $threadId)
                ->where('role', 'assistant')
                ->whereNotNull('tool_calls')
                ->get()
                ->flatMap(static fn (ElyMessage $m): array => array_map(static fn (array $c): string => (string) ($c['name'] ?? ''), (array) $m->tool_calls))
                ->values()
                ->all();
            $pending = ElyPendingAction::query()->where('thread_id', $threadId)->exists();
            $succeededWrites = ElyActionAudit::query()->where('thread_id', $threadId)->where('outcome', 'succeeded')->count();
            $answer = (string) ($result['response']['content'] ?? '');

            $failures = $this->check($case['expect'] ?? [], $calledTools, $pending, $succeededWrites, $answer);
        } catch (Throwable $e) {
            $calledTools = [];
            $pending = false;
            $answer = '';
            $failures = ['exception: '.$e->getMessage()];
        } finally {
            DB::rollBack();
        }

        return [
            'id' => (string) ($case['id'] ?? '?'),
            'passed' => $failures === [],
            'failures' => $failures,
            'tools' => $calledTools,
            'confirmation' => $pending,
            'answer' => $answer,
            'seconds' => round(microtime(true) - $started, 1),
        ];
    }

    /**
     * Grade an answer with the model (no tools). Uses the case's "rubric" when
     * it has one, else a general helpfulness/accuracy rubric. Score 1-5.
     *
     * @param  array<string, mixed>  $case
     * @return array{score: int, reason: string}
     */
    public function judge(array $case, string $answer, array $tools): array
    {
        $rubric = (string) ($case['rubric'] ?? 'The answer directly addresses the request, is accurate given the tools used, does not invent data, is concise, and is in the same language as the request. If an action needed confirmation, it says so instead of claiming it is done.');

        $response = app(\App\Services\AI\Agent\Chat\ChatRouter::class)->chat(new \App\Services\AI\Agent\Chat\ChatRequest(
            systemPrompt: 'You grade replies from an in-app business assistant. Reply with JSON only: {"score": <1-5>, "reason": "<one sentence>"}. 5 = fully meets the rubric, 3 = acceptable with flaws, 1 = wrong or harmful.',
            messages: [\App\Services\AI\Agent\Chat\ChatMessage::user(
                "User request:\n".(string) $case['message']
                ."\n\nTools the assistant called: ".($tools === [] ? 'none' : implode(', ', $tools))
                ."\n\nAssistant reply:\n".$answer
                ."\n\nRubric:\n".$rubric,
            )],
            tools: [],
            maxTokens: 300,
            purpose: 'eval_judge',
        ));

        if ($response->isFailure() || preg_match('/\{.*\}/s', $response->text, $m) !== 1) {
            return ['score' => 0, 'reason' => 'judge unavailable'];
        }

        $decoded = json_decode($m[0], true);

        return [
            'score' => max(0, min(5, (int) ($decoded['score'] ?? 0))),
            'reason' => (string) ($decoded['reason'] ?? ''),
        ];
    }

    /**
     * Checks that do not need the model: every case names real tools, and every
     * write tool is exercised by at least one case.
     *
     * @param  array<int, array<string, mixed>>  $cases
     * @return array<int, string>
     */
    public function lint(array $cases): array
    {
        $problems = [];
        $known = array_keys($this->tools->all());
        $seenIds = [];
        $mentioned = [];

        foreach ($cases as $case) {
            $id = (string) ($case['id'] ?? '');
            if ($id === '' || ! is_string($case['message'] ?? null) || ! is_array($case['expect'] ?? null)) {
                $problems[] = "case '{$id}' in {$case['file']} needs id, message and expect";

                continue;
            }
            if (isset($seenIds[$id])) {
                $problems[] = "duplicate case id '{$id}'";
            }
            $seenIds[$id] = true;

            foreach (['tools_all', 'tools_any', 'forbidden_tools'] as $key) {
                foreach ((array) ($case['expect'][$key] ?? []) as $tool) {
                    $mentioned[] = $tool;
                    if (! in_array($tool, $known, true)) {
                        $problems[] = "case '{$id}' names unknown tool '{$tool}'";
                    }
                }
            }
        }

        foreach ($this->tools->all() as $name => $tool) {
            if ($tool->kind() === ToolKind::Write && ! in_array($name, $mentioned, true)) {
                $problems[] = "write tool '{$name}' has no eval case";
            }
        }

        return $problems;
    }

    /**
     * @param  array<string, mixed>  $expect
     * @param  array<int, string>  $tools
     * @return array<int, string>
     */
    private function check(array $expect, array $tools, bool $pending, int $succeededWrites, string $answer): array
    {
        $failures = [];

        foreach ((array) ($expect['tools_all'] ?? []) as $tool) {
            if (! in_array($tool, $tools, true)) {
                $failures[] = "expected tool {$tool} to be called";
            }
        }

        $any = (array) ($expect['tools_any'] ?? []);
        if ($any !== [] && array_intersect($any, $tools) === []) {
            $failures[] = 'expected one of '.implode(', ', $any);
        }

        foreach ((array) ($expect['forbidden_tools'] ?? []) as $tool) {
            if (in_array($tool, $tools, true) && ($succeededWrites > 0 || $pending)) {
                $failures[] = "forbidden tool {$tool} ran or was prepared";
            }
        }

        if (array_key_exists('confirmation', $expect) && $expect['confirmation'] !== null && (bool) $expect['confirmation'] !== $pending) {
            $failures[] = $expect['confirmation'] ? 'expected a confirmation card' : 'expected no confirmation card';
        }

        if (($expect['no_write'] ?? false) === true && ($succeededWrites > 0 || $pending)) {
            $failures[] = 'expected no write';
        }

        if (($expect['no_successful_write'] ?? false) === true && $succeededWrites > 0) {
            $failures[] = 'expected no successful write';
        }

        $containsAny = (array) ($expect['answer_contains_any'] ?? []);
        if ($containsAny !== []) {
            $hit = false;
            foreach ($containsAny as $needle) {
                if (str_contains($answer, (string) $needle)) {
                    $hit = true;
                    break;
                }
            }
            if (! $hit) {
                $failures[] = 'answer should contain one of: '.implode(' | ', $containsAny);
            }
        }

        foreach ((array) ($expect['answer_not_contains'] ?? []) as $needle) {
            if (str_contains($answer, (string) $needle)) {
                $failures[] = "answer must not contain '{$needle}'";
            }
        }

        return $failures;
    }

    /**
     * @param  array<string, mixed>  $seed
     */
    private function fill(string $text, array $seed): string
    {
        $map = [
            '{task}' => (string) $seed['task']->id,
            '{kpi}' => (string) $seed['kpi']->id,
            '{foreign_lead}' => (string) $seed['foreign_lead']->id,
        ];
        foreach ($seed['leads'] as $key => $lead) {
            $map['{lead:'.$key.'}'] = (string) $lead->id;
        }
        foreach ($seed['users'] as $key => $user) {
            $map['{user:'.$key.'}'] = (string) $user->id;
        }

        return strtr($text, $map);
    }
}
