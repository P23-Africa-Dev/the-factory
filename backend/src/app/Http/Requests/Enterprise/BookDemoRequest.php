<?php

namespace App\Http\Requests\Enterprise;

use App\Enums\TeamSizeEnum;
use App\Support\CountryCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class BookDemoRequest extends FormRequest
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
            'full_name' => ['required', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'string', 'email:rfc', 'max:255'],
            'phone' => ['required', 'string', 'regex:/^\+[1-9][0-9]{7,14}$/'],
            'company_name' => ['required', 'string', 'min:2', 'max:255'],
            'country' => ['required', 'string', 'min:2', 'max:100', Rule::in(array_values(CountryCatalog::names()))],
            'team_size' => ['required', 'string', Rule::in(TeamSizeEnum::values())],
            'use_case' => ['required', 'string', 'min:10', 'max:5000'],
        ];
    }
}
