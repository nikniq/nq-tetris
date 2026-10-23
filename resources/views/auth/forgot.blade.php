@extends('layouts.app')

@section('title', 'Forgot password · Tetris')

@section('content')
  <div class="auth-card">
    <h1>Forgot password</h1>
    <p class="lead">Enter your email and we will send a link that signs you in and lets you choose a new password.</p>

    <form method="POST" action="{{ route('password.forgot') }}">
      @csrf
      <label>
        Email
        <input type="email" name="email" value="{{ old('email') }}" required autofocus autocomplete="email" />
      </label>
      @error('email') <p class="error">{{ $message }}</p> @enderror

      <button type="submit">Send link</button>
    </form>
    <p class="hint"><a href="{{ route('login') }}">Back to log in</a></p>
  </div>
@endsection
