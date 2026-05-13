<?php

declare(strict_types=1);

namespace App\Http\Requests\Task;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class RecordTaskLocationRequest extends FormRequest
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
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'accuracy_meters' => ['nullable', 'numeric', 'min:0', 'max:10000'],
            'recorded_at' => ['nullable', 'date'],
            'speed_mps' => ['nullable', 'numeric', 'min:0', 'max:300'],
            'heading_degrees' => ['nullable', 'numeric', 'between:0,360'],
            'points' => ['nullable', 'array'],
            'points.*.latitude' => ['required_with:points', 'numeric', 'between:-90,90'],
            'points.*.longitude' => ['required_with:points', 'numeric', 'between:-180,180'],
            'points.*.accuracy_meters' => ['nullable', 'numeric', 'min:0', 'max:10000'],
            'points.*.recorded_at' => ['nullable', 'date'],
            'points.*.speed_mps' => ['nullable', 'numeric', 'min:0', 'max:300'],
            'points.*.heading_degrees' => ['nullable', 'numeric', 'between:0,360'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $points = $this->input('points');
            $hasPoints = is_array($points) && count($points) > 0;
            $hasSinglePoint = $this->filled('latitude') && $this->filled('longitude');

            if (! $hasPoints && ! $hasSinglePoint) {
                $validator->errors()->add('location', 'Either a single location payload or points[] batch is required.');
            }

            if ($hasPoints && $hasSinglePoint) {
                $validator->errors()->add('location', 'Provide either single location fields or points[] batch, not both.');
            }
        });
    }
}
