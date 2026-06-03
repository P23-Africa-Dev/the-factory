<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class ForgotPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => [
                'required',
                'email:rfc',
                'lowercase',
                'max:255',
            ],
            'portal' => ['nullable', 'string', 'in:management,agent'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'Email address is required.',
            'email.email' => 'Email address must be valid.',
            'email.max' => 'Email address must not exceed :max characters.',
            'portal.in' => 'Portal must be management or agent.',
        ];
    }
}
