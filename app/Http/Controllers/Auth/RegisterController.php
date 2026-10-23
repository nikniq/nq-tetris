<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class RegisterController extends Controller
{
    public function create(): View
    {
        return view('auth.register');
    }

    /**
     * Step one of registration: take a name and email, send a confirmation
     * link. No password yet; that is chosen once the email is proven.
     */
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:50'],
            'email' => ['required', 'string', 'email', 'max:255'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if ($user === null) {
            $user = User::create(['name' => $data['name'], 'email' => $data['email']]);
            $user->sendAccountLink('verify');
        } elseif (! $user->hasVerifiedEmail()) {
            // Signed up before but never confirmed: refresh the name, resend.
            $user->update(['name' => $data['name']]);
            $user->sendAccountLink('verify');
        } else {
            // Already registered. Send a sign-in link instead of saying so,
            // so the form cannot be used to check which emails have accounts.
            $user->sendAccountLink('reset');
        }

        return redirect()->route('register.sent')->with('email', $data['email']);
    }

    public function sent(Request $request): View|RedirectResponse
    {
        if (! $request->session()->has('email')) {
            return redirect()->route('register');
        }

        return view('auth.sent', ['email' => $request->session()->get('email')]);
    }
}
