<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Payroll\ApprovePayrollAgentRequest;
use App\Http\Requests\Payroll\CreatePayrollRequest;
use App\Http\Requests\Payroll\PayrollAgentListRequest;
use App\Http\Requests\Payroll\PayrollAgentProfileRequest;
use App\Http\Requests\Payroll\PayrollExportRequest;
use App\Http\Requests\Payroll\PayrollOverviewRequest;
use App\Http\Requests\Payroll\UpdatePayrollRequest;
use App\Http\Requests\Payroll\UpdateAgentPayrollRequest;
use App\Http\Resources\PayrollSettingResource;
use App\Models\PayrollSetting;
use App\Models\User;
use App\Services\Payroll\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

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

    public function overview(PayrollOverviewRequest $request): JsonResponse
    {
        $overview = $this->payrollService->overview(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Payroll overview fetched successfully.',
            data: $overview,
        );
    }

    public function agents(PayrollAgentListRequest $request): JsonResponse
    {
        $result = $this->payrollService->listAgents(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Payroll agents fetched successfully.',
            data: $result,
        );
    }

    public function agentProfile(PayrollAgentProfileRequest $request, User $user): JsonResponse
    {
        $profile = $this->payrollService->profile(
            actor: $request->user(),
            targetUserId: (int) $user->id,
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Payroll agent profile fetched successfully.',
            data: $profile,
        );
    }

    public function updateAgentPayroll(UpdateAgentPayrollRequest $request, User $user): JsonResponse
    {
        $profile = $this->payrollService->updateAgentPayrollProfile(
            actor: $request->user(),
            agentId: (int) $user->id,
            data: $request->validated(),
        );

        return $this->success(
            message: 'Agent payroll updated successfully.',
            data: $profile,
        );
    }

    public function approveAgentPayroll(ApprovePayrollAgentRequest $request, User $user): JsonResponse
    {
        $profile = $this->payrollService->approveAgentPayroll(
            actor: $request->user(),
            agentId: (int) $user->id,
            data: $request->validated(),
        );

        return $this->success(
            message: 'Payroll approval updated successfully.',
            data: $profile,
        );
    }

    public function export(PayrollExportRequest $request): StreamedResponse
    {
        $export = $this->payrollService->exportAgents(
            user: $request->user(),
            filters: $request->validated(),
        );

        return response()->streamDownload(
            static function () use ($export): void {
                $stream = $export['stream'] ?? null;
                if (is_callable($stream)) {
                    $stream();
                }
            },
            $export['filename'],
            [
                'Content-Type' => $export['content_type'],
                'Cache-Control' => 'no-store, no-cache, must-revalidate',
                'Pragma' => 'no-cache',
                'X-Content-Type-Options' => 'nosniff',
            ],
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
