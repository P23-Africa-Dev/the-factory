<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\CompanyZone;
use App\Models\ElyPendingAction;
use App\Models\Kpi;
use App\Models\Lead;
use App\Models\Task;
use App\Models\TaskSubtask;
use App\Models\User;
use App\Services\AI\Agent\Chat\ChatRouter;
use App\Services\AI\Agent\Eval\ElyEvalFixture;
use App\Services\AI\Agent\Eval\ElyEvalRunner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Support\ScriptedChatAdapter;
use Tests\TestCase;

/**
 * Regressions from the first production `ely:eval` run (2026-11-23): safe
 * edits that showed a confirmation card, lookups that gave the model no id
 * to act on, and eval cases whose fixture lacked the data they talk about.
 */
final class ElyAgentEvalRegressionTest extends TestCase
{
    use RefreshDatabase;

    private ScriptedChatAdapter $model;

    /** @var array<string, mixed> */
    private array $org;

    protected function setUp(): void
    {
        parent::setUp();
        config(['ely.agent.engine' => 'agent', 'services.ai.enable_actions' => true]);

        $this->model = new ScriptedChatAdapter('openai');
        $router = app(ChatRouter::class);
        $router->useAdapters(['openai' => $this->model]);
        $this->app->instance(ChatRouter::class, $router);

        $this->org = app(ElyEvalFixture::class)->seed();
    }

    public function test_finding_a_task_then_moving_it_runs_without_a_card(): void
    {
        $task = $this->org['task'];
        $this->model
            ->callsTools([['tasks.list', []]])
            ->callsTools([['tasks.set_status', ['task_id' => $task->id, 'status' => 'in_progress']]])
            ->answers('Visit Shoprite Lekki is now in progress.');

        $this->chat($this->org['users']['agent'], 'Mark my task Visit Shoprite Lekki as in progress')
            ->assertOk()
            ->assertJsonPath('data.response.payload.executed', true)
            ->assertJsonMissingPath('data.response.payload.confirmation_required');

        $this->assertSame('in_progress', Task::query()->find($task->id)?->status?->value);
        $this->assertSame(0, ElyPendingAction::query()->count());
        // The lookup is still handed to the model as untrusted data.
        $this->assertStringContainsString('untrusted_content', collect($this->model->requests[1]->messages)->firstWhere('role', 'tool')->content);
    }

    public function test_finding_a_lead_then_updating_it_runs_without_a_card(): void
    {
        $lead = $this->org['leads']['bright'];
        $this->model
            ->callsTools([['crm.top_leads', ['search' => 'Bright Pharmacy']]])
            ->callsTools([['crm.update_lead', ['lead_id' => $lead->id, 'next_action' => 'send price list']]])
            ->answers('Done.');

        $this->chat($this->org['users']['admin'], "Find Bright Pharmacy and set its next action to 'send price list'")
            ->assertOk()
            ->assertJsonPath('data.response.payload.executed', true);

        $this->assertSame('send price list', Lead::query()->find($lead->id)?->next_action);
    }

    public function test_finding_a_task_then_adding_a_subtask_runs_without_a_card(): void
    {
        $task = $this->org['task'];
        $this->model
            ->callsTools([['tasks.list', []]])
            ->callsTools([['tasks.subtasks.add', ['task_id' => $task->id, 'title' => 'Take shelf photo']]])
            ->answers('Added.');

        $this->chat($this->org['users']['admin'], "Add a checklist item 'Take shelf photo' to the Visit Shoprite Lekki task")
            ->assertOk()
            ->assertJsonPath('data.response.payload.executed', true);

        $this->assertTrue(TaskSubtask::query()->where('task_id', $task->id)->where('title', 'Take shelf photo')->exists());
    }

