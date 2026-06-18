<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\Calendar\UserTimezoneResolver;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class MeetingInferenceService
{
    private const DEFAULT_REMINDER_OFFSETS = [15, 60];

    public function __construct(
        private readonly AiProviderRouter $aiProviderRouter,
        private readonly UserTimezoneResolver $userTimezoneResolver,
    ) {}

    /**
     * @param array<string,string> $entities
     * @return array<string,mixed>
     */
    public function infer(
        string $message,
        int $companyId,
        array $entities = [],
        string $conversationSummary = '',
        ?string $clientTimezone = null,
        ?string $companyCountry = null,
    ): array {
        $normalized = trim($message);
        $members = $this->companyMembers($companyId);
        $timezone = $this->userTimezoneResolver->resolve($clientTimezone, $companyCountry);
        $generated = $this->generateTitleAndDescription($normalized, $conversationSummary);
        $schedule = $this->resolveSchedule($normalized, $timezone);
        $attendeeResolution = $this->resolveAttendees($normalized, $members, $entities, $conversationSummary);
        $reminders = $this->defaultReminders();

        return [
            'title' => $generated['title'],
            'description' => $generated['description'],
            'timezone' => $timezone,
            'start_at' => $schedule['start_at'],
            'end_at' => $schedule['end_at'],
            'location' => $this->resolveLocation($normalized),
            'attendees' => $attendeeResolution['attendees'],
            'reminders' => $reminders,
            '__inference' => [
                'used_default_title' => $generated['used_default_title'],
                'used_default_time' => $schedule['used_default_time'],
                'unresolved_attendee_names' => $attendeeResolution['unresolved_names'],
                'fuzzy_matched_attendees' => $attendeeResolution['fuzzy_matched'],
            ],
        ];
    }

    /**
     * @param array<string,mixed> $actionArgs
     * @return array<string,mixed>
     */
    public function normalizeProvidedArgs(
        string $message,
        int $companyId,
        array $actionArgs,
        ?string $clientTimezone = null,
        ?string $companyCountry = null,
    ): array {
        $normalized = $actionArgs;
        $members = $this->companyMembers($companyId);
        $resolvedTimezone = $this->userTimezoneResolver->resolve($clientTimezone, $companyCountry);

        if (is_string($normalized['title'] ?? null)) {
            $title = Str::limit(trim((string) $normalized['title']), 255, '');
            if ($title !== '') {
                $normalized['title'] = $title;
            }
        }

        if (is_string($normalized['description'] ?? null)) {
            $normalized['description'] = Str::limit(trim((string) $normalized['description']), 5000, '');
        }

        if (is_string($normalized['location'] ?? null)) {
            $normalized['location'] = Str::limit(trim((string) $normalized['location']), 255, '');
        }

        if (is_string($normalized['timezone'] ?? null)) {
            $timezone = $this->userTimezoneResolver->normalizeTimezone((string) $normalized['timezone']);
            $normalized['timezone'] = $timezone ?? $resolvedTimezone;
        } else {
            $normalized['timezone'] = $resolvedTimezone;
        }

        if (is_string($normalized['start_at'] ?? null)) {
            $start = $this->parseDateTime((string) $normalized['start_at']);
            if ($start !== null) {
                $normalized['start_at'] = $start->toDateTimeString();
            }
        }

        if (is_string($normalized['end_at'] ?? null)) {
            $end = $this->parseDateTime((string) $normalized['end_at']);
            if ($end !== null) {
                $normalized['end_at'] = $end->toDateTimeString();
            }
        }

        if (is_array($normalized['attendees'] ?? null)) {
            $normalized['attendees'] = $this->normalizeAttendees($normalized['attendees'], $members);
        }

        if (is_array($normalized['reminders'] ?? null)) {
            $normalized['reminders'] = $this->normalizeReminders($normalized['reminders']);
        }

        if (($normalized['attendees'] ?? []) === [] && $message !== '') {
            $attendeeResolution = $this->resolveAttendees($message, $members, [], '');
            if ($attendeeResolution['attendees'] !== []) {
                $normalized['attendees'] = $attendeeResolution['attendees'];
            }
        }

        return $normalized;
    }

    /**
     * @param array<string,mixed> $args
     * @return array<int,string>
     */
    public function warningCodes(array $args): array
    {
        $codes = [];
        $inference = is_array($args['__inference'] ?? null) ? $args['__inference'] : [];

        if (($inference['used_default_title'] ?? false) === true) {
            $codes[] = 'used_default_title';
        }

        if (($inference['used_default_time'] ?? false) === true) {
            $codes[] = 'used_default_time';
        }

        $unresolved = is_array($inference['unresolved_attendee_names'] ?? null)
            ? $inference['unresolved_attendee_names']
            : [];
        if ($unresolved !== []) {
            $codes[] = 'attendee_unresolved';
        }

        if ($this->hasInvalidAttendeeEmails($args)) {
            $codes[] = 'invalid_attendee_email';
        }

        return $codes;
    }

    /**
     * @param array<string,mixed> $args
     */
    public function buildPreviewSummary(array $args, array $warnings = [], bool $blocking = false): string
    {
        $title = (string) ($args['title'] ?? 'Untitled Meeting');
        $start = (string) ($args['start_at'] ?? 'Not set');
        $timezone = (string) ($args['timezone'] ?? $this->userTimezoneResolver->resolve());
        $attendeeCount = is_array($args['attendees'] ?? null) ? count($args['attendees']) : 0;
        $reminderCount = is_array($args['reminders'] ?? null) ? count($args['reminders']) : 0;

        $base = sprintf(
            'ELY prepared a meeting: "%s" starting %s (%s) with %d attendee(s) and %d reminder(s). Review the details below, then click Confirm Action.',
            $title,
            $start,
            $timezone,
            $attendeeCount,
            $reminderCount,
        );

        if ($warnings !== []) {
            $base .= ' Notes: ' . implode(' ', array_map(static fn(string $w): string => '[' . $w . ']', $warnings));
        }

        if ($blocking) {
            $base .= ' Confirmation is blocked until required fields are corrected.';
        }

        return $base;
    }

    /**
     * @return array{title:string,description:string,used_default_title:bool}
     */
    private function generateTitleAndDescription(string $message, string $conversationSummary): array
    {
        $providerJson = $this->aiProviderRouter->generateText(
            systemPrompt: 'You are ELY, the Factory23 AI Assistant. Generate meeting metadata from user requests. Respond ONLY with valid JSON: {"title":"...","description":"..."}. Title must be professional (max 120 chars). Description must be 1-2 sentences about meeting purpose and outcomes (max 500 chars). Never copy the raw user message as the description.',
            userPrompt: trim("Conversation context:\n{$conversationSummary}\n\nUser request:\n{$message}"),
            options: [
                'max_tokens' => 280,
                'temperature' => 0.3,
            ],
        );

        if (is_string($providerJson)) {
            $decoded = $this->decodeJsonObject($providerJson);
            if ($decoded !== null) {
                $title = Str::limit(trim((string) ($decoded['title'] ?? '')), 255, '');
                $description = Str::limit(trim((string) ($decoded['description'] ?? '')), 5000, '');

                if ($title !== '' && $description !== '' && strtolower($description) !== strtolower($title)) {
                    return [
                        'title' => $title,
                        'description' => $description,
                        'used_default_title' => false,
                    ];
                }
            }
        }

        return $this->heuristicTitleAndDescription($message);
    }

    /**
     * @return array{title:string,description:string,used_default_title:bool}
     */
    private function heuristicTitleAndDescription(string $message): array
    {
        $normalized = trim($message);
        $lower = strtolower($normalized);

        $title = 'Operations Meeting';
        if (str_contains($lower, 'sales') && (str_contains($lower, 'q1') || str_contains($lower, 'q2') || str_contains($lower, 'q3') || str_contains($lower, 'q4'))) {
            $quarter = null;
            foreach (['q1', 'q2', 'q3', 'q4'] as $q) {
                if (str_contains($lower, $q)) {
                    $quarter = strtoupper($q);
                    break;
                }
            }
            $title = $quarter !== null ? "{$quarter} Sales Performance Review Meeting" : 'Sales Performance Review Meeting';
        } elseif (str_contains($lower, 'project review') || str_contains($lower, 'project sync')) {
            $title = 'Project Review Meeting';
        } elseif (str_contains($lower, 'standup') || str_contains($lower, 'stand-up')) {
            $title = 'Team Standup Meeting';
        } elseif (str_contains($lower, 'follow-up') || str_contains($lower, 'follow up')) {
            $title = 'Follow-up Meeting';
        } elseif (preg_match('/\bschedule\s+(?:a\s+|an\s+)?(.{8,80}?)(?:\s+(?:with|for|on|at|tomorrow|today|next)\b)/i', $normalized, $m) === 1) {
            $title = Str::title(trim((string) $m[1])) . ' Meeting';
        }

        $description = sprintf(
            'This meeting will address the topics discussed in the request: %s. Participants will review progress, align on next steps, and confirm action items.',
            Str::limit($normalized, 180, '…'),
        );

        return [
            'title' => Str::limit($title, 255, ''),
            'description' => Str::limit($description, 5000, ''),
            'used_default_title' => $title === 'Operations Meeting',
        ];
    }

    /**
     * @return array{start_at:string,end_at:string,used_default_time:bool}
     */
    private function resolveSchedule(string $message, string $timezone): array
    {
        $now = Carbon::now($timezone);
        $usedDefault = true;
        $start = $now->copy()->addDay()->setTime(10, 0, 0);
        $end = $start->copy()->addHour();

        if (preg_match('/\b(tomorrow|today|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i', $message, $dayMatch) === 1) {
            $start = $this->resolveDayToken(trim((string) $dayMatch[1]), $now);
            $usedDefault = false;
        }

        if (preg_match('/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i', $message, $timeMatch) === 1) {
            $hour = (int) $timeMatch[1];
            $minute = isset($timeMatch[2]) && $timeMatch[2] !== '' ? (int) $timeMatch[2] : 0;
            $meridiem = strtolower((string) ($timeMatch[3] ?? ''));

            if ($meridiem === 'pm' && $hour < 12) {
                $hour += 12;
            } elseif ($meridiem === 'am' && $hour === 12) {
                $hour = 0;
            } elseif ($meridiem === '' && $hour <= 7) {
                $hour += 12;
            }

            $start->setTime($hour, $minute, 0);
            $usedDefault = false;
        }

        if (preg_match('/\bfor\s+(\d{1,2})\s*(?:hour|hours|hr|hrs)\b/i', $message, $durationMatch) === 1) {
            $end = $start->copy()->addHours(max(1, (int) $durationMatch[1]));
        } else {
            $end = $start->copy()->addHour();
        }

        return [
            'start_at' => $start->toDateTimeString(),
            'end_at' => $end->toDateTimeString(),
            'used_default_time' => $usedDefault,
        ];
    }

    private function resolveDayToken(string $token, Carbon $now): Carbon
    {
        $lower = strtolower($token);

        if ($lower === 'today') {
            return $now->copy()->setTime(10, 0, 0);
        }

        if ($lower === 'tomorrow') {
            return $now->copy()->addDay()->setTime(10, 0, 0);
        }

        if (str_starts_with($lower, 'next ')) {
            $day = trim(substr($lower, 5));
            $target = $now->copy()->next($day)->setTime(10, 0, 0);
            if ($target->lessThanOrEqualTo($now)) {
                $target->addWeek();
            }

            return $target;
        }

        return $now->copy()->addDay()->setTime(10, 0, 0);
    }

    private function resolveLocation(string $message): string
    {
        if (preg_match('/\b(?:at|in)\s+([A-Z][A-Za-z0-9\s\-]{2,60})(?:\s+(?:tomorrow|today|at|on|with)\b|[\.,!?]|$)/', $message, $m) === 1) {
            $candidate = trim((string) $m[1]);
            if (! preg_match('/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i', $candidate)) {
                return Str::limit($candidate, 255, '');
            }
        }

        return 'Google Meet';
    }

    /**
     * @param Collection<int,User> $members
     * @param array<string,string> $entities
     * @return array{attendees:array<int,array<string,mixed>>,unresolved_names:array<int,string>,fuzzy_matched:array<int,string>}
     */
    private function resolveAttendees(
        string $message,
        Collection $members,
        array $entities,
        string $conversationSummary,
    ): array {
        $emails = $this->extractEmails($message);
        $nameTokens = $this->extractNameTokens($message);
        $contextTokens = $this->extractContextNameTokens($entities, $conversationSummary);
        $nameTokens = array_values(array_unique([...$nameTokens, ...$contextTokens]));

        $attendees = [];
        $unresolved = [];
        $fuzzyMatched = [];
        $seenEmails = [];

        foreach ($emails as $email) {
            $lower = strtolower($email);
            if (isset($seenEmails[$lower])) {
                continue;
            }

            $member = $members->first(static fn(User $user): bool => strtolower((string) $user->email) === $lower);
            $attendees[] = [
                'email' => $lower,
                'display_name' => $member?->name,
                'user_id' => $member?->id,
            ];
            $seenEmails[$lower] = true;
        }

        foreach ($nameTokens as $token) {
            if (filter_var($token, FILTER_VALIDATE_EMAIL)) {
                continue;
            }

            $match = $this->fuzzyMatchMember($token, $members);
            if ($match === null) {
                $unresolved[] = $token;
                continue;
            }

            $email = strtolower((string) $match->email);
            if (isset($seenEmails[$email])) {
                continue;
            }

            $attendees[] = [
                'email' => $email,
                'display_name' => (string) $match->name,
                'user_id' => (int) $match->id,
            ];
            $seenEmails[$email] = true;

            if (! $this->isExactNameMatch($token, (string) $match->name)) {
                $fuzzyMatched[] = $token . '→' . $match->name;
            }
        }

        return [
            'attendees' => $attendees,
            'unresolved_names' => $unresolved,
            'fuzzy_matched' => $fuzzyMatched,
        ];
    }

    /**
     * @return array<int,string>
     */
    private function extractEmails(string $message): array
    {
        preg_match_all('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', $message, $matches);

        return array_values(array_unique(array_map('strtolower', $matches[0] ?? [])));
    }

    /**
     * @return array<int,string>
     */
    private function extractNameTokens(string $message): array
    {
        $tokens = [];

        if (preg_match('/\bwith\s+(.+?)(?:\s+(?:tomorrow|today|next|at|on|to|for)\b|[\.,!?]|$)/i', $message, $m) === 1) {
            $segment = (string) $m[1];
            $parts = preg_split('/\s*(?:,|&|\band\b)\s*/i', $segment) ?: [];
            foreach ($parts as $part) {
                $clean = trim(preg_replace('/\b(the|team|sales team|project manager)\b/i', '', $part) ?? '');
                if ($clean !== '' && strlen($clean) >= 2) {
                    $tokens[] = $clean;
                }
            }
        }

        if (preg_match_all('/\b(?:invite|include|add)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/', $message, $inviteMatches) > 0) {
            foreach ($inviteMatches[1] as $name) {
                $tokens[] = trim((string) $name);
            }
        }

        return array_values(array_unique($tokens));
    }

    /**
     * @param array<string,string> $entities
     * @return array<int,string>
     */
    private function extractContextNameTokens(array $entities, string $conversationSummary): array
    {
        $tokens = [];

        if (is_string($entities['agent'] ?? null) && trim((string) $entities['agent']) !== '') {
            $tokens[] = trim((string) $entities['agent']);
        }

        if (preg_match_all('/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/', $conversationSummary, $matches) > 0) {
            foreach ($matches[1] as $name) {
                $tokens[] = trim((string) $name);
            }
        }

        return array_values(array_unique($tokens));
    }

    /**
     * @param Collection<int,User> $members
     */
    private function fuzzyMatchMember(string $token, Collection $members): ?User
    {
        $needle = strtolower(trim($token));
        if ($needle === '') {
            return null;
        }

        $best = null;
        $bestScore = PHP_INT_MAX;

        foreach ($members as $member) {
            $name = strtolower((string) $member->name);
            $firstName = strtolower((string) Str::of($member->name)->before(' '));

            if ($needle === $name || $needle === $firstName) {
                return $member;
            }

            $distance = min(
                levenshtein($needle, $firstName),
                levenshtein($needle, $name),
            );

            $threshold = strlen($needle) >= 4 ? 2 : 1;
            if ($distance <= $threshold && $distance < $bestScore) {
                $best = $member;
                $bestScore = $distance;
            }
        }

        return $best;
    }

    private function isExactNameMatch(string $token, string $memberName): bool
    {
        $needle = strtolower(trim($token));
        $name = strtolower(trim($memberName));
        $firstName = strtolower((string) Str::of($memberName)->before(' '));

        return $needle === $name || $needle === $firstName;
    }

    /**
     * @return array<int,array{offset_minutes:int}>
     */
    private function defaultReminders(): array
    {
        return array_map(
            static fn(int $offset): array => ['offset_minutes' => $offset],
            self::DEFAULT_REMINDER_OFFSETS,
        );
    }

    /**
     * @return Collection<int,User>
     */
    private function companyMembers(int $companyId): Collection
    {
        return User::query()
            ->select(['users.id', 'users.name', 'users.email'])
            ->whereHas('companies', static fn($q) => $q->where('companies.id', $companyId))
            ->orderBy('users.name')
            ->get();
    }

    /**
     * @param array<int,mixed> $attendees
     * @param Collection<int,User> $members
     * @return array<int,array<string,mixed>>
     */
    private function normalizeAttendees(array $attendees, Collection $members): array
    {
        $normalized = [];
        $seen = [];

        foreach ($attendees as $attendee) {
            if (! is_array($attendee)) {
                continue;
            }

            $email = strtolower(trim((string) ($attendee['email'] ?? '')));
            if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                continue;
            }

            if (isset($seen[$email])) {
                continue;
            }

            $userId = isset($attendee['user_id']) && is_numeric($attendee['user_id'])
                ? (int) $attendee['user_id']
                : null;

            if ($userId === null) {
                $member = $members->first(static fn(User $user): bool => strtolower((string) $user->email) === $email);
                $userId = $member?->id;
            }

            $normalized[] = array_filter([
                'email' => $email,
                'display_name' => is_string($attendee['display_name'] ?? null)
                    ? Str::limit(trim((string) $attendee['display_name']), 255, '')
                    : null,
                'user_id' => $userId,
                'is_optional' => isset($attendee['is_optional']) ? (bool) $attendee['is_optional'] : null,
            ], static fn(mixed $value): bool => $value !== null);

            $seen[$email] = true;
        }

        return $normalized;
    }

    /**
     * @param array<int,mixed> $reminders
     * @return array<int,array<string,mixed>>
     */
    private function normalizeReminders(array $reminders): array
    {
        $normalized = [];

        foreach ($reminders as $reminder) {
            if (! is_array($reminder)) {
                continue;
            }

            if (isset($reminder['offset_minutes']) && is_numeric($reminder['offset_minutes'])) {
                $normalized[] = ['offset_minutes' => max(1, (int) $reminder['offset_minutes'])];
                continue;
            }

            if (isset($reminder['remind_at']) && is_string($reminder['remind_at'])) {
                $parsed = $this->parseDateTime($reminder['remind_at']);
                if ($parsed !== null) {
                    $normalized[] = ['remind_at' => $parsed->toIso8601String()];
                }
            }
        }

        return $normalized;
    }

    /**
     * @param array<string,mixed> $args
     */
    private function hasInvalidAttendeeEmails(array $args): bool
    {
        if (! is_array($args['attendees'] ?? null)) {
            return false;
        }

        foreach ($args['attendees'] as $attendee) {
            if (! is_array($attendee)) {
                return true;
            }

            $email = trim((string) ($attendee['email'] ?? ''));
            if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return true;
            }
        }

        return false;
    }

    private function parseDateTime(string $value): ?Carbon
    {
        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @return array<string,mixed>|null
     */
    private function decodeJsonObject(string $raw): ?array
    {
        $trimmed = trim($raw);
        if (preg_match('/\{.*\}/s', $trimmed, $match) === 1) {
            $trimmed = (string) $match[0];
        }

        $decoded = json_decode($trimmed, true);

        return is_array($decoded) ? $decoded : null;
    }
}
