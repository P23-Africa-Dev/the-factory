<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Services\AI\AiStackSettingService;
use Illuminate\Foundation\Http\FormRequest;

class UpdateAiStackRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'stack' => [
                'required',
                'string',
                'in:' . implode(',', [
                    AiStackSettingService::OPENAI_CLAUDE,
                    AiStackSettingService::NVIDIA,
                    AiStackSettingService::GLM,
                ]),
            ],
        ];
    }
}
