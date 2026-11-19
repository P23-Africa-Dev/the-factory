<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Services\AI\Agent\Eval\ElyEvalFixture;
use App\Services\AI\Agent\Eval\ElyEvalRunner;
use App\Services\AI\Agent\Help\HelpLibrary;
use App\Services\AI\Agent\Tools\ToolKind;
use App\Services\AI\Agent\Tools\ToolRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Deterministic checks that keep the ELY tool set, eval cases and help
 * articles in step. Runs in CI without calling any model.
 */
final class ElyEvalCasesTest extends TestCase
{
    use RefreshDatabase;

    public function test_eval_cases_are_valid_and_cover_every_write_tool(): void
    {
        $cases = ElyEvalRunner::loadCases();

        $this->assertGreaterThanOrEqual(100, count($cases));
        $this->assertSame([], app(ElyEvalRunner::class)->lint($cases));
    }

    public function test_every_write_tool_has_a_help_article(): void
    {
        $documented = app(HelpLibrary::class)->documentedTools();
        $undocumented = [];

        foreach (app(ToolRegistry::class)->all() as $name => $tool) {
            if ($tool->kind() === ToolKind::Write && ! in_array($name, $documented, true)) {
                $undocumented[] = $name;
            }
        }

        $this->assertSame([], $undocumented);
    }

    public function test_every_tool_schema_is_a_valid_object_schema(): void
    {
        foreach (app(ToolRegistry::class)->all() as $name => $tool) {
            $schema = $tool->inputSchema();
            $this->assertSame('object', $schema['type'] ?? null, "{$name} schema type");
            $this->assertArrayHasKey('properties', $schema, "{$name} schema properties");
            $this->assertNotFalse(json_encode($schema), "{$name} schema encodes");
            $this->assertMatchesRegularExpression('/^[a-z_]+(\.[a-z_]+)+$/', $name);
            $this->assertNotSame('', trim($tool->description()), "{$name} description");

            foreach ((array) ($schema['required'] ?? []) as $field) {
                $this->assertArrayHasKey($field, (array) $schema['properties'], "{$name} requires unknown field {$field}");
            }
        }
    }

    public function test_help_search_finds_the_right_article(): void
    {
        $help = app(HelpLibrary::class);

        $this->assertSame('crm-import-export', $help->search('How do I import leads from Excel?', 'agent')[0]['slug'] ?? null);
        $this->assertSame('team-hiring', $help->search('invite a new supervisor', 'admin')[0]['slug'] ?? null);
        // role filter: agents do not get the hiring article
        $this->assertNotContains('team-hiring', array_column($help->search('invite a new supervisor', 'agent'), 'slug'));
    }

    public function test_eval_fixture_seeds_and_cases_can_be_filled(): void
    {
        $seed = app(ElyEvalFixture::class)->seed();

        $this->assertSame('Eval Foods Ltd', $seed['company']->name);
        $this->assertNotSame($seed['company']->id, $seed['foreign_lead']->company_id);
        $this->assertSame((int) $seed['users']['supervisor']->id, (int) $seed['users']['agent']->supervisor_user_id);
    }
}
