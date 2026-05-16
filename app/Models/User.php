<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Storage;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected static function boot(): void
    {
        parent::boot();

        static::deleting(function (User $user) {
            $userUploadsPath = trim("uploads/{$user->id}", '/');
            $disk = Storage::disk('local');
            if ($disk->exists($userUploadsPath)) {
                $disk->deleteDirectory($userUploadsPath);
            }
        });
    }

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'username',
        'email',
        'profile_picture',
        'phone_number',
        'password',
    ];

    /**
     * The accessors to append to the model's array form.
     *
     * @var list<string>
     */
    protected $appends = [
        'initials',
        'avatar_url',
    ];

    public function getInitialsAttribute(): string
    {
        $nameParts = explode(' ', trim($this->name));
        $initials = '';
        foreach ($nameParts as $part) {
            if (trim($part) !== '') {
                $initials .= strtoupper(substr($part, 0, 1));
                if (strlen($initials) >= 2) break;
            }
        }
        return $initials ?: 'U';
    }

    public function getAvatarUrlAttribute(): ?string
    {
        if ($this->profile_picture) {
            return url('/storage/' . $this->profile_picture);
        }
        return null;
    }

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function friendships(): HasMany
    {
        return $this->hasMany(Friendship::class, 'user_id');
    }

    public function friendsWithMe(): HasMany
    {
        return $this->hasMany(Friendship::class, 'friend_id');
    }

    public function posts(): HasMany
    {
        return $this->hasMany(ChatPost::class);
    }
}
