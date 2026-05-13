<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class TaskProof extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'uploaded_by_user_id',
        'disk',
        'file_path',
        'mime_type',
        'size_bytes',
        'latitude',
        'longitude',
        'captured_at',
        'notes',
        'metadata',
    ];

    protected $hidden = [
        'disk',
        'file_path',
    ];

    protected $appends = [
        'file_url',
    ];

    protected function casts(): array
    {
        return [
            'captured_at' => 'datetime',
            'metadata' => 'array',
            'latitude' => 'float',
            'longitude' => 'float',
            'size_bytes' => 'integer',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by_user_id');
    }

    public function getFileUrlAttribute(): string
    {
        if (array_key_exists('file_url', $this->attributes) && is_string($this->attributes['file_url'])) {
            return $this->attributes['file_url'];
        }

        return Storage::disk($this->disk)->url($this->file_path);
    }
}
