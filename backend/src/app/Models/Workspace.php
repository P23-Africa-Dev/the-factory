<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Workspace extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'ulid',
        'owner_id',
        'name',
        'slug',
        'country',
        'team_size',
        'purpose',
        'user_type',
    ];

    protected static function booted(): void
    {
        static::creating(function (Workspace $workspace): void {
            if (empty($workspace->ulid)) {
                $workspace->ulid = (string) Str::ulid();
            }
        });
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'workspace_users')
            ->withPivot(['role', 'joined_at'])
            ->withTimestamps();
    }
}
