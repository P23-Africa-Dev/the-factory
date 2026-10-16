<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\LeadFieldStatus;
use App\Enums\LeadFieldType;
use App\Models\LeadFieldDefinition;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LeadCustomFieldValues
{
    public const MAX_FIELDS = 50;

    public const MAX_OPTIONS = 100;

    /**
     * @var list<string>
     */
    private const RESERVED_KEYS = [
        'name',
        'email',
        'phone',
        'location',
        'company_name',
        'company_email',
        'website',
        'position',
        'profile_urls',
        'source',
        'status',
        'priority',
        'budget',
        'budget_amount',
        'budget_currency',
        'pipeline',
        'pipeline_id',
        'assigned_to',
        'assigned_to_user_id',
        'custom_fields',
        'meta',
    ];

    /**
     * @return Collection<string, LeadFieldDefinition>
     */
    public static function visibleDefinitions(int $companyId): Collection
    {
        return LeadFieldDefinition::query()
            ->where('company_id', $companyId)
            ->whereIn('status', [LeadFieldStatus::ACTIVE->value, LeadFieldStatus::PENDING->value])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->keyBy(fn (LeadFieldDefinition $field): string => $field->key);
    }

    public static function keyFromLabel(string $label): string
    {
        $key = Str::of($label)
            ->lower()
            ->replaceMatches('/[^a-z0-9]+/', '_')
            ->trim('_')
            ->toString();

        $key = trim($key, '_');
        if ($key === '' || preg_match('/^[0-9]/', $key) === 1) {
            $key = 'field_'.$key;
            $key = trim($key, '_');
        }

        if (in_array($key, self::RESERVED_KEYS, true)) {
            $key .= '_custom';
        }

        return substr($key, 0, 64);
    }

    /**
     * @return list<array{value:string,label:string}>|null
     */
    public static function normalizeOptions(string $type, mixed $options): ?array
    {
        $fieldType = LeadFieldType::tryFrom($type);
        if ($fieldType === null || ! $fieldType->usesOptions()) {
            return null;
        }

        if (! is_array($options) || $options === []) {
            throw ValidationException::withMessages([
                'options' => ['Select fields need at least one option.'],
            ]);
        }

        if (count($options) > self::MAX_OPTIONS) {
            throw ValidationException::withMessages([
                'options' => ['Select fields can have at most '.self::MAX_OPTIONS.' options.'],
            ]);
        }

        $normalized = [];
        $seen = [];

        foreach ($options as $option) {
            $label = '';
            $value = '';

            if (is_string($option)) {
                $label = trim($option);
                $value = self::keyFromLabel($label);
            } elseif (is_array($option)) {
                $label = trim((string) ($option['label'] ?? $option['value'] ?? ''));
                $value = trim((string) ($option['value'] ?? ''));
                if ($value === '') {
                    $value = self::keyFromLabel($label);
                }
                $value = substr(preg_replace('/[^a-z0-9_]+/', '_', strtolower($value)) ?? '', 0, 64);
                $value = trim($value, '_');
            }

            if ($label === '' || $value === '' || isset($seen[$value])) {
                continue;
            }

            $seen[$value] = true;
            $normalized[] = [
                'value' => $value,
                'label' => mb_substr($label, 0, 80),
            ];
        }

        if ($normalized === []) {
            throw ValidationException::withMessages([
                'options' => ['Select fields need at least one option.'],
            ]);
        }

        return $normalized;
    }

    /**
     * @param  Collection<string, LeadFieldDefinition>  $definitions
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $existing
     * @return array<string, mixed>
     */
    public static function normalize(Collection $definitions, array $input, array $existing, string $mode): array
    {
        $errors = [];
        $result = $mode === 'update' ? $existing : [];

        foreach ($input as $key => $raw) {
            if (! is_string($key) || $key === '') {
                $errors['custom_fields'][] = 'Custom field keys must be strings.';

                continue;
            }

            $definition = $definitions->get($key);
            if (! $definition instanceof LeadFieldDefinition) {
                $errors["custom_fields.{$key}"][] = 'This field is not available.';

                continue;
            }

            try {
                $normalized = self::normalizeValue($definition, $raw);
            } catch (\InvalidArgumentException $exception) {
                $errors["custom_fields.{$key}"][] = $exception->getMessage();

                continue;
            }

            if ($normalized === null) {
                if (
                    $mode === 'import'
                    && $definition->status === LeadFieldStatus::ACTIVE
                    && $definition->is_required
                ) {
                    $errors["custom_fields.{$key}"][] = "{$definition->label} is required.";
                }

                unset($result[$key]);

                continue;
            }

            $result[$key] = $normalized;
        }

        if ($mode === 'create' || $mode === 'update') {
            foreach ($definitions as $definition) {
                if ($definition->status !== LeadFieldStatus::ACTIVE || ! $definition->is_required) {
                    continue;
                }

                if (! self::isFilled($definition, $result[$definition->key] ?? null)) {
                    $errors["custom_fields.{$definition->key}"][] = "{$definition->label} is required.";
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return $result;
    }

    public static function exportValue(LeadFieldDefinition $definition, mixed $value): string
    {
        if ($value === null || $value === '' || $value === []) {
            return '';
        }

        $type = $definition->type instanceof LeadFieldType
            ? $definition->type
            : LeadFieldType::tryFrom((string) $definition->type);

        if ($type === LeadFieldType::CHECKBOX) {
            return self::isTruthy($value) ? 'Yes' : 'No';
        }

        $options = collect(is_array($definition->options) ? $definition->options : [])
            ->mapWithKeys(static function (mixed $option): array {
                if (! is_array($option)) {
                    return [];
                }

                $optionValue = (string) ($option['value'] ?? '');
                $label = (string) ($option['label'] ?? $optionValue);

                return $optionValue === '' ? [] : [$optionValue => $label];
            });

        if ($type === LeadFieldType::MULTI_SELECT && is_array($value)) {
            return collect($value)
                ->map(static fn (mixed $item): string => (string) ($options[(string) $item] ?? $item))
                ->implode(', ');
        }

        if ($type === LeadFieldType::SELECT) {
            return (string) ($options[(string) $value] ?? $value);
        }

        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }

        if (is_array($value)) {
            return implode(', ', array_map(static fn (mixed $item): string => (string) $item, $value));
        }

        return (string) $value;
    }

    /**
     * @throws \InvalidArgumentException
     */
    private static function normalizeValue(LeadFieldDefinition $definition, mixed $raw): mixed
    {
        $type = $definition->type instanceof LeadFieldType
            ? $definition->type
            : LeadFieldType::from((string) $definition->type);

        if ($raw === null) {
            return null;
        }

        return match ($type) {
            LeadFieldType::TEXT => self::normalizeText($raw, 255, $definition->label),
            LeadFieldType::TEXTAREA => self::normalizeText($raw, 5000, $definition->label),
            LeadFieldType::PHONE => self::normalizePhone($raw, $definition->label),
            LeadFieldType::NUMBER => self::normalizeNumber($raw, $definition->label),
            LeadFieldType::DATE => self::normalizeDate($raw, $definition->label),
            LeadFieldType::URL => self::normalizeUrl($raw, $definition->label),
            LeadFieldType::CHECKBOX => self::normalizeCheckbox($raw),
            LeadFieldType::SELECT => self::normalizeSelect($definition, $raw),
            LeadFieldType::MULTI_SELECT => self::normalizeMultiSelect($definition, $raw),
        };
    }

    /**
     * @throws \InvalidArgumentException
     */
    private static function normalizeText(mixed $raw, int $max, string $label): ?string
    {
        if (is_array($raw) || is_object($raw)) {
            throw new \InvalidArgumentException("{$label} must be text.");
        }

        $value = trim((string) $raw);
        if ($value === '') {
            return null;
        }

        if (mb_strlen($value) > $max) {
            throw new \InvalidArgumentException("{$label} must be {$max} characters or fewer.");
        }

        return $value;
    }

    /**
     * @throws \InvalidArgumentException
     */
    private static function normalizePhone(mixed $raw, string $label): ?string
    {
        $value = self::normalizeText($raw, 40, $label);
        if ($value === null) {
            return null;
        }

        if (preg_match('/^[\d\s\-\+\(\)\.]+$/', $value) !== 1) {
            throw new \InvalidArgumentException("{$label} must be a phone number.");
        }

        return $value;
    }

    /**
     * @throws \InvalidArgumentException
     */
    private static function normalizeNumber(mixed $raw, string $label): int|float|null
    {
        if (is_string($raw)) {
            $raw = trim($raw);
            if ($raw === '') {
                return null;
            }
            $raw = str_replace(',', '', $raw);
        }

        if (is_array($raw) || is_object($raw) || ! is_numeric($raw)) {
            throw new \InvalidArgumentException("{$label} must be a number.");
        }

        $number = (float) $raw;
        if (! is_finite($number)) {
            throw new \InvalidArgumentException("{$label} must be a number.");
        }

        if (floor($number) === $number && abs($number) < 1_000_000_000_000) {
            return (int) $number;
        }

        return $number;
    }

    /**
     * @throws \InvalidArgumentException
     */
    private static function normalizeDate(mixed $raw, string $label): ?string
    {
        if (is_string($raw)) {
            $raw = trim($raw);
        }

        if ($raw === null || $raw === '') {
            return null;
        }

        if (! is_string($raw) && ! is_numeric($raw)) {
            throw new \InvalidArgumentException("{$label} must be a date.");
        }

        try {
            return Carbon::parse((string) $raw)->toDateString();
        } catch (\Throwable) {
            throw new \InvalidArgumentException("{$label} must be a valid date.");
        }
    }

    /**
     * @throws \InvalidArgumentException
     */
    private static function normalizeUrl(mixed $raw, string $label): ?string
    {
        if (! is_string($raw) && ! is_numeric($raw)) {
            throw new \InvalidArgumentException("{$label} must be a URL.");
        }

        $trimmed = trim((string) $raw);
        if ($trimmed === '') {
            return null;
        }

        $normalized = LeadFieldNormalizer::normalizeWebsite($trimmed);
        if ($normalized === null) {
            throw new \InvalidArgumentException("{$label} must be a valid URL.");
        }

        return $normalized;
    }

    private static function normalizeCheckbox(mixed $raw): ?bool
    {
        if ($raw === null || $raw === '') {
            return null;
        }

        if (is_bool($raw)) {
            return $raw;
        }

        if (is_numeric($raw)) {
            return (int) $raw === 1;
        }

        $value = strtolower(trim((string) $raw));
        if (in_array($value, ['1', 'true', 'yes', 'y'], true)) {
            return true;
        }

        if (in_array($value, ['0', 'false', 'no', 'n'], true)) {
            return false;
        }

        throw new \InvalidArgumentException('Checkbox values must be yes or no.');
    }

    /**
     * @throws \InvalidArgumentException
     */
    private static function normalizeSelect(LeadFieldDefinition $definition, mixed $raw): ?string
    {
        if (is_array($raw)) {
            throw new \InvalidArgumentException("{$definition->label} accepts a single option.");
        }

        $value = trim((string) $raw);
        if ($value === '') {
            return null;
        }

        $match = self::matchOption($definition, $value);
        if ($match === null) {
            throw new \InvalidArgumentException("{$definition->label} must be one of the available options.");
        }

        return $match;
    }

    /**
     * @return list<string>|null
     *
     * @throws \InvalidArgumentException
     */
    private static function normalizeMultiSelect(LeadFieldDefinition $definition, mixed $raw): ?array
    {
        if (is_string($raw)) {
            $raw = trim($raw) === '' ? [] : array_map('trim', explode(',', $raw));
        }

        if (! is_array($raw)) {
            throw new \InvalidArgumentException("{$definition->label} must be a list of options.");
        }

        $selected = [];
        foreach ($raw as $item) {
            if (! is_string($item) && ! is_numeric($item)) {
                throw new \InvalidArgumentException("{$definition->label} must be a list of options.");
            }

            $value = trim((string) $item);
            if ($value === '') {
                continue;
            }

            $match = self::matchOption($definition, $value);
            if ($match === null) {
                throw new \InvalidArgumentException("{$definition->label} contains an option that is not available.");
            }

            $selected[$match] = $match;
        }

        if ($selected === []) {
            return null;
        }

        return array_values($selected);
    }

    private static function matchOption(LeadFieldDefinition $definition, string $raw): ?string
    {
        $needle = strtolower(trim($raw));

        foreach (is_array($definition->options) ? $definition->options : [] as $option) {
            if (! is_array($option)) {
                continue;
            }

            $value = (string) ($option['value'] ?? '');
            $label = (string) ($option['label'] ?? '');
            if ($needle === strtolower($value) || $needle === strtolower($label)) {
                return $value;
            }
        }

        return null;
    }

    private static function isFilled(LeadFieldDefinition $definition, mixed $value): bool
    {
        $type = $definition->type instanceof LeadFieldType
            ? $definition->type
            : LeadFieldType::tryFrom((string) $definition->type);

        if ($type === LeadFieldType::CHECKBOX) {
            return $value === true;
        }

        if ($value === null || $value === '' || $value === []) {
            return false;
        }

        return true;
    }

    private static function isTruthy(mixed $value): bool
    {
        return $value === true || $value === 1 || $value === '1' || $value === 'true' || $value === 'Yes';
    }
}
