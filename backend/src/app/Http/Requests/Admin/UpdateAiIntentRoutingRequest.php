<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Services\AI\AiIntentRoutingSettingService;
use Illuminate\Foundation\Http\FormRequest;

class UpdateAiIntentRoutingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'mode' => [
                'required',
                'string',
                'in:' . implode(',', [
                    AiIntentRoutingSettingService::RULES_FIRST,
                    AiIntentRoutingSettingService::AI_FIRST,
                ]),
            ],
        ];
    }
}
