<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools;

/**
 * One ELY capability. Adding a capability = one class implementing this, one
 * entry in ElyToolCatalog (or a container tag), a help article and eval cases.
 *
 * Handlers must call the existing domain services, which hold the real
 * authorization checks. allowedFor() is only a coarse pre-filter that decides
 * which tools the model is offered.
 */
interface ElyTool
{
    /** Canonical dotted name, e.g. "crm.create_lead". */
    public function name(): string;

    /** Written for the model: what it does, when to use it, key rules. */
    public function description(): string;

    /**
     * JSON Schema (type object) for the arguments.
     *
     * @return array<string, mixed>
     */
    public function inputSchema(): array;

    public function kind(): ToolKind;

    /**
     * Risk for this call. May depend on the arguments (e.g. a meeting with
     * external attendees needs confirmation, an internal one does not).
     *
     * @param  array<string, mixed>  $args
     */
    public function risk(array $args, ToolContext $context): ToolRisk;

    public function allowedFor(string $role): bool;

    /** Short progress label shown while it runs, e.g. "Looking up leads". */
    public function statusLabel(): string;

    /**
     * Fields shown on the confirmation card, in order.
     *
     * @return array<int, string>
     */
    public function previewFields(): array;

    /**
     * @param  array<string, mixed>  $args
     */
    public function handle(ToolContext $context, array $args): ToolResult;
}
