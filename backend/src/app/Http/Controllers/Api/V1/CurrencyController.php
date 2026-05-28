<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\CurrencyCatalog;
use Illuminate\Http\JsonResponse;

class CurrencyController extends Controller
{
    public function index(): JsonResponse
    {
        return $this->success('Supported currencies fetched successfully.', [
            'currencies' => CurrencyCatalog::asOptions(),
            'default_currency' => CurrencyCatalog::defaultCode(),
        ]);
    }
}
