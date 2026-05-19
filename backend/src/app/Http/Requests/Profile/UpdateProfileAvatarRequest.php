<?php

declare(strict_types=1);

namespace App\Http\Requests\Profile;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateProfileAvatarRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $gender = $this->input('gender');

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'gender' => is_string($gender) ? strtolower(trim($gender)) : $gender,
        ]);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'avatar_key' => ['sometimes', 'nullable', 'string', 'max:120'],
            'avatar_file' => ['sometimes', 'file', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
            'gender' => ['sometimes', 'nullable', 'string', 'in:male,female'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $hasAvatarKey = $this->filled('avatar_key');
            $hasAvatarFile = $this->hasFile('avatar_file');

            if (! $hasAvatarKey && ! $hasAvatarFile) {
                $validator->errors()->add('avatar', 'Provide either avatar_key or avatar_file.');

                return;
            }

            if ($hasAvatarKey && $hasAvatarFile) {
                $validator->errors()->add('avatar', 'Use either avatar_key or avatar_file, not both.');
            }
        });
    }
}
