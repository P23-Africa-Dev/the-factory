<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyCalendarConnection extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'owner_user_id',
        'organizer_email',
        'organizer_google_user_id',
        'access_token_encrypted',
        'refresh_token_encrypted',
        'token_expires_at',
        'scopes',
        'status',
        'last_error_message',
        'last_error_at',
        'connected_at',
        'disconnected_at',
    ];

    protected function casts(): array
    {
        return [
            'access_token_encrypted' => 'encrypted',
            'refresh_token_encrypted' => 'encrypted',
            'scopes' => 'array',
            'token_expires_at' => 'datetime',
            'last_error_at' => 'datetime',
            'connected_at' => 'datetime',
            'disconnected_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }
}
