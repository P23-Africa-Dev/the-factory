<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class ResetPasswordRequest extends FormRequest
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
            'token' => ['required', 'string', 'min:40'],
            'password' => ['required', 'string', Password::min(8)->letters()->numbers()],
            'password_confirmation' => ['required', 'string', 'same:password'],
            'portal' => ['nullable', 'string', 'in:management,agent'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.required' => 'Email address is required.',
            'email.email' => 'Email address must be valid.',
            'email.max' => 'Email address must not exceed :max characters.',
            'token.required' => 'Reset token is required.',
            'token.min' => 'Reset token is invalid.',
            'password.required' => 'Password is required.',
            'password.min' => 'Password must be at least :min characters.',
            'password.letters' => 'Password must contain at least one letter.',
            'password.numbers' => 'Password must contain at least one number.',
            'password_confirmation.required' => 'Password confirmation is required.',
            'password_confirmation.same' => 'Password confirmation does not match.',
            'portal.in' => 'Portal must be management or agent.',
        ];
    }
}
