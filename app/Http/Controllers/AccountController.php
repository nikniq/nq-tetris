<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Auth\GoogleController;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;
use Illuminate\View\View;

class AccountController extends Controller
{
    public function show(Request $request): View
    {
        $user = $request->user();

        return view('account', [
            'user' => $user,
            'googleEnabled' => GoogleController::enabled(),
            'games' => $user->scores()->count(),
        ]);
    }

    public function updateName(Request $request): RedirectResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:50']]);
        $request->user()->update($data);

        return redirect()->route('account')->with('status', 'Display name updated.');
    }

    public function updatePassword(Request $request): RedirectResponse
    {
        $user = $request->user();

        $rules = ['password' => ['required', 'confirmed', Password::min(8)]];
        if ($user->hasPassword()) {
            $rules['current_password'] = ['required', 'current_password'];
        }
        $data = $request->validate($rules);

        $user->forceFill(['password' => $data['password']])->save();

        return redirect()->route('account')->with('status', $user->wasChanged('password') ? 'Password updated.' : 'Password saved.');
    }

    public function unlinkGoogle(Request $request): RedirectResponse
    {
        $user = $request->user();

        if (! $user->hasPassword()) {
            return redirect()->route('account')->withErrors(['google' => 'Set a password first, or you would have no way to sign in.']);
        }

        $user->forceFill(['google_id' => null])->save();

        return redirect()->route('account')->with('status', 'Google account unlinked.');
    }

    public function destroy(Request $request): RedirectResponse
    {
        $user = $request->user();

        if ($user->hasPassword()) {
            $request->validate(['current_password' => ['required', 'current_password']]);
        } else {
            $request->validate(['confirm' => ['required', 'in:DELETE']]);
        }

        auth()->logout();
        $user->delete(); // scores cascade
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('tetris')->with('status', 'Your account and scores have been deleted.');
    }
}
