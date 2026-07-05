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
        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ]);
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
