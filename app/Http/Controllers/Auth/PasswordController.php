<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;
use Illuminate\View\View;

class PasswordController extends Controller
{
    /**
     * Choose a password right after an email link. The link already proved
     * ownership of the address, so no current password is asked for here.
     */
    public function create(Request $request): View
    {
        return view('auth.set-password', ['user' => $request->user()]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        $request->user()->forceFill(['password' => $data['password']])->save();

        return redirect()->route('tetris')->with('status', 'Password saved. You are all set.');
    }
}
