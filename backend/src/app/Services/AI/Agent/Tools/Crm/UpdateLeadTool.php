<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools\Crm;

use App\Enums\LeadPriority;
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
use Illuminate\Validation\Rule;

/**
 * Change fields on a CRM lead through LeadService::update, so the same rules
 * apply as in the app (agents: stage/pipeline only, contact details only on
 * leads they created).
 */
final class UpdateLeadTool implements ElyTool
{
    private const FIELDS = [
        'name', 'email', 'phone', 'location', 'industry', 'source', 'status', 'priority',
        'next_action', 'assigned_to_user_id', 'pipeline_id', 'budget_amount', 'budget_currency',
    ];

    public function __construct(
        private readonly LeadService $leads,
        private readonly ScopedResolver $scopedResolver,
    ) {}

    public function name(): string
    {
        return 'crm.update_lead';
    }

    public function description(): string
    {
        return 'Change fields on an existing CRM lead: stage (status), priority, next action, owner, contact details, industry, budget. Send only the fields that change. Find the lead id with crm.top_leads first. Agents can only change the stage and pipeline, and contact details on leads they created.';
    }

    public function inputSchema(): array
    {
        return S::object([
            'lead_id' => S::int('Lead id'),
            'name' => S::str(),
            'email' => S::str(),
            'phone' => S::str(),
            'location' => S::str(),
            'industry' => S::str(),
            'source' => S::str(),
            'status' => S::str('Pipeline stage slug'),
            'priority' => S::enum(LeadPriority::values()),
            'next_action' => S::str(),
            'assigned_to_user_id' => S::int('New owner user id (managers only)'),
            'pipeline_id' => S::int(),
            'budget_amount' => ['type' => 'number'],
            'budget_currency' => S::str('ISO 4217, e.g. GBP'),
        ], ['lead_id']);
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
        return 'Updating the lead';
    }

    public function previewFields(): array
    {
        return ['lead_id', 'status', 'priority', 'next_action', 'assigned_to_user_id'];
    }

    public function handle(ToolContext $context, array $args): ToolResult
    {
        $this->scopedResolver->assertArgs($args, [
            'lead_id' => 'lead',
            'pipeline_id' => 'pipeline',
            'assigned_to_user_id' => 'user',
        ], $context->companyId);

        $validated = Validator::make($args, [
            'lead_id' => ['required', 'integer'],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'industry' => ['sometimes', 'nullable', 'string', 'max:120'],
            'source' => ['sometimes', 'nullable', 'string', 'max:120'],
            'status' => ['sometimes', 'required', 'string', 'max:120'],
            'priority' => ['sometimes', 'required', 'string', Rule::in(LeadPriority::values())],
            'next_action' => ['sometimes', 'nullable', 'string', 'max:255'],
            'assigned_to_user_id' => ['sometimes', 'nullable', 'integer'],
            'pipeline_id' => ['sometimes', 'required', 'integer'],
            'budget_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'budget_currency' => ['sometimes', 'nullable', 'string', 'size:3'],
        ])->validate();

        $changes = array_intersect_key($validated, array_flip(self::FIELDS));
        if ($changes === []) {
            return new ToolResult('Nothing to change: no lead fields were given.', ['lead_id' => (int) $validated['lead_id']]);
        }

        $lead = Lead::query()->where('company_id', $context->companyId)->findOrFail((int) $validated['lead_id']);

        // Remember the old values so the change can be undone.
        $previous = ['lead_id' => (int) $lead->id];
        foreach (array_keys($changes) as $field) {
            $value = $lead->getAttribute($field);
            $previous[$field] = $value instanceof \BackedEnum ? $value->value : $value;
        }

        $updated = $this->leads->update($context->user, $lead, [...$changes, 'company_id' => $context->companyId]);

        return (new ToolResult(
            summary: "Lead '{$updated->name}' was updated (".implode(', ', array_keys($changes)).').',
            payload: [
                'lead_id' => (int) $updated->id,
                'name' => (string) $updated->name,
                'status' => (string) $updated->status,
                'priority' => $updated->priority?->value,
                'changed_fields' => array_keys($changes),
            ],
            sources: ['crm.update_lead'],
            link: '/crm/leads/'.$updated->id,
        ))->withUndo('crm.update_lead', $previous, 'Change it back');
    }
}
