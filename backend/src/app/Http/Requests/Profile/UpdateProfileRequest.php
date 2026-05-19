<?php

declare(strict_types=1);

namespace App\Http\Requests\Profile;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class UpdateProfileRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $country = $this->input('country');
        $payload = [
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
        ];

        if ($this->has('country')) {
            $payload['country'] = is_string($country) ? strtoupper(trim($country)) : $country;
        }

        $this->merge($payload);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'name' => ['sometimes', 'string', 'max:255'],
            'phone_number' => ['sometimes', 'nullable', 'string', 'regex:/^\+[1-9][0-9]{7,14}$/'],
            'gender' => ['sometimes', 'nullable', 'string', 'in:male,female'],
            'country' => ['sometimes', 'string', 'size:2', 'alpha'],

            // Immutable profile fields.
            'email' => ['prohibited'],
            'internal_role' => ['prohibited'],
            'role' => ['prohibited'],
            'user_type' => ['prohibited'],
            'membership_role' => ['prohibited'],
        ];
    }
}
