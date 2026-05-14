<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class SuspendUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'suspend_type'  => ['required', 'in:duration,date'],
            'suspend_days'  => ['required_if:suspend_type,duration', 'nullable', 'integer', 'min:1', 'max:365'],
            'suspend_until' => ['required_if:suspend_type,date', 'nullable', 'date', 'after:today'],
        ];
    }

    public function messages(): array
    {
        return [
            'suspend_days.required_if'  => 'Please enter a suspension duration in days.',
            'suspend_days.min'          => 'Suspension must be at least 1 day.',
            'suspend_days.max'          => 'Suspension cannot exceed 365 days.',
            'suspend_until.required_if' => 'Please select a suspension end date.',
            'suspend_until.after'       => 'Suspension end date must be in the future.',
        ];
    }
}
