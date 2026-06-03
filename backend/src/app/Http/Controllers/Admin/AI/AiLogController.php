<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\AI;

use App\Http\Controllers\Controller;
use App\Models\AiLog;
use Illuminate\Http\Request;
use Illuminate\View\View;

class AiLogController extends Controller
{
    public function index(Request $request): View
    {
        $query = AiLog::query()->with(['user:id,name,email', 'company:id,name'])->latest();

        if ($date = $request->input('date')) {
            $query->whereDate('created_at', $date);
        }

        if ($userId = $request->input('user_id')) {
            $query->where('user_id', (int) $userId);
        }

        if ($companyId = $request->input('company_id')) {
            $query->where('company_id', (int) $companyId);
        }

        if ($provider = $request->input('provider')) {
            $query->where('provider', $provider);
        }

        if ($model = $request->input('model')) {
            $query->where('model', $model);
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search): void {
                $q->where('user_prompt', 'like', '%' . $search . '%')
                    ->orWhere('error_message', 'like', '%' . $search . '%');
            });
        }

        $logs = $query->paginate(50)->withQueryString();

        $providers = AiLog::query()->distinct()->pluck('provider')->filter()->sort()->values();
        $models = AiLog::query()->distinct()->pluck('model')->filter()->sort()->values();

        return view('admin.ai.logs', compact('logs', 'providers', 'models'));
    }

    public function show(AiLog $log): View
    {
        $log->load(['user:id,name,email', 'company:id,name']);

        return view('admin.ai.log-detail', compact('log'));
    }
}
