<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools\Legacy;

use App\Services\AI\Agent\Tools\ElyTool;
use App\Services\AI\Agent\Tools\ScopedResolver;
use App\Services\AI\Agent\Tools\ToolContext;
use App\Services\AI\Agent\Tools\ToolKind;
use App\Services\AI\Agent\Tools\ToolResult;
use App\Services\AI\Agent\Tools\ToolRisk;
use App\Services\AI\Policy\ToolPolicyService;
use App\Services\AI\Tools\ReadToolRegistry;

/**
 * Exposes one of the existing ReadToolRegistry tools as an ElyTool.
 */
final class LegacyReadTool implements ElyTool
{
    /**
     * @param  array<string, mixed>  $schema
     * @param  array<string, string>  $scopedFields
     */
    public function __construct(
        private readonly string $name,
        private readonly string $description,
        private readonly array $schema,
        private readonly string $statusLabel,
        private readonly bool $untrusted,
        private readonly array $scopedFields,
        private readonly ReadToolRegistry $reads,
        private readonly ToolPolicyService $policy,
        private readonly ScopedResolver $scopedResolver,
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
        return ToolKind::Read;
    }

    public function risk(array $args, ToolContext $context): ToolRisk
    {
        return ToolRisk::Safe;
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
        return [];
    }

    public function handle(ToolContext $context, array $args): ToolResult
    {
        unset($args['company_id']);
        // The user's location and focus from the chat (sent with "plan my day").
        if ($this->name === 'planning.daily' && is_array($context->page['planning'] ?? null)) {
            $args = [...$context->page['planning'], ...$args];
        }
        $this->scopedResolver->assertArgs($args, $this->scopedFields, $context->companyId);

        $result = $this->reads->execute($this->name, $context->user, $context->companyId, $args);

        return ToolResult::fromLegacy($result, $this->untrusted);
    }
}
