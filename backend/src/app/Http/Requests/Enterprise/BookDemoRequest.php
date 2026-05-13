<?php

namespace App\Http\Requests\Enterprise;

use App\Enums\TeamSizeEnum;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class BookDemoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'full_name' => ['required', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'string', 'email:rfc', 'max:255'],
            'company_name' => ['required', 'string', 'min:2', 'max:255'],
            'country' => ['required', 'string', 'size:2', 'regex:/^[A-Za-z]{2}$/'],
            'team_size' => ['required', 'string', Rule::in(TeamSizeEnum::values())],
            'use_case' => ['required', 'string', 'min:10', 'max:5000'],
        ];
    }
}
