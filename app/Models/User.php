<?php

namespace App\Models;

use App\Notifications\AccountLink;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'google_id', 'avatar', 'email_verified_at'])]
#[Hidden(['password', 'remember_token', 'google_id'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    public function scores(): HasMany
    {
        return $this->hasMany(Score::class);
    }

    public function hasPassword(): bool
    {
        return $this->password !== null;
    }

    public function hasVerifiedEmail(): bool
    {
        return $this->email_verified_at !== null;
    }

    /**
     * Token embedded in email links. It changes whenever the email or the
     * password changes, so a link stops working once it has done its job.
     */
    public function linkHash(): string
    {
        return hash_hmac('sha256', $this->email.'|'.($this->password ?? ''), config('app.key'));
    }

    public function sendAccountLink(string $purpose): void
    {
        $this->notify(new AccountLink($purpose));
    }

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
}
