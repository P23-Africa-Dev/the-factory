<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Payroll\CreatePayrollRequest;
use App\Http\Requests\Payroll\UpdatePayrollRequest;
use App\Http\Resources\PayrollSettingResource;
use App\Models\PayrollSetting;
use App\Services\Payroll\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayrollController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly PayrollService $payrollService) {}

    public function index(Request $request): JsonResponse
    {
        $payrollSetting = $this->payrollService->findForUser(
            user: $request->user(),
            companyId: $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Payroll settings fetched successfully.',
            data: ['payroll' => $payrollSetting ? new PayrollSettingResource($payrollSetting) : null],
        );
    }

    public function store(CreatePayrollRequest $request): JsonResponse
    {
        $payrollSetting = $this->payrollService->create($request->user(), $request->validated());

        return $this->success(
            message: 'Payroll settings created successfully.',
            data: ['payroll' => new PayrollSettingResource($payrollSetting)],
            status: 201,
        );
    }

    public function update(UpdatePayrollRequest $request, PayrollSetting $payrollSetting): JsonResponse
    {
        $payrollSetting = $this->payrollService->update(
            user: $request->user(),
            payrollSetting: $payrollSetting,
            data: $request->validated(),
        );

        return $this->success(
            message: 'Payroll settings updated successfully.',
            data: ['payroll' => new PayrollSettingResource($payrollSetting)],
        );
    }
}
