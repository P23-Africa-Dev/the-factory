<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\User;

use App\Http\Controllers\Controller;
use App\Http\Requests\Profile\FetchProfileRequest;
use App\Http\Requests\Profile\UpdateProfileAvatarRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Http\Resources\ProfileResource;
use App\Services\Profile\ProfileService;
use Illuminate\Http\JsonResponse;

class ProfileController extends Controller
{
    public function __construct(private readonly ProfileService $profileService) {}

    public function show(FetchProfileRequest $request): JsonResponse
    {
        $data = $this->profileService->show(
            user: $request->user(),
            companyId: $request->validated('company_id') !== null
                ? (int) $request->validated('company_id')
                : null,
        );

        return $this->success(
            message: 'Profile fetched successfully.',
            data: new ProfileResource($data),
        );
    }

    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $data = $this->profileService->update(
            user: $request->user(),
            payload: $request->validated(),
        );

        return $this->success(
            message: 'Profile updated successfully.',
            data: new ProfileResource($data),
        );
    }

    public function updateAvatar(UpdateProfileAvatarRequest $request): JsonResponse
    {
        $data = $request->validated();

        if ($request->hasFile('avatar_file')) {
            $data['avatar_file'] = $request->file('avatar_file');
        }

        $result = $this->profileService->updateAvatar(
            user: $request->user(),
            payload: $data,
        );

        return $this->success(
            message: 'Profile image updated successfully.',
            data: new ProfileResource($result),
        );
    }
}
