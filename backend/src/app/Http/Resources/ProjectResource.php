<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\AvatarUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $totalTasks = (int) ($this->total_tasks_count ?? 0);
        $completedTasks = (int) ($this->completed_tasks_count ?? 0);
        $pendingTasks = (int) ($this->pending_tasks_count ?? max(0, $totalTasks - $completedTasks));
        $completedPercentage = $totalTasks > 0 ? round(($completedTasks / $totalTasks) * 100, 2) : 0;
        $pendingPercentage = $totalTasks > 0 ? round(($pendingTasks / $totalTasks) * 100, 2) : 0;

        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'created_by_user_id' => $this->created_by_user_id,
            'project_manager_user_id' => $this->project_manager_user_id,
            'name' => $this->name,
            'description' => $this->description,
            'type' => $this->type?->value,
            'status' => $this->status?->value,
            'priority' => $this->priority?->value,
            'start_date' => $this->start_date?->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'duration_days' => $this->duration_days,
            'territory_zone' => $this->territory_zone,
            'notes' => $this->notes,
            'manager' => $this->whenLoaded('manager', fn(): ?array => $this->manager ? [
                'id' => $this->manager->id,
                'name' => $this->manager->name,
                'email' => $this->manager->email,
                'avatar_url' => AvatarUrlResolver::resolve($this->manager->avatar, $this->manager->gender),
            ] : null),
            'assigned_team' => $this->whenLoaded('teamUsers', fn() => $this->teamUsers->map(fn($user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->pivot->role,
                'avatar_url' => AvatarUrlResolver::resolve($user->avatar, $user->gender),
            ])->values()->all()),
            'attachments' => ProjectFileResource::collection($this->whenLoaded('files')),
            'task_summary' => [
                'total_tasks' => $totalTasks,
                'completed_tasks' => $completedTasks,
                'pending_tasks' => $pendingTasks,
                'completed_percentage' => $completedPercentage,
                'pending_percentage' => $pendingPercentage,
            ],
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
