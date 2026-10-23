@extends('layouts.app')

@section('title', 'Set password · Tetris')

@section('content')
  <div class="auth-card">
    <h1>{{ $user->hasPassword() ? 'New password' : 'Choose a password' }}</h1>
    <p class="lead">Signed in as <strong>{{ $user->email }}</strong>. {{ $user->hasPassword() ? 'Enter the new password you want to use.' : 'This is what you will log in with from now on.' }}</p>

    <form method="POST" action="{{ route('password.set') }}">
      @csrf
      <label>
        Password <small>(at least 8 characters)</small>
        <input type="password" name="password" required autofocus autocomplete="new-password" />
      </label>
      @error('password') <p class="error">{{ $message }}</p> @enderror

      <label>
        Confirm password
        <input type="password" name="password_confirmation" required autocomplete="new-password" />
      </label>

      <button type="submit">Save password</button>
    </form>

    @if ($user->google_id)
      <p class="hint">You can also skip this and keep signing in with Google. <a href="{{ route('tetris') }}">Back to the game</a></p>
    @endif
  </div>
@endsection
