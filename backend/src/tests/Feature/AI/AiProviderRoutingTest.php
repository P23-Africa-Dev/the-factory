<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Services\AI\Providers\AiProviderRouter;
use Tests\TestCase;

final class AiProviderRoutingTest extends TestCase
{
    public function test_router_returns_null_when_no_keys_are_configured(): void
    {
        config()->set('services.ai.provider', 'openai');
        config()->set('services.ai.fallback_provider', 'claude');
        config()->set('services.ai.openai.api_key', '');
        config()->set('services.ai.claude.api_key', '');

        $router = app(AiProviderRouter::class);

        $result = $router->generateText('You are helpful.', 'Summarize this text.');

        $this->assertNull($result);
    }
}
