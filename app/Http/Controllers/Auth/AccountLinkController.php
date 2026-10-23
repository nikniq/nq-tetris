<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

/**
 * Handles the signed links sent by email: confirming an address, and
 * "forgot password" requests.
 */
class AccountLinkController extends Controller
{
    /**
     * The link from the email. The route is signed, so an altered or expired
     * URL never reaches here. The hash ties the link to the email/password
     * pair at the time it was sent, so it dies once a password is set.
     */
    public function consume(Request $request, User $user, string $hash): RedirectResponse
    {
        if (! hash_equals($user->linkHash(), $hash)) {
            return redirect()->route('login')->withErrors([
                'email' => 'That link has already been used or is no longer valid. Request a new one below.',
            ]);
        }

        if (! $user->hasVerifiedEmail()) {
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        Auth::login($user);
        $request->session()->regenerate();

        $message = $request->query('purpose') === 'reset'
            ? 'You are signed in. Choose a new password to finish.'
            : 'Email confirmed. Choose a password to finish setting up your account.';

        return redirect()->route('password.set')->with('status', $message);
    }

    public function forgotForm(): View
    {
        return view('auth.forgot');
    }

    /**
     * Always answers the same way, whether or not the address is known.
     */
    public function forgot(Request $request): RedirectResponse
    {
        $data = $request->validate(['email' => ['required', 'string', 'email']]);

        if ($user = User::where('email', $data['email'])->first()) {
            $user->sendAccountLink('reset');
        }

        return redirect()->route('register.sent')->with('email', $data['email']);
    }
}
