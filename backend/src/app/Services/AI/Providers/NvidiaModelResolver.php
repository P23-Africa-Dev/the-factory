<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

final class NvidiaModelResolver
{
    public function resolve(string $purpose = 'operational', ?string $requestedModel = null): string
    {
        $requestedModel = trim((string) ($requestedModel ?? ''));
        if ($requestedModel !== '' && ! $this->isAutoMode($requestedModel)) {
            return $requestedModel;
        }

        return match (strtolower(trim($purpose))) {
            'routing' => $this->configuredOrDefault(
                'services.ai.nvidia.routing_model',
                'nvidia/llama-3.1-nemotron-nano-8b-v1',
            ),
            'analyst', 'report' => $this->configuredOrDefault(
                'services.ai.nvidia.analyst_model',
                'nvidia/llama-3.1-nemotron-ultra-253b-v1',
            ),
            default => $this->configuredOrDefault(
                'services.ai.nvidia.exec_model',
                'nvidia/llama-3.3-nemotron-super-49b-v1.5',
            ),
        };
    }

    /**
     * @return array{routing: string, exec: string, analyst: string}
     */
    public function purposeModels(): array
    {
        return [
            'routing' => $this->resolve('routing'),
            'exec' => $this->resolve('operational'),
            'analyst' => $this->resolve('analyst'),
        ];
    }

    private function configuredOrDefault(string $configKey, string $default): string
    {
        $value = trim((string) config($configKey, $default));

        return $value !== '' && ! $this->isAutoMode($value) ? $value : $default;
    }

    private function isAutoMode(string $value): bool
    {
        return in_array(strtolower(trim($value)), ['auto', 'latest', ''], true);
    }
}
