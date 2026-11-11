<?php

declare(strict_types=1);

namespace App\Http\Requests\Task;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use Illuminate\Foundation\Http\FormRequest;

class StoreTaskSubtaskRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $title = $this->input('title');

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            'title' => is_string($title) ? trim($title) : $title,
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
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'assigned_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
        ];
    }
}
