<?php

declare(strict_types=1);

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class SendCrmEmailRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string,mixed>
     */
    public function rules(): array
    {
        return [
            'company_id' => ['sometimes', 'integer', 'exists:companies,id'],
            'to' => ['required', 'array', 'min:1'],
            'to.*.email' => ['required', 'email', 'max:255'],
            'to.*.name' => ['nullable', 'string', 'max:255'],
            'cc' => ['sometimes', 'array'],
            'cc.*.email' => ['required_with:cc', 'email', 'max:255'],
            'cc.*.name' => ['nullable', 'string', 'max:255'],
            'cc.*.user_id' => ['nullable', 'integer', 'exists:users,id'],
            'bcc' => ['sometimes', 'array'],
            'bcc.*.email' => ['required_with:bcc', 'email', 'max:255'],
            'bcc.*.name' => ['nullable', 'string', 'max:255'],
            'bcc.*.user_id' => ['nullable', 'integer', 'exists:users,id'],
            'subject' => ['required', 'string', 'max:255'],
            'body_html' => ['nullable', 'string', 'max:50000'],
            'body_text' => ['nullable', 'string', 'max:50000'],
            'attachment_ids' => ['sometimes', 'array'],
            'attachment_ids.*' => ['integer', 'exists:crm_email_attachments,id'],
            'gmail_thread_id' => ['nullable', 'string', 'max:255'],
            'reply_to_gmail_message_id' => ['nullable', 'string', 'max:255'],
        ];
    }
}
