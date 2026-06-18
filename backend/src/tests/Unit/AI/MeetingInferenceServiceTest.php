<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Models\Company;
use App\Models\User;
use App\Services\AI\MeetingInferenceService;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
use Tests\TestCase;

final class MeetingInferenceServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_infer_parses_day_of_month_time_duration_and_reminders(): void
    {
        [$company] = $this->seedMembers();

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter->shouldReceive('generateText')->once()->andReturn(null);
        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $service = $this->app->make(MeetingInferenceService::class);
        $result = $service->infer(
            message: 'Meeting is 12pm on the 20th of this month, 2hrs duration, add ndaniju@gmail.com, reminder a day before and an hour before.',
            companyId: (int) $company->id,
            clientTimezone: 'Europe/London',
        );

        $this->assertSame('Europe/London', $result['timezone']);
        $this->assertFalse($result['__inference']['used_default_time']);
        $this->assertContains('ndaniju@gmail.com', collect($result['attendees'])->pluck('email')->all());

        $offsets = collect($result['reminders'])->pluck('offset_minutes')->all();
        $this->assertContains(1440, $offsets);
        $this->assertContains(60, $offsets);
    }

    public function test_infer_generates_distinct_title_and_description_for_sales_review_prompt(): void
    {
        [$company, $david, $sarah] = $this->seedMembers();

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter->shouldReceive('generateText')->once()->andReturn(null);
        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $service = $this->app->make(MeetingInferenceService::class);
        $result = $service->infer(
            message: 'Schedule a project review meeting with David and Sarah tomorrow at 2 PM.',
            companyId: (int) $company->id,
            clientTimezone: 'Europe/London',
        );

        $this->assertSame('Project Review Meeting', $result['title']);
        $this->assertNotSame($result['title'], $result['description']);
        $this->assertSame('Europe/London', $result['timezone']);
        $this->assertCount(2, $result['attendees']);
        $this->assertContains($david->email, collect($result['attendees'])->pluck('email')->all());
        $this->assertContains($sarah->email, collect($result['attendees'])->pluck('email')->all());
        $this->assertNotEmpty($result['reminders']);
    }

    public function test_infer_uses_company_country_when_client_timezone_missing(): void
    {
        [$company] = $this->seedMembers();
        $company->country = 'NG';
        $company->save();

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter->shouldReceive('generateText')->once()->andReturn(null);
        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $service = $this->app->make(MeetingInferenceService::class);
        $result = $service->infer(
            message: 'Schedule a team sync tomorrow at 10 AM.',
            companyId: (int) $company->id,
            companyCountry: 'NG',
        );

        $this->assertSame('Africa/Lagos', $result['timezone']);
    }

    public function test_infer_fuzzy_matches_misspelled_attendee_names(): void
    {
        [$company, $david] = $this->seedMembers();

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter->shouldReceive('generateText')->once()->andReturn(null);
        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $service = $this->app->make(MeetingInferenceService::class);
        $result = $service->infer(
            message: 'Schedule a meeting with Davd tomorrow at 2 PM.',
            companyId: (int) $company->id,
        );

        $emails = collect($result['attendees'])->pluck('email')->all();
        $this->assertContains($david->email, $emails);
        $this->assertContains('Davd→David Test', $result['__inference']['fuzzy_matched_attendees']);
    }

    public function test_normalize_provided_args_deduplicates_attendees_and_preserves_reminders(): void
    {
        [$company, $david] = $this->seedMembers();

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $service = $this->app->make(MeetingInferenceService::class);
        $normalized = $service->normalizeProvidedArgs(
            message: '',
            companyId: (int) $company->id,
            actionArgs: [
                'title' => 'Quarterly Review',
                'description' => 'Review quarterly targets and blockers.',
                'timezone' => 'Europe/London',
                'start_at' => now()->addDay()->setTime(14, 0)->toDateTimeString(),
                'end_at' => now()->addDay()->setTime(15, 0)->toDateTimeString(),
                'attendees' => [
                    ['email' => $david->email, 'display_name' => 'David Test', 'user_id' => $david->id],
                    ['email' => $david->email, 'display_name' => 'Duplicate'],
                    ['email' => 'client@example.com'],
                ],
                'reminders' => [
                    ['offset_minutes' => 30],
                    ['offset_minutes' => 60],
                ],
            ],
        );

        $this->assertCount(2, $normalized['attendees']);
        $this->assertCount(2, $normalized['reminders']);
        $this->assertSame('Europe/London', $normalized['timezone']);
    }

    public function test_warning_codes_include_invalid_attendee_email(): void
    {
        $service = $this->app->make(MeetingInferenceService::class);

        $codes = $service->warningCodes([
            'attendees' => [
                ['email' => 'not-an-email'],
            ],
        ]);

        $this->assertContains('invalid_attendee_email', $codes);
    }

    /**
     * @return array{0: Company, 1: User, 2?: User}
     */
    private function seedMembers(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory ' . Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $david = User::factory()->createOne(['name' => 'David Test', 'email' => 'david@factory23.test']);
        $sarah = User::factory()->createOne(['name' => 'Sarah Test', 'email' => 'sarah@factory23.test']);

        foreach ([$david, $sarah] as $member) {
            $company->users()->attach($member->id, ['role' => 'agent']);
        }

        return [$company, $david, $sarah];
    }
}
