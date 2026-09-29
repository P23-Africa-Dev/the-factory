<?php

declare(strict_types=1);

namespace App\Services\Records;

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

final class RecordFilters
{
    public function __construct(
        public readonly Carbon $from,
        public readonly Carbon $to,
        public readonly ?int $companyId,
        public readonly ?string $person,
        public readonly ?string $slice,
        public readonly ?int $userId,
    ) {}

    public static function fromRequest(Request $request): self
    {
        $validated = Validator::make($request->query(), [
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'company_id' => ['nullable', 'integer'],
            'person' => ['nullable', 'string', 'max:255'],
            'slice' => ['nullable', 'string', 'max:40'],
            'user_id' => ['nullable', 'integer'],
        ])->validate();

        return self::fromArray($validated);
    }

    /**
     * @param  array<string, mixed>  $input
     */
    public static function fromArray(array $input): self
    {
        $from = isset($input['from']) && $input['from'] !== ''
            ? Carbon::parse((string) $input['from'])->startOfDay()
            : now()->subDays(30)->startOfDay();
        $to = isset($input['to']) && $input['to'] !== ''
            ? Carbon::parse((string) $input['to'])->endOfDay()
            : now()->endOfDay();

        if ($from->greaterThan($to)) {
            throw ValidationException::withMessages([
                'from' => 'The start date must be on or before the end date.',
            ]);
        }

        $person = trim((string) ($input['person'] ?? ''));
        $slice = trim((string) ($input['slice'] ?? ''));
        $companyId = isset($input['company_id']) && $input['company_id'] !== '' && $input['company_id'] !== null
            ? (int) $input['company_id']
            : null;
        $userId = isset($input['user_id']) && $input['user_id'] !== '' && $input['user_id'] !== null
            ? (int) $input['user_id']
            : null;

        return new self(
            from: $from,
            to: $to,
            companyId: $companyId,
            person: $person !== '' ? $person : null,
            slice: $slice !== '' ? $slice : null,
            userId: $userId,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'from' => $this->from->toDateString(),
            'to' => $this->to->toDateString(),
            'company_id' => $this->companyId,
            'person' => $this->person,
            'slice' => $this->slice,
            'user_id' => $this->userId,
        ];
    }

    public function sliceOr(string $default): string
    {
        return $this->slice !== null && $this->slice !== '' ? $this->slice : $default;
    }
}
