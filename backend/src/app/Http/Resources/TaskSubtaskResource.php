<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\AvatarUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaskSubtaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $assignee = $this->relationLoaded('assignee') ? $this->assignee : null;
        $completer = $this->relationLoaded('completer') ? $this->completer : null;

        return [
            'id' => $this->id,
            'task_id' => $this->task_id,
            'title' => $this->title,
            'position' => (int) $this->position,
            'due_at' => $this->due_at?->toIso8601String(),
            'is_completed' => (bool) $this->is_completed,
            'completed_at' => $this->completed_at?->toIso8601String(),
            'assignee' => $assignee ? [
                'id' => $assignee->id,
                'name' => $assignee->name,
                'email' => $assignee->email,
                'avatar_url' => AvatarUrlResolver::resolveOrDefault($assignee->avatar, $assignee->gender),
            ] : null,
            'completed_by' => $completer ? [
                'id' => $completer->id,
                'name' => $completer->name,
                'email' => $completer->email,
                'avatar_url' => AvatarUrlResolver::resolveOrDefault($completer->avatar, $completer->gender),
            ] : null,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
