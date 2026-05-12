<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeveloperProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'developer_name',
        'company_name',
        'email',
        'password',
        'app_category',
        'app_summary',
        'test_api_key',
        'live_api_key',
        'status',
    ];

    protected $hidden = [
        'password',
        'test_api_key',
        'live_api_key',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'email_verified_at' => 'datetime',
        ];
    }

    public function apps(): HasMany
    {
        return $this->hasMany(DeveloperApp::class);
    }
}
