<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyLocation extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'crm_lead_id',
        'created_by_user_id',
        'updated_by_user_id',
        'name',
        'type',
        'description',
        'address',
        'latitude',
        'longitude',
        'contact_number',
        'email',
        'is_active',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'is_active' => 'boolean',
            'meta' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function crmLead(): BelongsTo
    {
        return $this->belongsTo(Lead::class, 'crm_lead_id');
    }

    public function isLinkedToCrm(): bool
    {
        return $this->crm_lead_id !== null;
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_user_id');
    }
}
