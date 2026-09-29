<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Models\RecordDisclosure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ExportRecordsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $rules = [
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            'company_id' => ['nullable', 'integer'],
            'person' => ['nullable', 'string', 'max:255'],
            'slice' => ['nullable', 'string', 'max:40'],
            'user_id' => ['nullable', 'integer'],
            'requester_type' => ['required', 'string', Rule::in(RecordDisclosure::REQUESTER_TYPES)],
            'reference' => ['nullable', 'string', 'max:191'],
            'note' => ['required', 'string', 'min:3', 'max:2000'],
        ];

        if ($this->routeIs('admin.records.person.export')) {
            $rules['user_id'] = ['required', 'integer', 'exists:users,id'];
        }

        return $rules;
    }
}
