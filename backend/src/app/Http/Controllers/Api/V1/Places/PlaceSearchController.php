<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Places;

use App\Http\Controllers\Controller;
use App\Services\Company\CompanyContextService;
use App\Services\Places\PlaceSearchService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlaceSearchController extends Controller
{
    public function __construct(
        private readonly PlaceSearchService $places,
        private readonly CompanyContextService $companyContext,
    ) {}

    public function autocomplete(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));
        if (mb_strlen($query) < 2) {
            return $this->envelope(['data' => [], 'meta' => ['provider' => null, 'cache_hit' => false, 'status' => 'ok']]);
        }

        ['company' => $company] = $this->resolveCompany($request);
        $outcome = $this->places->autocomplete(
            query: $query,
            company: $company,
            user: $request->user(),
            lat: $this->floatOrNull($request->query('lat')),
            lng: $this->floatOrNull($request->query('lng')),
            limit: min(10, max(1, (int) $request->query('limit', 6))),
            source: $this->source($request),
            ip: $request->ip(),
        );

        return $this->envelope($outcome->toApiEnvelope(), $outcome->status === 'credits_blocked' ? 402 : 200);
    }

    public function search(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));
        if ($query === '') {
            return response()->json(['success' => false, 'message' => 'q is required.', 'data' => null, 'errors' => ['q' => ['required']]], 422);
        }

        ['company' => $company] = $this->resolveCompany($request);
        $outcome = $this->places->search(
            query: $query,
            company: $company,
            user: $request->user(),
            lat: $this->floatOrNull($request->query('lat')),
            lng: $this->floatOrNull($request->query('lng')),
            limit: min(20, max(1, (int) $request->query('limit', 10))),
            source: $this->source($request),
            ip: $request->ip(),
        );

        return $this->envelope($outcome->toApiEnvelope(), $outcome->status === 'credits_blocked' ? 402 : 200);
    }

    public function nearby(Request $request): JsonResponse
    {
        $lat = $this->floatOrNull($request->input('lat'));
        $lng = $this->floatOrNull($request->input('lng'));
        if ($lat === null || $lng === null) {
            return response()->json(['success' => false, 'message' => 'lat and lng are required.', 'data' => null, 'errors' => ['lat' => ['required'], 'lng' => ['required']]], 422);
        }

        $categories = $request->input('categories');
        if (is_string($categories)) {
            $categories = array_values(array_filter(array_map('trim', explode(',', $categories))));
        }
        if (! is_array($categories)) {
            $categories = null;
        }

        ['company' => $company] = $this->resolveCompany($request);
        $outcome = $this->places->nearby(
            lat: $lat,
            lng: $lng,
            radiusM: min(5000, max(100, (int) $request->input('radius_m', 1500))),
            categories: $categories,
            limit: min(40, max(1, (int) $request->input('limit', 20))),
            company: $company,
            user: $request->user(),
            source: $this->source($request),
            ip: $request->ip(),
        );

        return $this->envelope($outcome->toApiEnvelope(), $outcome->status === 'credits_blocked' ? 402 : 200);
    }

    public function details(Request $request): JsonResponse
    {
        $id = trim((string) $request->query('id', ''));
        $provider = trim((string) $request->query('provider', 'geoapify'));
        if ($id === '') {
            return response()->json(['success' => false, 'message' => 'id is required.', 'data' => null, 'errors' => ['id' => ['required']]], 422);
        }

        ['company' => $company] = $this->resolveCompany($request);
        $outcome = $this->places->details(
            id: $id,
            providerHint: $provider !== '' ? $provider : 'geoapify',
            company: $company,
            user: $request->user(),
            source: $this->source($request),
            ip: $request->ip(),
        );

        return $this->envelope($outcome->toApiEnvelope(), $outcome->status === 'credits_blocked' ? 402 : 200);
    }

    public function geocode(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));
        if ($query === '') {
            return response()->json(['success' => false, 'message' => 'q is required.', 'data' => null, 'errors' => ['q' => ['required']]], 422);
        }

        ['company' => $company] = $this->resolveCompany($request);
        $outcome = $this->places->geocode(
            query: $query,
            company: $company,
            user: $request->user(),
            source: $this->source($request),
            ip: $request->ip(),
        );

        return $this->envelope($outcome->toApiEnvelope());
    }

    public function reverse(Request $request): JsonResponse
    {
        $lat = $this->floatOrNull($request->query('lat'));
        $lng = $this->floatOrNull($request->query('lng'));
        if ($lat === null || $lng === null) {
            return response()->json(['success' => false, 'message' => 'lat and lng are required.', 'data' => null, 'errors' => ['lat' => ['required'], 'lng' => ['required']]], 422);
        }

        ['company' => $company] = $this->resolveCompany($request);
        $outcome = $this->places->reverseGeocode(
            lat: $lat,
            lng: $lng,
            company: $company,
            user: $request->user(),
            source: $this->source($request),
            ip: $request->ip(),
        );

        return $this->envelope($outcome->toApiEnvelope());
    }

    /**
     * @return array{company: \App\Models\Company}
     */
    private function resolveCompany(Request $request): array
    {
        return $this->companyContext->resolve(
            $request->user(),
            $request->integer('company_id') ?: null,
        );
    }

    private function source(Request $request): string
    {
        $source = strtolower(trim((string) $request->header('X-Places-Source', $request->query('source', 'dashboard'))));

        return in_array($source, ['dashboard', 'pwa', 'system'], true) ? $source : 'dashboard';
    }

    private function floatOrNull(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return is_numeric($value) ? (float) $value : null;
    }

    /**
     * @param  array{data: mixed, meta: mixed}  $envelope
     */
    private function envelope(array $envelope, int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => $status < 400,
            'message' => $status === 402 ? 'Map credits exhausted.' : 'Places response.',
            'data' => $envelope['data'],
            'meta' => $envelope['meta'],
            'errors' => null,
        ], $status);
    }
}
