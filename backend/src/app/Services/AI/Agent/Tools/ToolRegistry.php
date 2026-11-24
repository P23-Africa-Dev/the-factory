<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools;

use App\Services\AI\Agent\Chat\ToolSpec;

/**
 * Single source of truth for the tools ELY can use. Built from
 * ElyToolCatalog plus any classes tagged 'ely.tools' in the container.
 * Generates the model's tool list, role filtering and risk lookups.
 */
final class ToolRegistry
{
    /** @var array<string, ElyTool> */
    private array $tools = [];

    /**
     * @param  iterable<ElyTool>  $tools
     */
    public function __construct(iterable $tools)
    {
        foreach ($tools as $tool) {
            $this->tools[$tool->name()] = $tool;
        }
    }

    public function get(string $name): ?ElyTool
    {
        return $this->tools[$name] ?? null;
    }

    /**
     * @return array<string, ElyTool>
     */
    public function all(): array
    {
        return $this->tools;
    }

    /**
     * Tools offered to the model for this role, minus any disabled by the
     * platform (config ely.agent.disabled_tools).
     *
     * @return array<int, ElyTool>
     */
    public function availableFor(string $role): array
    {
        $disabled = (array) config('ely.agent.disabled_tools', []);

        return array_values(array_filter(
            $this->tools,
            static fn (ElyTool $tool): bool => $tool->allowedFor($role) && ! in_array($tool->name(), $disabled, true),
        ));
    }

    /**
     * @return array<int, ToolSpec>
     */
    public function specsFor(string $role): array
    {
        return array_map(
            static fn (ElyTool $tool): ToolSpec => new ToolSpec($tool->name(), $tool->description(), $tool->inputSchema()),
            $this->availableFor($role),
        );
    }
}
