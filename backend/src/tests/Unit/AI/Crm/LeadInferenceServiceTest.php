<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Crm;

use App\Services\AI\Crm\LeadInferenceService;
use App\Services\AI\Providers\AiProviderRouter;
use Mockery;
use Tests\TestCase;

final class LeadInferenceServiceTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_infer_extracts_structured_lead_fields_from_message(): void
    {
        $router = Mockery::mock(AiProviderRouter::class);
        $router->shouldNotReceive('generateForPurpose');
        $this->app->instance(AiProviderRouter::class, $router);

        $service = app(LeadInferenceService::class);
        $result = $service->infer(
            message: 'Business Name: Delta Power LTD. Phone Number: 08012345678. Location: Lekki Ajah, Lagos.',
            companyId: 1,
            userId: 9,
            role: 'admin',
        );

        $this->assertSame('Delta Power LTD', $result['name']);
        $this->assertSame('08012345678', $result['phone']);
        $this->assertSame('Lekki Ajah, Lagos', $result['location']);
    }
}
