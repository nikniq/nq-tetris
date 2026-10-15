@extends('layouts.app')

@section('title', 'Register · Tetris')

@section('content')
  <div class="auth-card">
    <h1>Register</h1>
    <form method="POST" action="{{ route('register') }}">
      @csrf
      <label>
        Display name
        <input type="text" name="name" value="{{ old('name') }}" required autofocus maxlength="50" autocomplete="nickname" />
      </label>
      @error('name') <p class="error">{{ $message }}</p> @enderror

      <label>
        Email
        <input type="email" name="email" value="{{ old('email') }}" required autocomplete="email" />
      </label>
      @error('email') <p class="error">{{ $message }}</p> @enderror

      <label>
        Password <small>(at least 8 characters)</small>
        <input type="password" name="password" required autocomplete="new-password" />
      </label>
      @error('password') <p class="error">{{ $message }}</p> @enderror

      <label>
        Confirm password
        <input type="password" name="password_confirmation" required autocomplete="new-password" />
      </label>

      <button type="submit">Create account</button>
    </form>
    <p class="hint">Already registered? <a href="{{ route('login') }}">Log in</a></p>
  </div>
@endsection
