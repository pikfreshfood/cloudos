<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeveloperApp extends Model
{
    use HasFactory;

    protected $fillable = [
        'developer_profile_id',
        'app_name',
        'app_description',
        'app_icon_path',
        'screenshots',
        'app_icon_size_bytes',
        'app_url',
        'environment',
        'status',
        'admin_note',
        'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'screenshots' => 'array',
            'approved_at' => 'datetime',
        ];
    }

    public function developer(): BelongsTo
    {
        return $this->belongsTo(DeveloperProfile::class, 'developer_profile_id');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(AppStoreReview::class);
    }
}
