<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\AvatarUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $requestUser = $request->user();
        $isAgentRequester = $requestUser !== null && $requestUser->internal_role === 'agent';

        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'project_id' => $this->project_id,
            'created_by_user_id' => $this->created_by_user_id,
            'assigned_agent_id' => $this->assigned_agent_id,
            'title' => $this->title,
            'type' => $this->type?->value,
            'description' => $this->description,
            'location' => $this->location_text,
            'address' => $this->address_full,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'due_date' => $this->due_at?->toIso8601String(),
            'required_actions' => $this->required_actions ?? [],
            'priority' => $this->priority?->value,
            'minimum_photos_required' => $this->minimum_photos_required,
            'visit_verification_required' => $this->visit_verification_required,
            'status' => $this->status?->value,
            'started_at' => $this->started_at?->toIso8601String(),
            'paused_at' => $this->paused_at?->toIso8601String(),
            'resumed_at' => $this->resumed_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'project' => $this->whenLoaded('project', fn(): ?array => $this->project ? [
                'id' => $this->project->id,
                'company_id' => $this->project->company_id,
                'name' => $this->project->name,
                'status' => $this->project->status?->value,
                'priority' => $this->project->priority?->value,
            ] : null),
            'creator' => $this->whenLoaded('creator', fn(): ?array => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
                'email' => $this->creator->email,
                'avatar_url' => AvatarUrlResolver::resolve($this->creator->avatar, $this->creator->gender),
            ] : null),
            'assignee' => $this->whenLoaded('assignedAgent', function () use ($isAgentRequester, $requestUser): ?array {
                if (! $this->assignedAgent) {
                    return null;
                }

                if ($isAgentRequester && $requestUser !== null && (int) $this->assignedAgent->id !== (int) $requestUser->id) {
                    return null;
                }

                return [
                    'id' => $this->assignedAgent->id,
                    'name' => $this->assignedAgent->name,
                    'email' => $this->assignedAgent->email,
                    'avatar_url' => AvatarUrlResolver::resolve($this->assignedAgent->avatar, $this->assignedAgent->gender),
                ];
            }),
            'assigned_users' => $this->whenLoaded('currentAssignees', function () use ($isAgentRequester, $requestUser): array {
                $assignees = $this->currentAssignees;

                if ($isAgentRequester && $requestUser !== null) {
                    $assignees = $assignees->where('id', (int) $requestUser->id);
                }

                return $assignees
                    ->map(fn($u) => [
                        'id' => $u->id,
                        'name' => $u->name,
                        'avatar_url' => AvatarUrlResolver::resolve($u->avatar, $u->gender),
                    ])
                    ->values()
                    ->all();
            }),
            'proofs_count' => $this->whenCounted('proofs'),
            'proofs' => TaskProofResource::collection($this->whenLoaded('proofs')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
