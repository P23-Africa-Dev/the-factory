<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\SalesEngine;

use App\Http\Controllers\Controller;
use App\Services\Company\CompanyContextService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Issues a short-lived HS256 assertion for Continue-with-Factory23 → Sales Engine exchange.
 */
class SalesEngineAssertionController extends Controller
{
    public function __construct(private readonly CompanyContextService $companyContext) {}

    public function store(Request $request): JsonResponse
    {
        $secret = trim((string) config('services.sales_engine.jwt_secret'));
        if ($secret === '') {
            return response()->json([
                'success' => false,
                'message' => 'SALES_ENGINE_JWT_SECRET is not configured.',
                'data' => null,
                'errors' => ['config' => ['Missing shared JWT secret.']],
            ], 503);
        }

        $user = $request->user();
        $context = $this->companyContext->resolve(
            $user,
            $request->integer('company_id') ?: null,
        );
        $company = $context['company'];

        $now = time();
        $payload = [
            'sub' => (string) $user->id,
            'email' => (string) $user->email,
            'name' => (string) ($user->name ?? $user->email),
            'company_id' => (string) $company->id,
            'company_name' => (string) $company->name,
            'iat' => $now,
            'exp' => $now + 60,
            'iss' => 'factory23',
            'aud' => 'sales-engine',
        ];

        $assertion = $this->encodeHs256($payload, $secret);

        return response()->json([
            'success' => true,
            'message' => 'Sales Engine assertion issued.',
            'data' => [
                'assertion' => $assertion,
                'expires_in' => 60,
                'exchange_url' => rtrim((string) config('services.sales_engine.api_url'), '/').'/api/v1/auth/factory23/exchange',
            ],
            'errors' => null,
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function encodeHs256(array $payload, string $secret): string
    {
        $header = $this->b64url(json_encode(['typ' => 'JWT', 'alg' => 'HS256'], JSON_THROW_ON_ERROR));
        $body = $this->b64url(json_encode($payload, JSON_THROW_ON_ERROR));
        $sig = $this->b64url(hash_hmac('sha256', $header.'.'.$body, $secret, true));

        return $header.'.'.$body.'.'.$sig;
    }

    private function b64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
