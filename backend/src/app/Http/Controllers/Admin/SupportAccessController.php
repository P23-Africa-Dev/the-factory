<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\CreateSupportAccessRequest;
use App\Models\Admin;
use App\Models\User;
use App\Services\Admin\SupportAccessService;
use Illuminate\Contracts\View\View;

class SupportAccessController extends Controller
{
    public function __construct(private readonly SupportAccessService $service) {}

    public function store(CreateSupportAccessRequest $request, User $user): View
    {
        /** @var Admin $admin */
        $admin = auth('admin')->user();

        $result = $this->service->create(
            admin: $admin,
            target: $user,
            data: $request->validated(),
            request: $request,
        );

        return view('admin.support-access.handoff', [
            'handoffUrl' => rtrim((string) config('app.frontend_url'), '/') . '/support/handoff',
            'exchangeCode' => $result['exchange_code'],
        ]);
    }
}
