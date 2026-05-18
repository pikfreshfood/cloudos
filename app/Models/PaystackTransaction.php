<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaystackTransaction extends Model
{
    protected $fillable = [
        'reference',
        'email',
        'user_id',
        'device_id',
        'device_name',
        'storage_mb',
        'billing_period',
        'amount_kobo',
        'status',
        'authorization_url',
        'access_code',
        'callback_url',
        'metadata',
        'verified_payload',
        'paid_at',
        'storage_expires_at',
    ];

    protected $casts = [
        'metadata' => 'array',
        'verified_payload' => 'array',
        'paid_at' => 'datetime',
        'storage_expires_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
