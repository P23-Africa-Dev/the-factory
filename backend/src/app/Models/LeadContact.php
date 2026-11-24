<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeadContact extends Model
{
    use HasFactory;

    protected $fillable = [
        'lead_id',
        'name',
        'email',
        'phone',
        'location',
        'position',
        'profile_urls',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'profile_urls' => 'array',
            'sort_order' => 'integer',
        ];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}
