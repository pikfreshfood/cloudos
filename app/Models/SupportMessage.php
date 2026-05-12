<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportMessage extends Model
{
    protected $fillable = [
        'name',
        'email',
        'topic',
        'message',
        'status',
    ];
}
