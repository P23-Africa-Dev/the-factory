<?php

declare(strict_types=1);

namespace App\Http\Requests\Task;

use App\Http\Requests\Concerns\ResolvesCompanyContextId;
use App\Services\Task\TaskCommentService;
use Illuminate\Foundation\Http\FormRequest;

class StoreTaskCommentRequest extends FormRequest
{
    use ResolvesCompanyContextId;

    protected function prepareForValidation(): void
    {
        $body = $this->input('body');

        $this->merge([
            'company_id' => $this->resolveCompanyContextId($this->input('company_id')),
            // Strip null bytes and surrounding whitespace (including non-breaking/zero-width spaces).
            'body' => is_string($body)
                ? preg_replace('/^[\s\x{00A0}\x{200B}\x{FEFF}]+|[\s\x{00A0}\x{200B}\x{FEFF}]+$/u', '', str_replace("\0", '', $body))
                : $body,
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
            'body' => ['required', 'string', 'max:'.TaskCommentService::MAX_BODY_LENGTH],
        ];
    }

    public function messages(): array
    {
        return [
            'body.required' => 'Comment cannot be empty.',
            'body.string' => 'Comment must be text.',
            'body.max' => 'Comment may not be longer than '.TaskCommentService::MAX_BODY_LENGTH.' characters.',
        ];
    }
}
