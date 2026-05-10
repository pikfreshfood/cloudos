<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppUpdateSeen extends Model
{
    protected $fillable = [
        'app_update_id',
        'user_id',
        'action',
    ];

    protected $table = 'app_update_seen';

    public function appUpdate(): BelongsTo
    {
        return $this->belongsTo(AppUpdate::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