    public function test_edit_after_reading_content_still_needs_confirmation(): void
    {
        // With no lookup reads configured, tasks.list counts as content such
        // as an email: any write after it must be confirmed.
        config(['ely.agent.lookup_reads' => []]);
        $task = $this->org['task'];
        $this->model
            ->callsTools([['tasks.list', []]])
            ->callsTools([['tasks.set_status', ['task_id' => $task->id, 'status' => 'in_progress']]])
            ->answers('Confirm below.');

        $this->chat($this->org['users']['agent'], 'Start my Shoprite visit')
            ->assertOk()
            ->assertJsonPath('data.response.payload.confirmation_required', true);

        $this->assertSame('pending', Task::query()->find($task->id)?->status?->value);
    }

    public function test_kpi_list_gives_the_model_ids_to_act_on(): void
    {
        $kpi = $this->org['kpi'];
        $this->model
            ->callsTools([['kpi.list', []]])
            ->callsTools([['kpis.set_status', ['kpi_id' => $kpi->id, 'status' => 'in_progress']]])
            ->answers('Retail Visits is in progress.');

        $this->chat($this->org['users']['agent'], 'I have started working on my Retail Visits KPI, mark it in progress')
            ->assertOk()
            ->assertJsonPath('data.response.payload.executed', true);

        $listed = collect($this->model->requests[1]->messages)->firstWhere('role', 'tool')->content;
        $this->assertStringContainsString('"id":'.$kpi->id, $listed);
        $this->assertStringContainsString('"priority":"medium"', $listed);
        $this->assertSame('in_progress', Kpi::query()->find($kpi->id)?->status?->value);
    }

    public function test_an_empty_model_reply_is_nudged_once_instead_of_giving_up(): void
    {
        $kpi = $this->org['kpi'];
        $this->model
            ->callsTools([['kpi.list', []]])
            ->answers('')
            ->callsTools([['kpis.update', ['kpi_id' => $kpi->id, 'priority' => 'high']]])
            ->answers('Retail Visits is now high priority.');

        $this->chat($this->org['users']['admin'], 'Make the Retail Visits KPI high priority')
            ->assertOk()
            ->assertJsonPath('data.response.content', 'Retail Visits is now high priority.');

        $this->assertSame('high', Kpi::query()->find($kpi->id)?->priority?->value);
        $nudge = collect($this->model->requests[2]->messages)->last();
        $this->assertSame('user', $nudge->role);
        $this->assertStringContainsString('Your last reply was empty', $nudge->content);
    }

    public function test_a_second_empty_reply_ends_the_turn(): void
    {
        $this->model->answers('')->answers('');

        $this->chat($this->org['users']['admin'], 'Hmm')
            ->assertOk()
            ->assertJsonPath('data.response.content', 'I could not finish that request. Please try rephrasing it.');

        $this->assertCount(2, $this->model->requests);
    }

    public function test_agent_creates_a_task_for_themselves_directly(): void
    {
        $agent = $this->org['users']['agent'];
        $this->model
            ->callsTools([['tasks.create', ['title' => 'Call Acme Retail', 'due_date' => now()->addDay()->setTime(9, 0)->toIso8601String()]]])
            ->answers('Task created for tomorrow at 9am.');

        $this->chat($agent, 'Create a task for me to call Acme Retail tomorrow at 9am')
            ->assertOk()
            ->assertJsonPath('data.response.payload.executed', true);

        $this->assertContains('tasks.create', $this->model->offeredTools(0));
        $task = Task::query()->where('title', 'Call Acme Retail')->first();
        $this->assertNotNull($task);
        $this->assertSame($agent->id, (int) $task->assigned_agent_id);
    }

    public function test_an_agents_new_task_is_always_their_own(): void
    {
        $agent = $this->org['users']['agent'];
        $bola = $this->org['users']['other_agent'];
        $this->model
            ->callsTools([['tasks.create', ['title' => 'Cover my route', 'assigned_agent_ids' => [$bola->id]]]])
            ->answers('Created.');

        $this->chat($agent, 'Create a task for Bola to cover my route')->assertOk();

        // Assignees from an agent are dropped (as in the legacy engine), so
        // the task can only land on the agent who asked.
        $task = Task::query()->where('title', 'Cover my route')->first();
        $this->assertNotNull($task);
        $this->assertSame($agent->id, (int) $task->assigned_agent_id);
        $this->assertNotSame($bola->id, (int) $task->assigned_agent_id);
    }

