<?php

namespace App\Http\Requests\Onboarding;

use App\Enums\TeamSizeEnum;
use App\Enums\UserTypeEnum;
use App\Enums\WorkspacePurposeEnum;
use App\Support\CountryCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateWorkspaceRequest extends FormRequest
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

        $code = CountryCatalog::resolveCode((string) $this->input('country'));

        if ($code !== null) {
            $this->merge(['country' => $code]);
        }
    }

    public function rules(): array
    {
        return [
            'company_name' => ['required', 'string', 'min:2', 'max:255'],
            'country' => ['required', 'string', 'size:2', 'regex:/^[A-Z]{2}$/'],
            'team_size' => ['required', 'string', Rule::in(TeamSizeEnum::values())],
            'purpose' => ['required', 'string', Rule::in(WorkspacePurposeEnum::values())],
            'user_type' => ['required', 'string', Rule::in(UserTypeEnum::values())],
        ];
    }

    public function messages(): array
    {
        return [
            'company_name.required' => 'Company or workspace name is required.',
            'company_name.min' => 'Name must be at least 2 characters.',
            'company_name.max' => 'Name must not exceed 255 characters.',
            'country.required' => 'Country is required.',
            'country.size' => 'Please select a valid country.',
            'country.regex' => 'Please select a valid country.',
            'team_size.required' => 'Team size is required.',
            'team_size.in' => 'Please select a valid team size option.',
            'purpose.required' => 'Please tell us what you are using this for.',
            'purpose.in' => 'Please select a valid purpose.',
            'user_type.required' => 'Please tell us what best describes you.',
            'user_type.in' => 'Please select a valid role.',
        ];
    }
}
