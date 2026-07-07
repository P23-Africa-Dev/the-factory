<?php

declare(strict_types=1);

namespace App\Http\Requests\Task;

use App\Enums\TaskPriority;
use App\Enums\TaskType;
use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateTaskRequest extends FormRequest
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
            'title' => ['sometimes', 'string', 'min:3', 'max:255'],
            'type' => ['sometimes', 'nullable', 'string', Rule::in(TaskType::values())],
            'description' => ['sometimes', 'nullable', 'string', 'min:10', 'max:5000'],
            'location' => ['sometimes', 'nullable', 'string', 'min:2', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string', 'min:5', 'max:1000'],
            'latitude' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
            'due_date' => ['sometimes', 'nullable', 'date'],
            'required_actions' => ['sometimes', 'nullable', 'array', 'max:20'],
            'required_actions.*' => ['string', 'max:255'],
            'priority' => ['sometimes', 'nullable', 'string', Rule::in(TaskPriority::values())],
            'minimum_photos_required' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:20'],
            'visit_verification_required' => ['sometimes', 'nullable', 'boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->hasAny(['title', 'type', 'description', 'location', 'address', 'latitude', 'longitude', 'due_date', 'required_actions', 'priority', 'minimum_photos_required', 'visit_verification_required'])) {
                $validator->errors()->add('task', 'At least one updatable field is required.');
            }

            $latitude = $this->input('latitude');
            $longitude = $this->input('longitude');
            $hasLatitude = $latitude !== null && $latitude !== '';
            $hasLongitude = $longitude !== null && $longitude !== '';

            if ($this->has('latitude') xor $this->has('longitude')) {
                $validator->errors()->add('latitude', 'Latitude and longitude must be provided together.');
            }

            if ($this->boolean('visit_verification_required') && ! ($hasLatitude && $hasLongitude)) {
                $validator->errors()->add(
                    'visit_verification_required',
                    'Visit verification requires a task destination location.',
                );
            }
        });
    }
}
