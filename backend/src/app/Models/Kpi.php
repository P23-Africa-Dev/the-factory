<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Enums\KpiStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Kpi extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'company_id',
        'created_by_user_id',
        'assigned_to_user_id',
        'last_status_updated_by_user_id',
        'name',
        'category',
        'objective',
        'target_value',
        'expected_outcome',
        'priority',
        'status',
        'start_date',
        'end_date',
        'started_at',
        'completed_at',
        'cancelled_at',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'category' => KpiCategory::class,
            'priority' => KpiPriority::class,
            'status' => KpiStatus::class,
            'start_date' => 'date',
            'end_date' => 'date',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'sort_order' => 'integer',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_user_id');
    }

    public function statusUpdater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'last_status_updated_by_user_id');
    }
}
