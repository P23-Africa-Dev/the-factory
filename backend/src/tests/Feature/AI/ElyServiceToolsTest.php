<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\ElyPendingAction;
use App\Models\Kpi;
use App\Models\LeadLabel;
use App\Models\Task;
use App\Models\User;
use App\Services\AI\Agent\Chat\ChatRouter;
use App\Services\AI\Agent\Eval\ElyEvalFixture;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Support\ScriptedChatAdapter;
use Tests\TestCase;

/**
 * The service-backed tools added for the agent engine, driven by a scripted
 * model against the eval fixture organization.
 */
final class ElyServiceToolsTest extends TestCase
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

    public function test_agent_moves_their_own_task_to_in_progress(): void
    {
        $task = $this->org['task'];
        $this->model->callsTools([['tasks.set_status', ['task_id' => $task->id, 'status' => 'in_progress']]])->answers('Started.');

        $this->chat($this->org['users']['agent'], 'Start my Shoprite visit')->assertOk();

        $this->assertSame('in_progress', Task::query()->find($task->id)?->status?->value);
    }

    public function test_other_agent_cannot_move_a_task_not_assigned_to_them(): void
    {
        $task = $this->org['task'];
        $this->model->callsTools([['tasks.set_status', ['task_id' => $task->id, 'status' => 'in_progress']]])->answers('Not allowed.');

        $this->chat($this->org['users']['other_agent'], 'Start the Shoprite visit')->assertOk();

        $this->assertSame('pending', Task::query()->find($task->id)?->status?->value);
        $this->assertTrue(collect($this->model->requests[1]->messages)->firstWhere('role', 'tool')->isError);
    }

    public function test_task_comment_is_added(): void
    {
        $task = $this->org['task'];
        $this->model->callsTools([['tasks.add_comment', ['task_id' => $task->id, 'body' => 'Manager away until 2pm']]])->answers('Comment added.');

        $this->chat($this->org['users']['agent'], 'Comment on the Shoprite task: manager away until 2pm')
            ->assertOk()
            ->assertJsonPath('data.response.payload.executed', true);
    }

    public function test_kpi_delete_waits_for_confirmation(): void
    {
        $kpi = $this->org['kpi'];
        $this->model->callsTools([['kpis.delete', ['kpi_id' => $kpi->id]]])->answers('Confirm below to delete it.');

        $this->chat($this->org['users']['admin'], 'Delete the Retail Visits KPI')
            ->assertOk()
            ->assertJsonPath('data.response.payload.confirmation_required', true);

        $this->assertNotNull(Kpi::query()->find($kpi->id));
        $this->assertSame(1, ElyPendingAction::query()->where('tool', 'kpis.delete')->count());
    }

    public function test_manager_adds_a_crm_stage_but_agents_are_not_offered_it(): void
    {
        $this->model->callsTools([['crm.labels.create', ['name' => 'Sample Sent']]])->answers('Stage added.');
        $this->chat($this->org['users']['admin'], 'Add a stage called Sample Sent')->assertOk();
        $this->assertTrue(LeadLabel::query()->where('company_id', $this->org['company']->id)->where('name', 'Sample Sent')->exists());

        $this->model->answers('You cannot add stages.');
        $this->chat($this->org['users']['agent'], 'Add a stage called Hot')->assertOk();
        $this->assertNotContains('crm.labels.create', $this->model->offeredTools(2));
        $this->assertContains('crm.labels.list', $this->model->offeredTools(2));
    }

    public function test_help_search_returns_grounded_articles_to_the_model(): void
    {
        $this->model->callsTools([['help.search', ['query' => 'import leads from excel']]])->answers('Open CRM and use import.');

        $this->chat($this->org['users']['agent'], 'How do I import leads?')->assertOk();

        $toolMessage = collect($this->model->requests[1]->messages)->firstWhere('role', 'tool');
        $this->assertStringContainsString('Import or export leads', $toolMessage->content);
    }

    public function test_undo_reverses_a_safe_action_once(): void
    {
        $this->model->callsTools([['crm.labels.create', ['name' => 'Sample Sent']]])->answers('Stage added.');

        $response = $this->chat($this->org['users']['admin'], 'Add a stage called Sample Sent')->assertOk();
        $receipt = $response->json('data.response.payload.receipts.0');
        $this->assertSame('Remove this stage', $receipt['undo_label']);
        $this->assertSame('/crm', $receipt['link']);

        $undo = fn () => $this->actingAs($this->org['users']['admin'])
            ->postJson('/api/v1/copilot/actions/undo/'.$receipt['audit_id'], ['company_id' => $this->org['company']->id]);

        $undo()->assertOk()->assertJsonPath('data.response.payload.undone', true);
        $this->assertFalse(LeadLabel::query()->where('company_id', $this->org['company']->id)->where('name', 'Sample Sent')->exists());

        $undo()->assertOk()->assertJsonPath('data.response.payload.undone', false);
    }

    public function test_undo_is_not_offered_when_the_user_cannot_run_the_reverse(): void
    {
        // Agents cannot delete leads, so a lead they add has no Undo.
        $this->model->callsTools([['crm.create_lead', ['name' => 'Sunrise Supermarket']]])->answers('Added.');

        $receipt = $this->chat($this->org['users']['agent'], 'Add a lead called Sunrise Supermarket')
            ->assertOk()
            ->json('data.response.payload.receipts.0');

        $this->assertNull($receipt['undo_label']);
        $this->assertStringStartsWith('/crm/leads/', (string) $receipt['link']);
    }

    public function test_another_user_cannot_undo_my_action(): void
    {
        $this->model->callsTools([['crm.labels.create', ['name' => 'Mine']]])->answers('Added.');
        $auditId = $this->chat($this->org['users']['admin'], 'Add a stage called Mine')->json('data.response.payload.receipts.0.audit_id');

        $this->actingAs($this->org['users']['supervisor'])
            ->postJson('/api/v1/copilot/actions/undo/'.$auditId, ['company_id' => $this->org['company']->id])
            ->assertStatus(422);
        $this->assertTrue(LeadLabel::query()->where('name', 'Mine')->exists());
    }

    public function test_import_leads_from_a_chat_attachment(): void
    {
        \Illuminate\Support\Facades\Storage::fake('local');
        $admin = $this->org['users']['admin'];
        $csv = "Business Name,Phone,City,Notes\nSunrise Supermarket,+2348031234567,Ajah,x\nMama Put Foods,+2348039876543,Surulere,y\n";
        $file = \Illuminate\Http\UploadedFile::fake()->createWithContent('leads.csv', $csv);

        $attachmentId = $this->actingAs($admin)
            ->post('/api/v1/copilot/attachments', ['company_id' => $this->org['company']->id, 'file' => $file], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('data.attachment.id');

        $this->model
            ->callsTools([['crm.import_preview', ['attachment_id' => $attachmentId]]])
            ->callsTools([['crm.import_leads', ['attachment_id' => $attachmentId, 'duplicate_policy' => 'skip']]])
            ->answers('2 leads are ready. Confirm below to import them.');

        $response = $this->actingAs($admin)->postJson('/api/v1/copilot/chat', [
            'company_id' => $this->org['company']->id,
            'message' => 'Import the leads in this file',
            'context' => ['attachment' => ['id' => $attachmentId, 'name' => 'leads.csv']],
        ])->assertOk()->assertJsonPath('data.response.payload.confirmation_required', true);

        $this->assertStringContainsString('attachment_id '.$attachmentId, $this->model->requests[0]->systemPrompt);
        $preview = collect($this->model->requests[1]->messages)->firstWhere('role', 'tool');
        $this->assertStringContainsString('2 of 2 row(s) can be imported', $preview->content);
        $this->assertFalse(\App\Models\Lead::query()->where('name', 'Sunrise Supermarket')->exists());

        $this->actingAs($admin)
            ->postJson('/api/v1/copilot/actions/'.$response->json('data.response.payload.pending_action_id').'/confirm', ['company_id' => $this->org['company']->id])
            ->assertOk()
            ->assertJsonPath('data.response.payload.imported_count', 2);
        $this->assertTrue(\App\Models\Lead::query()->where('company_id', $this->org['company']->id)->where('name', 'Mama Put Foods')->exists());
    }

    public function test_another_user_cannot_read_my_attachment(): void
    {
        \Illuminate\Support\Facades\Storage::fake('local');
        $file = \Illuminate\Http\UploadedFile::fake()->createWithContent('leads.csv', "Name\nSecret Co\n");
        $attachmentId = $this->actingAs($this->org['users']['admin'])
            ->post('/api/v1/copilot/attachments', ['company_id' => $this->org['company']->id, 'file' => $file], ['Accept' => 'application/json'])
            ->json('data.attachment.id');

        $this->model->callsTools([['crm.import_preview', ['attachment_id' => $attachmentId]]])->answers('Not found.');
        $this->chat($this->org['users']['agent'], 'Import that file')->assertOk();

        $toolMessage = collect($this->model->requests[1]->messages)->firstWhere('role', 'tool');
        $this->assertTrue($toolMessage->isError);
        $this->assertStringNotContainsString('Secret Co', $toolMessage->content);
    }

    public function test_merge_leads_fills_gaps_and_removes_the_duplicate(): void
    {
        $keep = $this->org['leads']['acme'];
        $duplicate = $this->org['leads']['bright'];
        $duplicate->forceFill(['email' => 'orders@acme.test', 'industry' => 'Retail'])->save();

        $this->model->callsTools([['crm.merge_leads', ['keep_lead_id' => $keep->id, 'duplicate_lead_id' => $duplicate->id]]])->answers('Confirm below.');
        $pendingId = $this->chat($this->org['users']['admin'], 'Merge Bright into Acme')->json('data.response.payload.pending_action_id');

        $this->actingAs($this->org['users']['admin'])
            ->postJson("/api/v1/copilot/actions/{$pendingId}/confirm", ['company_id' => $this->org['company']->id])
            ->assertOk()
            ->assertJsonPath('data.response.payload.executed', true);

        $this->assertSame('orders@acme.test', $keep->fresh()->email);
        $this->assertNull(\App\Models\Lead::query()->find($duplicate->id));
    }

    public function test_confirmation_payload_describes_the_card_and_accepts_edits(): void
    {
        $bola = $this->org['users']['other_agent'];
        $this->model
            ->callsTools([['org.users.suspend', ['user_id' => $bola->id, 'suspend_type' => 'duration', 'suspend_days' => 3]]])
            ->answers('Confirm below.');

        $payload = $this->chat($this->org['users']['admin'], 'Suspend Bola for 3 days')->json('data.response.payload');

        $this->assertSame(['user_id', 'suspend_type', 'suspend_days', 'suspend_until'], $payload['preview_fields']);
        $this->assertSame('User', $payload['field_labels']['user_id']);
        $this->assertContains('suspend_days', $payload['editable_fields']);
        $this->assertNotContains('user_id', $payload['editable_fields']);
        $this->assertSame(['duration', 'date', 'permanent'], $payload['field_options']['suspend_type']);
        $this->assertStringStartsWith('Suspend a team member', $payload['action_label']);

        // An edit from the card (5 days instead of 3) is applied on confirm.
        $this->actingAs($this->org['users']['admin'])
            ->postJson("/api/v1/copilot/actions/{$payload['pending_action_id']}/confirm", [
                'company_id' => $this->org['company']->id,
                'action_args' => ['suspend_days' => 5],
            ])
            ->assertOk()
            ->assertJsonPath('data.response.payload.executed', true);

        $until = $bola->fresh()->suspended_until;
        $this->assertNotNull($until);
        $this->assertTrue($until->greaterThan(now()->addDays(4)));
    }

    public function test_assign_supervisor_runs_only_after_confirmation(): void
    {
        $bola = $this->org['users']['other_agent'];
        $sam = $this->org['users']['supervisor'];
        $this->model
            ->callsTools([['org.users.assign_supervisor', ['user_id' => $bola->id, 'supervisor_user_id' => $sam->id]]])
            ->answers('Ready to move Bola under Sam. Confirm below.');

        $pendingId = (string) $this->chat($this->org['users']['admin'], 'Put Bola under Sam')
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->json('data.response.payload.pending_action_id');
        $this->assertNull($bola->fresh()->supervisor_user_id);

        $this->actingAs($this->org['users']['admin'])
            ->postJson("/api/v1/copilot/actions/{$pendingId}/confirm", ['company_id' => $this->org['company']->id])
            ->assertOk()
            ->assertJsonPath('data.response.payload.executed', true);
        $this->assertSame((int) $sam->id, (int) $bola->fresh()->supervisor_user_id);
    }

    public function test_people_tools_are_not_offered_to_agents(): void
    {
        $this->model->answers('I cannot do that.');
        $this->chat($this->org['users']['agent'], 'Suspend Bola')->assertOk();

        foreach (['org.users.suspend', 'org.users.delete', 'payroll.approve', 'attendance.settings.update', 'drive.delete_file', 'crm.bulk_delete_leads'] as $tool) {
            $this->assertNotContains($tool, $this->model->offeredTools(0));
        }
    }

    public function test_user_from_another_company_cannot_be_targeted(): void
    {
        $other = \App\Models\User::factory()->createOne();
        $this->model
            ->callsTools([['org.users.suspend', ['user_id' => $other->id, 'suspend_type' => 'permanent']]])
            ->answers('Not found.');

        $this->chat($this->org['users']['admin'], 'Suspend that user')->assertOk();

        // The pending action is created, but confirming it fails the company check.
        $pending = \App\Models\ElyPendingAction::query()->latest('created_at')->first();
        $this->actingAs($this->org['users']['admin'])
            ->postJson("/api/v1/copilot/actions/{$pending->id}/confirm", ['company_id' => $this->org['company']->id])
            ->assertOk()
            ->assertJsonPath('data.response.payload.error', true);
        $this->assertNull($other->fresh()->suspended_until);
    }

    private function chat(User $user, string $message): TestResponse
    {
        return $this->actingAs($user)->postJson('/api/v1/copilot/chat', [
            'company_id' => $this->org['company']->id,
            'message' => $message,
        ]);
    }
}
