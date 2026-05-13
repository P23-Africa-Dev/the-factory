<?php

namespace App\Http\Requests\Enterprise;

use App\Enums\TeamSizeEnum;
use App\Enums\UserTypeEnum;
use App\Enums\WorkspacePurposeEnum;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ActivateDemoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'action' => ['nullable', 'string', Rule::in(['draft', 'activate'])],
            'full_name' => ['nullable', 'string', 'min:2', 'max:255'],
            'email' => ['nullable', 'string', 'email:rfc', 'max:255'],
            'company_name' => ['nullable', 'string', 'min:2', 'max:255'],
            'country' => ['nullable', 'string', 'size:2', 'regex:/^[A-Za-z]{2}$/'],
            'team_size' => ['nullable', 'string', Rule::in(TeamSizeEnum::values())],
            'purpose' => ['nullable', 'string', Rule::in(WorkspacePurposeEnum::values())],
            'user_type' => ['nullable', 'string', Rule::in(UserTypeEnum::values())],
            'admin_notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
