<?php

namespace App\Http\Requests\Enterprise;

use Illuminate\Foundation\Http\FormRequest;

class VerifyCompanyIdRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'request_id' => ['required', 'integer', 'exists:company_demo_requests,id'],
            'token' => ['required', 'string', 'min:20', 'max:255'],
            'company_id' => ['required', 'string', 'max:32'],
        ];
    }
}
