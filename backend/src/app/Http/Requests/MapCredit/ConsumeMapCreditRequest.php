<?php

declare(strict_types=1);

namespace App\Http\Requests\MapCredit;

use Illuminate\Foundation\Http\FormRequest;

class ConsumeMapCreditRequest extends FormRequest
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
            'sku' => ['required', 'string', 'max:64'],
            'source' => ['nullable', 'string', 'in:dashboard,pwa,system'],
            'units' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'company_id' => ['nullable', 'integer'],
        ];
    }
}
