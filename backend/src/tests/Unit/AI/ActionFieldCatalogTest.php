<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\ActionFieldCatalog;
use Tests\TestCase;

class ActionFieldCatalogTest extends TestCase
{
    public function test_catalog_covers_every_registered_write_action(): void
    {
        $registered = [
            'tasks.create',
            'tasks.reassign',
            'meetings.schedule',
            'notifications.send',
            'projects.create',
            'crm.log_visit',
            'crm.create_lead',
            'crm.send_email',
            'kpis.create',
            'org.users.create',
        ];

        $catalog = ActionFieldCatalog::all();

        foreach ($registered as $tool) {
            $this->assertArrayHasKey($tool, $catalog, "Missing catalog entry for {$tool}");
            $this->assertNotEmpty($catalog[$tool]['editable'], "{$tool} editable fields empty");
            $this->assertNotEmpty($catalog[$tool]['preview'], "{$tool} preview fields empty");
            $this->assertNotEmpty($catalog[$tool]['required'], "{$tool} required fields empty");
        }

        $this->assertContains('location', $catalog['tasks.create']['editable']);
        $this->assertContains('address', $catalog['tasks.create']['editable']);
        $this->assertContains('latitude', $catalog['tasks.create']['editable']);
        $this->assertContains('lead_id', $catalog['crm.log_visit']['editable']);
        $this->assertContains('to_user_id', $catalog['tasks.reassign']['editable']);
        $this->assertContains('project_id', $catalog['meetings.schedule']['preserve_hidden'] ?? []);
        $this->assertContains('user_ids', $catalog['notifications.send']['editable']);
        $this->assertContains('description', $catalog['projects.create']['editable']);
    }
}
