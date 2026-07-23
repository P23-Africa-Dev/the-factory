<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\CopilotProcessingLabels;
use PHPUnit\Framework\TestCase;

final class CopilotProcessingLabelsTest extends TestCase
{
    public function test_default_labels_include_late_engagement_fillers(): void
    {
        $labels = CopilotProcessingLabels::forMessage('Hello ELY');

        $this->assertSame('Thinking...', $labels[0]);
        $this->assertContains('Analyzing your request...', $labels);
        $this->assertContains('Almost there...', $labels);
        $this->assertContains('Preparing response...', $labels);
        $this->assertGreaterThanOrEqual(5, count($labels));
    }

    public function test_tasks_list_tool_gets_contextual_prefix(): void
    {
        $labels = CopilotProcessingLabels::forMessage('show tasks', [
            'type' => 'tool',
            'tool' => 'tasks.list',
        ]);

        $this->assertContains('Looking up tasks...', $labels);
        $this->assertContains('Just a little more...', $labels);
    }

    public function test_message_heuristics_detect_task_list_phrasing(): void
    {
        $labels = CopilotProcessingLabels::forMessage('Give me the list of tasks created by Agent John');

        $this->assertContains('Looking up tasks...', $labels);
        $this->assertNotContains('Preparing task...', $labels);
    }
}
