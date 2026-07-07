<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Support;

use App\Services\AI\Support\AiPayloadDisplaySanitizer;
use Tests\TestCase;

final class AiPayloadDisplaySanitizerTest extends TestCase
{
    public function test_it_removes_id_fields_when_a_display_name_is_available(): void
    {
        $sanitizer = new AiPayloadDisplaySanitizer();

        $result = $sanitizer->sanitize([
            'items' => [
                [
                    'id' => 10,
                    'title' => 'Visit Lekki',
                    'assigned_agent_id' => 38,
                    'assigned_agent_name' => 'Tunde Ade',
                    'project_id' => 4,
                    'project_name' => 'Lagos rollout',
                ],
            ],
        ]);

        $item = $result['items'][0];
        $this->assertSame('Tunde Ade', $item['assigned_agent_name']);
        $this->assertArrayNotHasKey('assigned_agent_id', $item);
        $this->assertArrayNotHasKey('project_id', $item);
        $this->assertSame('Lagos rollout', $item['project_name']);
        $this->assertSame(10, $item['id']);
    }

    public function test_it_keeps_id_fields_when_no_display_name_exists(): void
    {
        $sanitizer = new AiPayloadDisplaySanitizer();

        $result = $sanitizer->sanitize([
            'assigned_agent_id' => 38,
        ]);

        $this->assertSame(38, $result['assigned_agent_id']);
    }
}
