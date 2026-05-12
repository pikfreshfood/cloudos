<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppStoreReview extends Model
{
    use HasFactory;

    protected $fillable = [
        'developer_app_id',
        'user_id',
        'device_id',
        'rating',
        'comment',
    ];

    public function app(): BelongsTo
    {
        return $this->belongsTo(DeveloperApp::class, 'developer_app_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
