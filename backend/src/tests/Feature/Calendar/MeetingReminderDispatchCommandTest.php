<?php

declare(strict_types=1);

namespace Tests\Feature\Calendar;

use App\Jobs\SendMeetingReminderEmailJob;
use App\Models\Company;
use App\Models\Meeting;
use App\Models\MeetingReminder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class MeetingReminderDispatchCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_dispatch_command_requeues_stale_queued_reminders(): void
    {
        config()->set('meetings.reminders.stale_queue_minutes', 10);

        $company = Company::create([
            'company_id' => 'FAC-REM001',
            'name' => 'Reminder Company',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['email_verified_at' => now()]);

        $meeting = Meeting::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'title' => 'Reminder Retry Meeting',
            'timezone' => 'Africa/Lagos',
            'start_at' => now()->addHours(2),
            'end_at' => now()->addHours(3),
            'status' => 'scheduled',
            'source_page' => 'api',
            'sync_status' => 'pending_setup',
        ]);

        $staleReminder = MeetingReminder::create([
            'meeting_id' => $meeting->id,
            'recipient_email' => 'attendee@factory23.test',
            'recipient_name' => 'Attendee',
            'offset_minutes' => 15,
            'remind_at' => now()->subMinutes(1),
            'status' => 'queued',
            'queued_at' => now()->subMinutes(20),
            'dedupe_key' => sha1('stale-reminder'),
        ]);

        Queue::fake();

        $this->artisan('meetings:dispatch-reminders')->assertExitCode(0);

        $staleReminder->refresh();

        $this->assertSame('queued', $staleReminder->status);
        $this->assertNotNull($staleReminder->queued_at);
        $this->assertTrue($staleReminder->queued_at?->greaterThan(now()->subMinutes(2)) ?? false);

        Queue::assertPushed(SendMeetingReminderEmailJob::class, function (SendMeetingReminderEmailJob $job) use ($staleReminder): bool {
            return $job->reminderId === (int) $staleReminder->id;
        });
    }
}
