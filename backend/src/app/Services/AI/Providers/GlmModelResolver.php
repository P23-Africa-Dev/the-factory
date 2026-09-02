<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

final class GlmModelResolver
{
    public function resolve(string $purpose = 'operational', ?string $requestedModel = null): string
    {
        $requestedModel = trim((string) ($requestedModel ?? ''));
        if ($requestedModel !== '' && ! $this->isAutoMode($requestedModel)) {
            return $requestedModel;
        }

        return match (strtolower(trim($purpose))) {
            'routing' => $this->configuredOrDefault(
                'services.ai.glm.routing_model',
                'glm-4-flash',
            ),
            'analyst', 'report' => $this->configuredOrDefault(
                'services.ai.glm.analyst_model',
                'glm-4-plus',
            ),
            default => $this->configuredOrDefault(
                'services.ai.glm.exec_model',
                'glm-4-air',
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
