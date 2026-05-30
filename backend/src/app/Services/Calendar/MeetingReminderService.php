<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Models\Meeting;
use App\Models\MeetingReminder;
use Carbon\Carbon;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;

class MeetingReminderService
{
    /**
     * @param  array<int,array<string,mixed>>|null  $reminders
     */
    public function syncForMeeting(Meeting $meeting, ?array $reminders): void
    {
        $meeting->loadMissing('attendees');

        MeetingReminder::query()
            ->where('meeting_id', $meeting->id)
            ->whereIn('status', ['pending', 'queued', 'failed'])
            ->update([
                'status' => 'cancelled',
                'last_error' => 'Reminder schedule recalculated.',
                'updated_at' => now(),
            ]);

        $normalizedReminders = $this->normalizeReminderConfig($meeting, $reminders ?? []);

        if ($normalizedReminders === []) {
            $meeting->update(['reminder_config' => []]);
            return;
        }

        $attendees = $meeting->attendees
            ->map(static fn($attendee): array => [
                'user_id' => $attendee->user_id,
                'email' => strtolower(trim((string) $attendee->email)),
                'name' => $attendee->display_name,
            ])
            ->filter(static fn(array $attendee): bool => $attendee['email'] !== '')
            ->unique('email')
            ->values();

        foreach ($normalizedReminders as $index => $reminder) {
            foreach ($attendees as $attendee) {
                $dedupeKey = sha1(implode('|', [
                    (string) $meeting->id,
                    (string) $attendee['email'],
                    (string) $reminder['remind_at'],
                    (string) $index,
                ]));

                MeetingReminder::query()->updateOrCreate(
                    ['dedupe_key' => $dedupeKey],
                    [
                        'meeting_id' => $meeting->id,
                        'recipient_user_id' => $attendee['user_id'],
                        'recipient_email' => $attendee['email'],
                        'recipient_name' => $attendee['name'],
                        'offset_minutes' => $reminder['offset_minutes'],
                        'custom_remind_at' => $reminder['custom_remind_at'],
                        'remind_at' => $reminder['remind_at'],
                        'status' => 'pending',
                        'attempts' => 0,
                        'last_attempt_at' => null,
                        'next_retry_at' => null,
                        'queued_at' => null,
                        'sent_at' => null,
                        'last_error' => null,
                    ]
                );
            }
        }

        $meeting->update(['reminder_config' => $normalizedReminders]);

        Log::info('Meeting reminders synchronized.', [
            'meeting_id' => $meeting->id,
            'reminder_count' => count($normalizedReminders),
            'attendee_count' => $attendees->count(),
        ]);
    }

    public function cancelForMeeting(Meeting $meeting, string $reason = 'Meeting cancelled.'): void
    {
        MeetingReminder::query()
            ->where('meeting_id', $meeting->id)
            ->whereIn('status', ['pending', 'queued', 'failed'])
            ->update([
                'status' => 'cancelled',
                'last_error' => $reason,
                'updated_at' => now(),
            ]);
    }

    public function deleteForMeeting(Meeting $meeting): void
    {
        MeetingReminder::query()->where('meeting_id', $meeting->id)->delete();
    }

    /**
     * @param  array<int,array<string,mixed>>  $reminders
     * @return array<int,array<string,mixed>>
     */
    private function normalizeReminderConfig(Meeting $meeting, array $reminders): array
    {
        $normalized = [];

        foreach ($reminders as $reminder) {
            if (! is_array($reminder)) {
                continue;
            }

            $offsetMinutes = Arr::get($reminder, 'offset_minutes');
            $customRemindAtRaw = trim((string) Arr::get($reminder, 'remind_at', ''));

            $offset = is_numeric($offsetMinutes) ? max(1, (int) $offsetMinutes) : null;
            $customRemindAt = $customRemindAtRaw !== '' ? Carbon::parse($customRemindAtRaw) : null;

            $remindAt = $offset !== null
                ? $meeting->start_at?->copy()->subMinutes($offset)
                : $customRemindAt;

            if ($remindAt === null || ! $remindAt->isFuture()) {
                continue;
            }

            $normalized[] = [
                'offset_minutes' => $offset,
                'custom_remind_at' => $customRemindAt?->toIso8601String(),
                'remind_at' => $remindAt->toIso8601String(),
                'label' => $offset !== null ? $this->offsetLabel($offset) : 'Custom',
            ];
        }

        return array_values($normalized);
    }

    private function offsetLabel(int $offsetMinutes): string
    {
        if ($offsetMinutes < 60) {
            return $offsetMinutes . ' minutes before';
        }

        if ($offsetMinutes < 1440) {
            return ((int) floor($offsetMinutes / 60)) . ' hours before';
        }

        return ((int) floor($offsetMinutes / 1440)) . ' days before';
    }
}
