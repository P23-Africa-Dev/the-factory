<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class Admin extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $table = 'admin_users';

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'is_active',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_active' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    public function canAccessAbility(string $ability): bool
    {
        if (! $this->is_active) {
            return false;
        }

        return match ($ability) {
            'view_dashboard' => true,
            'manage_users' => in_array($this->role, ['super_admin', 'admin', 'supervisor'], true),
            'manage_billing' => $this->role === 'super_admin',
            default => false,
        };
    }
}
