<?php

declare(strict_types=1);

namespace App\Http\Requests\Internal;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class CompleteInternalOnboardingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'invitation_id' => ['required', 'integer', 'exists:internal_user_invitations,id'],
            'token' => ['required', 'string', 'size:64'],
            'phone_number' => ['nullable', 'string', 'regex:/^\+[1-9][0-9]{7,14}$/'],
            'gender' => ['nullable', 'string', 'in:male,female'],
            'avatar_key' => ['nullable', 'string', 'max:50'],
            'avatar_file' => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp,svg', 'max:5120'],
            'password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()->symbols()],
        ];
    }
}
