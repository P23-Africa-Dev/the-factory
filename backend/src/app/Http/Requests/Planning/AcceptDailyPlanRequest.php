<?php

declare(strict_types=1);

namespace App\Http\Requests\Planning;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class AcceptDailyPlanRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $items = $this->input('items');
        $normalizedItems = is_array($items)
            ? array_map(fn (mixed $item): mixed => $this->normalizePlanItem($item), $items)
            : $items;

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'items' => $normalizedItems,
        ]);
    }

    /**
     * @return array<string, mixed>|mixed
     */
    private function normalizePlanItem(mixed $item): mixed
    {
        if (! is_array($item)) {
            return $item;
        }

        foreach (['title', 'type', 'description', 'location', 'priority', 'dedupe_key'] as $field) {
            if (array_key_exists($field, $item) && is_string($item[$field]) && trim($item[$field]) === '') {
                $item[$field] = null;
            }
        }

        if (array_key_exists('creates_task', $item)) {
            $item['creates_task'] = filter_var($item['creates_task'], FILTER_VALIDATE_BOOLEAN);
        }

        return $item;
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'plan_date' => ['required', 'date'],
            'items' => ['required', 'array', 'min:1', 'max:20'],
            'items.*.creates_task' => ['required', 'boolean'],
            'items.*.dedupe_key' => ['nullable', 'string', 'max:128'],
            'items.*.linked_task_id' => ['nullable', 'integer'],
            'items.*.title' => ['required', 'string', 'min:3', 'max:255'],
            'items.*.type' => ['nullable', 'string'],
            'items.*.description' => ['nullable', 'string', 'max:5000'],
            'items.*.due_date' => ['nullable', 'date'],
            'items.*.priority' => ['nullable', 'string'],
            'items.*.location' => ['nullable', 'string', 'max:255'],
            'items.*.latitude' => ['nullable', 'numeric'],
            'items.*.longitude' => ['nullable', 'numeric'],
        ];
    }
}
