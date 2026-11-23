<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Models\AppNotification;
use App\Support\AgentNotificationDeepLink;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AgentNotificationDeepLinkTest extends TestCase
{
    #[DataProvider('urlProvider')]
    public function test_resolves_agent_deep_links(?string $input, string $expected): void
    {
        $this->assertSame($expected, AgentNotificationDeepLink::resolve($input));
    }

    public static function urlProvider(): array
    {
        return [
            'task detail' => ['/tasks/42', '/task/42'],
            'agent-prefixed task' => ['/agent/tasks/7', '/task/7'],
            'field activity inbox' => ['/agent/field-activity?inbox=1', '/field-activity?inbox=1'],
            'attendance' => ['/agent/operations/attendance', '/'],
            'map query' => ['/map?taskId=9', '/map?taskId=9'],
            'dashboard' => ['/dashboard', '/'],
            'lead' => ['/crm/leads/3', '/crm/leads/3'],
            'empty' => ['', '/'],
            'null' => [null, '/'],
        ];
    }

    public function test_click_context_forwards_source_identifiers_as_strings(): void
    {
        $notification = new AppNotification([
            'type' => 'meeting.updated',
            'action_url' => '/dashboard',
            'action_route' => 'dashboard',
            'reference_type' => 'App\Models\Meeting',
            'reference_id' => 17,
            'metadata' => ['meeting_id' => 17, 'lead_id' => '0', 'task_id' => 'abc'],
        ]);

        $this->assertSame([
            'raw_action_url' => '/dashboard',
            'action_route' => 'dashboard',
            'reference_type' => 'App\Models\Meeting',
            'reference_id' => '17',
            'task_id' => '',
            'lead_id' => '',
            'meeting_id' => '17',
        ], AgentNotificationDeepLink::clickContext($notification));
    }
}
