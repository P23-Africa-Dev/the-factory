<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\NotificationPriority;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppNotification extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'company_id',
        'type',
        'category',
        'title',
        'message',
        'reference_type',
        'reference_id',
        'action_url',
        'action_route',
        'metadata',
        'priority',
        'delivery_types',
        'is_in_app_visible',
        'is_read',
        'read_at',
        'created_by_user_id',
        'dedupe_key',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'delivery_types' => 'array',
            'is_in_app_visible' => 'boolean',
            'is_read' => 'boolean',
            'read_at' => 'datetime',
            'priority' => NotificationPriority::class,
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
