<?php

declare(strict_types=1);

namespace App\Http\Requests\MapCredit;

use Illuminate\Foundation\Http\FormRequest;

class CreateCreditTopupRequest extends FormRequest
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
        return [
            'amount_usd' => ['required', 'numeric', 'min:1', 'max:100000'],
            'company_id' => ['nullable', 'integer'],
        ];
    }
}
