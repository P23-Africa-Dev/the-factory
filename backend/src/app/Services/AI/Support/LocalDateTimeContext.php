<?php

declare(strict_types=1);

namespace App\Services\AI\Support;

use App\Services\Calendar\UserTimezoneResolver;
use Illuminate\Support\Carbon;

final class LocalDateTimeContext
{
    public function __construct(
        private readonly UserTimezoneResolver $timezoneResolver,
    ) {}

    public function resolveTimezone(?string $clientTimezone, ?string $companyCountry): string
    {
        return $this->timezoneResolver->resolve($clientTimezone, $companyCountry);
    }

    public function now(string $timezone): Carbon
    {
        return Carbon::now($timezone);
    }

    public function promptLine(string $timezone): string
    {
        $now = $this->now($timezone);

        return sprintf(
            'Current local date and time for this user: %s (%s).',
            $now->format('l, F j, Y g:i A'),
            $timezone,
        );
    }

    public function looksLikeDateTimeQuestion(string $message): bool
    {
        $normalized = strtolower(trim($message));

        if ($normalized === '') {
            return false;
        }

        return preg_match(
            '/\b(?:'
            . 'what\s+(?:day|date|time)\s+(?:is\s+)?(?:it|today)'
            . '|what\s+is\s+today(?:\'s)?\s+(?:date|day)'
            . '|today\'?s\s+date'
            . '|current\s+(?:date|time|date\s+and\s+time)'
            . '|what\s+time\s+is\s+it'
            . '|date\s+and\s+time'
            . ')\b/i',
            $normalized,
        ) === 1;
    }

    public function answer(string $timezone, ?string $companyName = null): string
    {
        $now = $this->now($timezone);
        $dateLine = sprintf('Today is %s.', $now->format('l, F j, Y'));
        $timeLine = sprintf('The current local time is %s (%s).', $now->format('g:i A'), $timezone);

        $company = is_string($companyName) ? trim($companyName) : '';
        if ($company !== '') {
            return $dateLine . ' ' . $timeLine . ' How can I assist you further with ' . $company . '?';
        }

        return $dateLine . ' ' . $timeLine;
    }
}
