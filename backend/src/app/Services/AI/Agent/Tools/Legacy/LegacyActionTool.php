<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools\Legacy;

use App\Services\AI\ActionFieldCatalog;
use App\Services\AI\Agent\Tools\ElyTool;
use App\Services\AI\Agent\Tools\ScopedResolver;
use App\Services\AI\Agent\Tools\ToolContext;
use App\Services\AI\Agent\Tools\ToolKind;
use App\Services\AI\Agent\Tools\ToolResult;
use App\Services\AI\Agent\Tools\ToolRisk;
use App\Services\AI\Policy\ToolPolicyService;
use App\Services\AI\Tools\ActionToolRegistry;
use Closure;

/**
 * Exposes one of the existing ActionToolRegistry actions as an ElyTool.
 * Execution still goes through ActionToolRegistry and the domain services, so
 * behaviour and permission checks are unchanged; this adds a schema, a risk
 * tier and company-scoped id checks.
 */
final class LegacyActionTool implements ElyTool
{
    /**
     * @param  array<string, mixed>  $schema
     * @param  array<string, string>  $scopedFields  field => ScopedResolver kind
     * @param  ToolRisk|Closure(array<string, mixed>, ToolContext): ToolRisk  $risk
     */
    public function __construct(
        private readonly string $name,
        private readonly string $description,
        private readonly array $schema,
        private readonly ToolRisk|Closure $risk,
        private readonly string $statusLabel,
        private readonly array $scopedFields,
        private readonly ActionToolRegistry $actions,
        private readonly ToolPolicyService $policy,
        private readonly ScopedResolver $scopedResolver,
        private readonly LegacyArgNormalizer $normalizer,
    ) {}

    public function name(): string
    {
        return $this->name;
    }

    public function description(): string
    {
        return $this->description;
    }

    public function inputSchema(): array
    {
        return $this->schema;
    }

    public function kind(): ToolKind
    {
        return ToolKind::Write;
    }

    public function risk(array $args, ToolContext $context): ToolRisk
    {
        return $this->risk instanceof Closure ? ($this->risk)($args, $context) : $this->risk;
    }

    public function allowedFor(string $role): bool
    {
        return $this->policy->canUseTool($role, $this->name);
    }

    public function statusLabel(): string
    {
        return $this->statusLabel;
    }

    public function previewFields(): array
    {
        return ActionFieldCatalog::forTool($this->name)['preview'];
    }

    /**
     * Fill defaults the same way the legacy engine does, so a draft shown on
     * a confirmation card is exactly what will be saved.
     *
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function prepare(ToolContext $context, array $args): array
    {
        unset($args['company_id']);
        $args = $this->normalizer->normalize($this->name, $args, $context);
        unset($args['company_id']);

        return $args;
    }

    public function handle(ToolContext $context, array $args): ToolResult
    {
        // Check the ids the model sent, then again after defaults are filled.
        unset($args['company_id']);
        $this->scopedResolver->assertArgs($args, $this->scopedFields, $context->companyId);
        $args = $this->prepare($context, $args);
        $this->scopedResolver->assertArgs($args, $this->scopedFields, $context->companyId);

        $result = ToolResult::fromLegacy($this->actions->execute($this->name, $context->user, $context->companyId, $args));

        return $this->withReceipt($result);
    }

    /**
     * Add an "Open" link and, for creates, the call that undoes them.
     */
    private function withReceipt(ToolResult $result): ToolResult
    {
        $payload = $result->payload;

        return match ($this->name) {
            'crm.create_lead' => isset($payload['lead_id'])
                ? $result->withLink('/crm/leads/'.$payload['lead_id'])->withUndo('crm.delete_lead', ['lead_id' => (int) $payload['lead_id']], 'Delete this lead')
                : $result,
            'tasks.create' => isset($payload['task_id'])
                ? $result->withLink('/tasks')->withUndo('tasks.delete', ['task_id' => (int) $payload['task_id']], 'Delete this task')
                : $result,
            'kpis.create' => isset($payload['kpi_id'])
                ? $result->withLink('/dashboard')->withUndo('kpis.delete', ['kpi_id' => (int) $payload['kpi_id']], 'Delete this KPI')
                : $result,
            'projects.create' => isset($payload['project_id']) ? $result->withLink('/projects/'.$payload['project_id']) : $result,
            'crm.log_visit', 'crm.send_email' => isset($payload['lead_id']) ? $result->withLink('/crm/leads/'.$payload['lead_id']) : $result,
            default => $result,
        };
    }
}
