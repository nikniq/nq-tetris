@extends('layouts.app')

@section('title', 'Check your email · Tetris')

@section('content')
  <div class="auth-card">
    <h1>Check your email</h1>
    <p class="lead">If <strong>{{ $email }}</strong> can be used here, a link is on its way. Open it to continue. It works for one hour.</p>
    <p class="hint">Nothing arrived? Check your spam folder, or <a href="{{ route('register') }}">try again</a> with the right address.</p>
    <p class="hint"><a href="{{ route('tetris') }}">Back to the game</a></p>
  </div>
@endsection
