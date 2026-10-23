<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;

/**
 * The one email this app sends: a signed link that proves the recipient
 * owns the address. It is used to finish registration ("verify") and to
 * regain access when a password is lost or was never set ("reset").
 */
class AccountLink extends Notification
{
    use Queueable;

    public const EXPIRES_MINUTES = 60;

    public function __construct(public string $purpose = 'verify') {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function url(object $notifiable): string
    {
        return URL::temporarySignedRoute(
            'account.link',
            now()->addMinutes(self::EXPIRES_MINUTES),
            ['user' => $notifiable->getKey(), 'hash' => $notifiable->linkHash(), 'purpose' => $this->purpose],
        );
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = $this->url($notifiable);
        $app = config('app.name');

        if ($this->purpose === 'reset') {
            return (new MailMessage)
                ->subject("Set your {$app} password")
                ->greeting("Hi {$notifiable->name},")
                ->line('Use the button below to choose a new password. The link works for one hour.')
                ->action('Set password', $url)
                ->line('If you did not ask for this, you can ignore this email. Your account stays as it is.');
        }

        return (new MailMessage)
            ->subject("Confirm your email for {$app}")
            ->greeting("Hi {$notifiable->name},")
            ->line('Confirm this address to finish creating your account. You will choose a password on the next page.')
            ->action('Confirm email', $url)
            ->line('The link works for one hour. If you did not sign up, you can ignore this email.');
    }
}
