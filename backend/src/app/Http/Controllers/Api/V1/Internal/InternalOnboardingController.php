<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\CompleteInternalOnboardingRequest;
use App\Http\Requests\Internal\PreviewInternalOnboardingRequest;
use App\Http\Resources\InternalUserResource;
use App\Services\Internal\InternalUserOnboardingService;
use Illuminate\Http\JsonResponse;

class InternalOnboardingController extends Controller
{
    public function __construct(private readonly InternalUserOnboardingService $service) {}

    public function preview(PreviewInternalOnboardingRequest $request): JsonResponse
    {
        $result = $this->service->previewOnboarding(
            invitationId: (int) $request->validated('invitation_id'),
            token: (string) $request->validated('token'),
        );

        return $this->success(
            message: 'Invitation is valid.',
            data: [
                'user' => new InternalUserResource($result['user']),
                'avatar_options' => $result['avatar_options'],
                'avatar_options_by_gender' => $result['avatar_options_by_gender'],
                'prefilled_data' => $result['prefilled_data'],
                'selected_gender' => $result['selected_gender'],
                'selected_avatar_key' => $result['selected_avatar_key'],
                'selected_avatar_svg' => $result['selected_avatar_svg'],
                'suggested_avatar_key' => $result['suggested_avatar_key'],
                'expires_at' => $result['invitation']->expires_at?->toIso8601String(),
            ],
        );
    }

    public function complete(CompleteInternalOnboardingRequest $request): JsonResponse
    {
        $data = $request->validated();

        if ($request->hasFile('avatar_file')) {
            $data['avatar_file'] = $request->file('avatar_file');
        }

        $result = $this->service->completeOnboarding(
            invitationId: (int) $request->validated('invitation_id'),
            token: (string) $request->validated('token'),
            data: $data,
        );

        return $this->success(
            message: 'Onboarding completed successfully.',
            data: [
                'token' => $result['token'],
                'token_type' => 'Bearer',
                'user' => new InternalUserResource($result['user']),
                'avatar_svg' => $result['avatar_svg'],
                'avatar_url' => $result['avatar_url'],
            ],
        );
    }
}
