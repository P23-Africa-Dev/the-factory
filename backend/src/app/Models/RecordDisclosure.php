<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecordDisclosure extends Model
{
    public const ACTION_VIEW = 'view';

    public const ACTION_EXPORT = 'export';

    public const REQUESTER_TYPES = [
        'government',
        'security_force',
        'platform_user',
        'company_management',
        'internal_review',
        'other',
    ];

    public $timestamps = false;

    protected $fillable = [
        'admin_id',
        'report',
        'action',
        'requester_type',
        'reference',
        'note',
        'from_date',
        'to_date',
        'filters',
        'row_count',
        'ip_address',
        'user_agent',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'from_date' => 'date',
            'to_date' => 'date',
            'filters' => 'array',
            'row_count' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(Admin::class, 'admin_id');
    }
}