    public function test_zone_lookup_by_name_then_delete_needs_confirmation(): void
    {
        $zone = $this->org['zone'];
        $this->model
            ->callsTools([['zones.list', ['search' => 'Eti Osa']]])
            ->callsTools([['zones.delete', ['zone_id' => $zone->id]]])
            ->answers('Confirm below to delete the Eti-Osa zone.');

        $this->chat($this->org['users']['admin'], 'Delete the Eti-Osa zone')
            ->assertOk()
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.tool', 'zones.delete');

        $this->assertStringContainsString('"zone_id":'.$zone->id, collect($this->model->requests[1]->messages)->firstWhere('role', 'tool')->content);
        $this->assertNotNull(CompanyZone::query()->find($zone->id));
    }

    public function test_zones_are_not_offered_to_agents(): void
    {
        $this->model->answers('I cannot see zones.');
        $this->chat($this->org['users']['agent'], 'List zones')->assertOk();

        $this->assertNotContains('zones.list', $this->model->offeredTools(0));
    }

    public function test_reassignment_inbox_lists_requests_sent_to_me_then_reply_needs_confirmation(): void
    {
        $request = $this->org['reassignment'];
        $this->model
            ->callsTools([['tasks.reassignments.inbox', []]])
            ->callsTools([['tasks.reassignment.respond', ['reassignment_id' => $request->id, 'decision' => 'accept']]])
            ->answers('Confirm below to accept it.');

        $this->chat($this->org['users']['other_agent'], 'Accept the task reassignment request I received')
            ->assertOk()
            ->assertJsonPath('data.response.payload.confirmation_required', true);

        $inbox = collect($this->model->requests[1]->messages)->firstWhere('role', 'tool')->content;
        $this->assertStringContainsString('"reassignment_id":'.$request->id, $inbox);
        $this->assertStringContainsString('Visit Shoprite Lekki', $inbox);
        $this->assertSame('pending', $request->fresh()->status?->value);
    }

    public function test_reassignment_inbox_is_empty_for_someone_else(): void
    {
        $this->model->callsTools([['tasks.reassignments.inbox', []]])->answers('None.');

        $this->chat($this->org['users']['agent'], 'Any handover requests for me?')->assertOk();

        $this->assertStringContainsString('No pending reassignment requests', collect($this->model->requests[1]->messages)->firstWhere('role', 'tool')->content);
    }

    public function test_system_prompt_says_to_call_confirm_tools_and_where_billing_lives(): void
    {
        $this->model->answers('Hi.');
        $this->chat($this->org['users']['admin'], 'Hello')->assertOk();

        $prompt = $this->model->requests[0]->systemPrompt;
        $this->assertStringContainsString('call the tool straight away', $prompt);
        $this->assertStringContainsString('Never ask "shall I go ahead?"', $prompt);
        $this->assertStringContainsString('Settings > Billing', $prompt);
    }

    public function test_eval_runner_attaches_a_file_when_the_case_says_so_and_removes_it(): void
    {
        Storage::fake('local');
        $this->model->answers('I will check the file.');

        $result = app(ElyEvalRunner::class)->run([
            'id' => 'attached',
            'role' => 'admin',
            'message' => 'Import the leads in the file I just attached',
            'page' => ['path' => '/dashboard', 'attachment_id' => '{attachment}', 'attachment_name' => 'leads.csv'],
            'expect' => [],
        ]);

        $this->assertTrue($result['passed'], implode('; ', $result['failures']));
        $this->assertMatchesRegularExpression('/Attached file: leads\.csv \(attachment_id [0-9A-Z]{26}\)/', $this->model->requests[0]->systemPrompt);
        $this->assertSame([], Storage::disk('local')->allFiles('ely-attachments'));
    }

    private function chat(User $user, string $message): TestResponse
    {
        return $this->actingAs($user)->postJson('/api/v1/copilot/chat', [
            'company_id' => $this->org['company']->id,
            'message' => $message,
        ]);
    }
}
