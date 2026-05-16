<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncState extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'device_id',
        'sync_type',
        'status',
        'progress',
        'error_message',
        'last_run_at',
        'next_run_at',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
        'last_run_at' => 'datetime',
        'next_run_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
