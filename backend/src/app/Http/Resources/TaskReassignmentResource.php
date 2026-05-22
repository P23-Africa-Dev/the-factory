<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaskReassignmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'task_id' => $this->task_id,
            'company_id' => $this->company_id,
            'requested_by_user_id' => $this->requested_by_user_id,
            'from_user_id' => $this->from_user_id,
            'to_user_id' => $this->to_user_id,
            'status' => $this->status?->value,
            'reason' => $this->reason,
            'response_note' => $this->response_note,
            'requested_at' => $this->requested_at?->toIso8601String(),
            'responded_at' => $this->responded_at?->toIso8601String(),
            'accepted_at' => $this->accepted_at?->toIso8601String(),
            'rejected_at' => $this->rejected_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'tracking_transferred_at' => $this->tracking_transferred_at?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'task' => $this->whenLoaded('task', fn(): ?array => $this->task ? [
                'id' => $this->task->id,
                'title' => $this->task->title,
                'project_id' => $this->task->project_id,
                'due_date' => $this->task->due_at?->toIso8601String(),
                'location' => $this->task->location_text,
                'address' => $this->task->address_full,
            ] : null),
            'from_user' => $this->whenLoaded('fromUser', fn(): ?array => $this->fromUser ? [
                'id' => $this->fromUser->id,
                'name' => $this->fromUser->name,
                'email' => $this->fromUser->email,
            ] : null),
            'to_user' => $this->whenLoaded('toUser', fn(): ?array => $this->toUser ? [
                'id' => $this->toUser->id,
                'name' => $this->toUser->name,
                'email' => $this->toUser->email,
            ] : null),
            'requested_by' => $this->whenLoaded('requestedBy', fn(): ?array => $this->requestedBy ? [
                'id' => $this->requestedBy->id,
                'name' => $this->requestedBy->name,
                'email' => $this->requestedBy->email,
            ] : null),
            'responded_by' => $this->whenLoaded('respondedBy', fn(): ?array => $this->respondedBy ? [
                'id' => $this->respondedBy->id,
                'name' => $this->respondedBy->name,
                'email' => $this->respondedBy->email,
            ] : null),
        ];
    }
}
