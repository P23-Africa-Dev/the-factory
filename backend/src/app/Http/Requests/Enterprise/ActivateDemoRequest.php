<?php

namespace App\Http\Requests\Enterprise;

use App\Enums\TeamSizeEnum;
use App\Enums\UserTypeEnum;
use App\Enums\WorkspacePurposeEnum;
use App\Support\CountryCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ActivateDemoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (! $this->has('country')) {
            return;
        }

        $resolved = CountryCatalog::resolveName((string) $this->input('country'));

        if ($resolved !== null) {
            $this->merge(['country' => $resolved]);
        }
    }

    public function rules(): array
    {
        return [
            'action' => ['nullable', 'string', Rule::in(['draft', 'activate'])],
            'full_name' => ['nullable', 'string', 'min:2', 'max:255'],
            'email' => ['nullable', 'string', 'email:rfc', 'max:255'],
            'company_name' => ['nullable', 'string', 'min:2', 'max:255'],
            'country' => ['nullable', 'string', 'min:2', 'max:100', Rule::in(array_values(CountryCatalog::names()))],
            'team_size' => ['nullable', 'string', Rule::in(TeamSizeEnum::values())],
            'purpose' => ['nullable', 'string', Rule::in(WorkspacePurposeEnum::values())],
            'user_type' => ['nullable', 'string', Rule::in(UserTypeEnum::values())],
            'admin_notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
