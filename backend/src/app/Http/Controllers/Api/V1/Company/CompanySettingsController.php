<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Company;

use App\Http\Controllers\Controller;
use App\Services\Company\CompanySettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CompanySettingsController extends Controller
{
    public function __construct(private readonly CompanySettingsService $service) {}

    public function show(Request $request): JsonResponse
    {
        $data = $this->service->show(
            $request->user(),
            $request->integer('company_id') ?: null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Company settings fetched successfully.',
            'data' => $data,
            'errors' => null,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'operational_defaults' => ['sometimes', 'array'],
            'operational_defaults.minimum_photos_required' => ['sometimes', 'integer', 'min:0', 'max:20'],
            'operational_defaults.visit_verification_required' => ['sometimes', 'boolean'],
            'meeting_defaults' => ['sometimes', 'array'],
            'meeting_defaults.default_reminder_minutes' => ['sometimes', 'integer', Rule::in([5, 10, 15, 30, 60])],
        ]);

        $companyId = isset($validated['company_id']) ? (int) $validated['company_id'] : null;
        unset($validated['company_id']);

        $data = $this->service->update($request->user(), $validated, $companyId);

        return response()->json([
            'success' => true,
            'message' => 'Company settings updated successfully.',
            'data' => $data,
            'errors' => null,
        ]);
    }
}
