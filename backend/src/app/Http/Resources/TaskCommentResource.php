<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\AvatarUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaskCommentResource extends JsonResource
{
    /**
     * @param  array<int, string>  $authorRoles  company role keyed by user id
     */
    public function __construct($resource, private readonly array $authorRoles = [])
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        $author = $this->relationLoaded('author') ? $this->author : null;

        return [
            'id' => $this->id,
            'task_id' => $this->task_id,
            'body' => $this->body,
            'author' => $author ? [
                'id' => $author->id,
                'name' => $author->name,
                'role' => $this->authorRoles[(int) $author->id] ?? null,
                'avatar_url' => AvatarUrlResolver::resolveOrDefault($author->avatar, $author->gender),
            ] : null,
            'is_mine' => $request->user() !== null && (int) $request->user()->id === (int) $this->author_user_id,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
