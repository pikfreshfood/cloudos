<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class AppUpdate extends Model
{
    protected $fillable = [
        'title',
        'message',
        'status',
        'version_code',
    ];

    public function seenByUsers(): HasMany
    {
        return $this->hasMany(AppUpdateSeen::class);
    }
}
