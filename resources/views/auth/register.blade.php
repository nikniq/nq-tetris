@extends('layouts.app')

@section('title', 'Register · Tetris')

@section('content')
  <div class="auth-card">
    <h1>Create account</h1>
    <p class="lead">We will email you a link to confirm your address. You choose a password after that.</p>

    @include('auth.partials.google', ['label' => 'Continue with Google'])

    <form method="POST" action="{{ route('register') }}">
      @csrf
      <label>
        Display name <small>(shown on the leaderboard)</small>
        <input type="text" name="name" value="{{ old('name') }}" required autofocus maxlength="50" autocomplete="nickname" />
      </label>
      @error('name') <p class="error">{{ $message }}</p> @enderror

      <label>
        Email
        <input type="email" name="email" value="{{ old('email') }}" required autocomplete="email" />
      </label>
      @error('email') <p class="error">{{ $message }}</p> @enderror

      <button type="submit">Send confirmation link</button>
    </form>
    <p class="hint">Already registered? <a href="{{ route('login') }}">Log in</a></p>
  </div>
@endsection
