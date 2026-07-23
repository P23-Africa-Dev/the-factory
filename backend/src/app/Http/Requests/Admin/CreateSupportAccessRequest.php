<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Models\SupportAccessSession;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateSupportAccessRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth('admin')->user()?->canAccessAbility('impersonate_users') === true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'access_level' => [
                'required',
                Rule::in([
                    SupportAccessSession::ACCESS_READ_ONLY,
                    SupportAccessSession::ACCESS_OPERATIONAL_FULL,
                ]),
            ],
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
            'ticket_reference' => ['nullable', 'string', 'max:191'],
            'admin_password' => ['required', 'string', 'max:255'],
        ];
    }
}
