<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Models\CompanyCalendarConnection;
use App\Models\Meeting;
use App\Models\User;
use App\Models\UserCalendarConnection;
use Illuminate\Validation\ValidationException;

class CalendarConnectionResolver
{
    public function resolveForUser(User $user, ?int $companyId = null): ?object
    {
        $personal = UserCalendarConnection::query()
            ->where('company_id', $companyId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->first();

        if ($personal !== null) {
            return $personal;
        }

        return CompanyCalendarConnection::query()
            ->where('company_id', $companyId)
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->first();
    }

    public function resolveForMeeting(Meeting $meeting): ?object
    {
        if ($meeting->organizer_user_id !== null) {
            $personal = UserCalendarConnection::query()
                ->where('company_id', $meeting->company_id)
                ->where('user_id', $meeting->organizer_user_id)
                ->where('status', 'active')
                ->whereNull('disconnected_at')
                ->first();

            if ($personal !== null) {
                return $personal;
            }
        }

        return CompanyCalendarConnection::query()
            ->where('company_id', $meeting->company_id)
            ->where('status', 'active')
            ->whereNull('disconnected_at')
            ->first();
    }

    public function requireForUser(User $user, ?int $companyId = null): object
    {
        $connection = $this->resolveForUser($user, $companyId);

        if ($connection === null) {
            throw ValidationException::withMessages([
                'google_calendar' => ['Google Calendar has not been configured for this organization or your personal account. Please connect Google Calendar before scheduling meetings.'],
            ]);
        }

        return $connection;
    }
}
