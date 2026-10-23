<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

class GoogleController extends Controller
{
    public static function enabled(): bool
    {
        return (bool) config('services.google.client_id');
    }

    public function redirect(): RedirectResponse
    {
        if (! self::enabled()) {
            return redirect()->route('login')->withErrors(['email' => 'Google sign-in is not set up on this server.']);
        }

        return Socialite::driver('google')->redirect();
    }

    public function callback(Request $request): RedirectResponse
    {
        if (! self::enabled()) {
            return redirect()->route('login');
        }

        try {
            $google = Socialite::driver('google')->user();
        } catch (Throwable) {
            return redirect()->route('login')->withErrors(['email' => 'Google sign-in was cancelled or failed. Please try again.']);
        }

        $email = $google->getEmail();
        $raw = $google->getRaw();
        $emailVerified = (bool) ($raw['email_verified'] ?? $raw['verified_email'] ?? false);

        if (! $email) {
            return redirect()->route('login')->withErrors(['email' => 'Google did not share an email address, so the account cannot be created.']);
        }

        // Linking a Google account from the account page.
        if ($current = $request->user()) {
            $taken = User::where('google_id', $google->getId())->where('id', '!=', $current->id)->exists();
            if ($taken) {
                return redirect()->route('account')->withErrors(['google' => 'That Google account is already linked to a different player.']);
            }
            $current->forceFill(['google_id' => $google->getId(), 'avatar' => $current->avatar ?? $google->getAvatar()])->save();

            return redirect()->route('account')->with('status', 'Google account linked.');
        }

        $user = User::where('google_id', $google->getId())->first();

        // Match an existing account by email only when Google vouches for
        // the address; otherwise anyone with a Google account could claim it.
        if ($user === null && $emailVerified) {
            $user = User::where('email', $email)->first();
            if ($user) {
                $user->forceFill([
                    'google_id' => $google->getId(),
                    'avatar' => $user->avatar ?? $google->getAvatar(),
                    'email_verified_at' => $user->email_verified_at ?? now(),
                ])->save();
            }
        }

        if ($user === null) {
            if (! $emailVerified) {
                return redirect()->route('login')->withErrors(['email' => 'Your Google email is not verified, so it cannot be used to sign in here.']);
            }
            if (User::where('email', $email)->exists()) {
                // Email is in use but the two accounts could not be matched.
                return redirect()->route('login')->withErrors(['email' => 'An account with this email already exists. Sign in with your password, then link Google from your account page.']);
            }
            $user = User::create([
                'name' => mb_substr($google->getName() ?: strstr($email, '@', true), 0, 50),
                'email' => $email,
                'google_id' => $google->getId(),
                'avatar' => $google->getAvatar(),
                'email_verified_at' => now(),
            ]);
        }

        Auth::login($user, true);
        $request->session()->regenerate();

        return redirect()->intended(route('tetris'));
    }
}
