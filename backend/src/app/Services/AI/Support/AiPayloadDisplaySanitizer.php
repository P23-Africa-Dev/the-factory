<?php

declare(strict_types=1);

namespace App\Services\AI\Support;

final class AiPayloadDisplaySanitizer
{
    /**
     * @var array<string, string>
     */
    private const ID_NAME_FIELD_PAIRS = [
        'assigned_agent_id' => 'assigned_agent_name',
        'assigned_to_user_id' => 'assigned_to_name',
        'agent_id' => 'agent_name',
        'project_id' => 'project_name',
        'lead_id' => 'lead_name',
        'user_id' => 'user_name',
        'created_by_user_id' => 'created_by_name',
    ];

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function sanitize(array $payload): array
    {
        return $this->sanitizeValue($payload);
    }

    private function sanitizeValue(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        if (array_is_list($value)) {
            return array_map(fn (mixed $item): mixed => $this->sanitizeValue($item), $value);
        }

        $result = [];
        foreach ($value as $key => $item) {
            $result[$key] = $this->sanitizeValue($item);
        }

        foreach (self::ID_NAME_FIELD_PAIRS as $idField => $nameField) {
            if (! array_key_exists($idField, $result)) {
                continue;
            }

            $name = $result[$nameField] ?? null;
            if (is_string($name) && trim($name) !== '') {
                unset($result[$idField]);
            }
        }

        return $result;
    }
}
