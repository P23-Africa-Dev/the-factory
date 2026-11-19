<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools;

use Closure;
use Illuminate\Support\Facades\Validator;

/**
 * An ElyTool described with data plus a handler closure, for tools that are a
 * thin call into one domain service. The handler receives arguments that have
 * already been validated with $rules and checked against the company with
 * ScopedResolver; the service still makes the real permission decision.
 */
final class DefinedTool implements ElyTool
{
    /**
     * @param  array<string, mixed>  $schema
     * @param  array<int, string>  $roles
     * @param  array<string, string>  $scoped  field => ScopedResolver kind
     * @param  array<string, mixed>  $rules  Laravel validation rules
     * @param  Closure(ToolContext, array<string, mixed>): ToolResult  $handler
     * @param  array<int, string>  $preview
     */
    public function __construct(
        private readonly string $name,
        private readonly string $description,
        private readonly array $schema,
        private readonly ToolKind $kind,
        private readonly ToolRisk $risk,
        private readonly array $roles,
        private readonly string $label,
        private readonly array $scoped,
        private readonly array $rules,
        private readonly Closure $handler,
        private readonly ScopedResolver $scopedResolver,
        private readonly array $preview = [],
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
        return $this->kind;
    }

    public function risk(array $args, ToolContext $context): ToolRisk
    {
        return $this->risk;
    }

    public function allowedFor(string $role): bool
    {
        return in_array($role, $this->roles, true);
    }

    public function statusLabel(): string
    {
        return $this->label;
    }

    public function previewFields(): array
    {
        if ($this->preview !== []) {
            return $this->preview;
        }

        return array_keys((array) ($this->schema['properties'] ?? []));
    }

    public function handle(ToolContext $context, array $args): ToolResult
    {
        unset($args['company_id']);
        $this->scopedResolver->assertArgs($args, $this->scoped, $context->companyId);
        $validated = $this->rules === [] ? $args : Validator::make($args, $this->rules)->validate();

        return ($this->handler)($context, $validated);
    }
}
