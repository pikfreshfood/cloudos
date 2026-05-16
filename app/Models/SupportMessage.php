<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportMessage extends Model
{
    protected $fillable = [
        'user_id',
        'device_id',
        'name',
        'email',
        'topic',
        'message',
        'status',
    ];

    public function user()
    {
        return $this->belongsTo(\App\Models\User::class);
    }

    public function device()
    {
        return $this->belongsTo(\App\Models\Device::class);
    }
}
