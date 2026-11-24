<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools\Crm;

use App\Models\Lead;
use App\Services\AI\Agent\Tools\ElyTool;
use App\Services\AI\Agent\Tools\ElyToolCatalog as S;
use App\Services\AI\Agent\Tools\ScopedResolver;
use App\Services\AI\Agent\Tools\ToolContext;
use App\Services\AI\Agent\Tools\ToolKind;
use App\Services\AI\Agent\Tools\ToolResult;
use App\Services\AI\Agent\Tools\ToolRisk;
use App\Services\Crm\LeadService;
use Illuminate\Support\Facades\Validator;

/**
 * Add a note to a CRM lead through LeadService::addNote (agents only on
 * leads they can access).
 */
final class AddLeadNoteTool implements ElyTool
{
    public function __construct(
        private readonly LeadService $leads,
        private readonly ScopedResolver $scopedResolver,
    ) {}

    public function name(): string
    {
        return 'crm.add_note';
    }

    public function description(): string
    {
        return 'Add a note to a CRM lead. Use for call summaries or reminders that are not a field visit (use crm.log_visit for visits). On a lead page, "this lead" is the lead in the current page context.';
    }

    public function inputSchema(): array
    {
        return S::object([
            'lead_id' => S::int('Lead id'),
            'note' => S::str('The note text'),
        ], ['lead_id', 'note']);
    }

    public function kind(): ToolKind
    {
        return ToolKind::Write;
    }

    public function risk(array $args, ToolContext $context): ToolRisk
    {
        return ToolRisk::Safe;
    }

    public function allowedFor(string $role): bool
    {
        return in_array($role, ['owner', 'admin', 'supervisor', 'agent'], true);
    }

    public function statusLabel(): string
    {
        return 'Adding the note';
    }

    public function previewFields(): array
    {
        return ['lead_id', 'note'];
    }

    public function handle(ToolContext $context, array $args): ToolResult
    {
        $this->scopedResolver->assertArgs($args, ['lead_id' => 'lead'], $context->companyId);

        $validated = Validator::make($args, [
            'lead_id' => ['required', 'integer'],
            'note' => ['required', 'string', 'min:2', 'max:5000'],
        ])->validate();

        $lead = Lead::query()->where('company_id', $context->companyId)->findOrFail((int) $validated['lead_id']);
        $note = $this->leads->addNote($context->user, $lead, trim((string) $validated['note']), $context->companyId);

        return new ToolResult(
            summary: "Note added to lead '{$lead->name}'.",
            payload: ['lead_id' => (int) $lead->id, 'note_id' => (int) $note->id, 'name' => (string) $lead->name],
            sources: ['crm.add_note'],
            link: '/crm/leads/'.$lead->id,
        );
    }
}
