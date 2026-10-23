<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class LoginController extends Controller
{
    public function create(): View
    {
        return view('auth.login');
    }

    public function store(Request $request): RedirectResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials, $request->boolean('remember'))) {
            $user = User::where('email', $credentials['email'])->first();

            // Tell a real account holder why a password cannot work, without
            // confirming to anyone else whether the address is registered.
            if ($user && ! $user->hasPassword() && $user->hasVerifiedEmail()) {
                throw ValidationException::withMessages([
                    'email' => $user->google_id
                        ? 'This account signs in with Google and has no password yet. Use "Continue with Google", or request a link to set one.'
                        : 'This account has no password yet. Request a link below to set one.',
                ]);
            }

            throw ValidationException::withMessages([
                'email' => 'These credentials do not match our records.',
            ]);
        }

        $request->session()->regenerate();

        return redirect()->intended(route('tetris'));
    }

    public function destroy(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('tetris');
    }
}
