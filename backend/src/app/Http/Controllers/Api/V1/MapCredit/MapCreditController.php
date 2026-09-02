<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\MapCredit;

use App\Http\Controllers\Controller;
use App\Http\Requests\MapCredit\ConsumeMapCreditRequest;
use App\Http\Requests\MapCredit\CreateCreditTopupRequest;
use App\Models\MapCreditTransaction;
use App\Services\Billing\CompanySubscriptionService;
use App\Services\Billing\MapCreditService;
use App\Services\Company\CompanyContextService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MapCreditController extends Controller
{
    public function __construct(
        private readonly MapCreditService $mapCredits,
        private readonly CompanyContextService $companyContext,
        private readonly CompanySubscriptionService $subscriptionService,
    ) {}

    public function show(Request $request): JsonResponse
    {
        ['company' => $company] = $this->companyContext->resolve(
            $request->user(),
            $request->integer('company_id') ?: null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Map credits retrieved.',
            'data' => $this->mapCredits->snapshot($company),
            'errors' => null,
        ]);
    }

    public function consume(ConsumeMapCreditRequest $request): JsonResponse
    {
        ['company' => $company] = $this->companyContext->resolve(
            $request->user(),
            $request->integer('company_id') ?: null,
        );

        $result = $this->mapCredits->consume(
            company: $company,
            sku: (string) $request->validated('sku'),
            source: (string) ($request->validated('source') ?? 'system'),
            units: (float) ($request->validated('units') ?? 1),
        );

        return response()->json([
            'success' => true,
            'message' => $result['allowed'] ? 'Credit consumed.' : 'Credits exhausted.',
            'data' => $result,
            'errors' => null,
        ], $result['allowed'] ? 200 : 402);
    }

    public function transactions(Request $request): JsonResponse
    {
        ['company' => $company] = $this->companyContext->resolve(
            $request->user(),
            $request->integer('company_id') ?: null,
        );

        $perPage = min(100, max(5, $request->integer('per_page', 25)));

        $transactions = MapCreditTransaction::query()
            ->where('company_id', $company->id)
            ->latest()
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'message' => 'Map credit transactions retrieved.',
            'data' => [
                'items' => collect($transactions->items())->map(static fn (MapCreditTransaction $tx): array => [
                    'id' => $tx->id,
                    'type' => $tx->type,
                    'sku' => $tx->sku,
                    'credits' => (float) $tx->credits,
                    'usd_amount' => (float) $tx->usd_amount,
                    'balance_after' => (float) $tx->balance_after,
                    'source' => $tx->source,
                    'created_at' => $tx->created_at?->toIso8601String(),
                ])->all(),
                'pagination' => [
                    'current_page' => $transactions->currentPage(),
                    'last_page' => $transactions->lastPage(),
                    'per_page' => $transactions->perPage(),
                    'total' => $transactions->total(),
                ],
            ],
            'errors' => null,
        ]);
    }

    public function topupCheckout(CreateCreditTopupRequest $request): JsonResponse
    {
        $checkout = $this->subscriptionService->createCreditTopupCheckout(
            user: $request->user(),
            amountUsd: (float) $request->validated('amount_usd'),
            companyId: $request->integer('company_id') ?: null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Top-up checkout session created.',
            'data' => [
                'checkout_url' => $checkout->asStripeCheckoutSession()->url,
            ],
            'errors' => null,
        ]);
    }
}
