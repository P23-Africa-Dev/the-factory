<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\CountryCatalog;
use Illuminate\Http\JsonResponse;

class CountryController extends Controller
{
    public function index(): JsonResponse
    {
        return $this->success('Supported countries fetched successfully.', [
            'countries' => CountryCatalog::asOptions(),
        ]);
    }
}
