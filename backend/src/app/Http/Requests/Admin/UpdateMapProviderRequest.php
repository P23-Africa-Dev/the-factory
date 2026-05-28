<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Services\Map\MapProviderSettingService;
use Illuminate\Foundation\Http\FormRequest;

class UpdateMapProviderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'provider' => [
                'required',
                'string',
                'in:' . implode(',', [
                    MapProviderSettingService::MAPBOX,
                    MapProviderSettingService::GOOGLE,
                ]),
            ],
        ];
    }
}
