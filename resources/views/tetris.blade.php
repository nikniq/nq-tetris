@extends('layouts.app')

@section('title', 'Tetris Game')

@section('content')
  <div id="tetris-container">
    <div id="side-left">
      <div class="panel">
        <h2>Hold</h2>
        <canvas id="hold" width="128" height="128"></canvas>
      </div>
      <div class="panel">
        <h2>Next</h2>
        <canvas id="next" width="128" height="128"></canvas>
      </div>
      <div class="panel keys">
        <h2>Keys</h2>
        <dl>
          <dt>← →</dt><dd>Move</dd>
          <dt>↑ / X</dt><dd>Rotate</dd>
          <dt>Z</dt><dd>Rotate back</dd>
          <dt>↓</dt><dd>Soft drop</dd>
          <dt>Space</dt><dd>Hard drop</dd>
          <dt>C</dt><dd>Hold</dd>
          <dt>P</dt><dd>Pause</dd>
        </dl>
      </div>
    </div>

    <div id="board-wrap">
      <canvas id="tetris" width="320" height="640"></canvas>
      <div id="overlay" class="overlay">
        <div class="overlay-box">
          <h2 id="overlay-title">TETRIS</h2>
          <p id="overlay-text">Press Start or hit Enter</p>
          <button id="overlay-btn" type="button">Start</button>
        </div>
      </div>
    </div>

    <div id="sidebar">
      <h1>TETRIS</h1>
      <div class="stats">
        <div class="stat"><span>Score</span><strong id="score">0</strong></div>
        <div class="stat"><span>Lines</span><strong id="lines">0</strong></div>
        <div class="stat"><span>Level</span><strong id="level">1</strong></div>
        <div class="stat"><span>Best</span><strong id="best">{{ $best?->score ?? 0 }}</strong></div>
      </div>
      <div class="controls">
        <button id="start-btn" type="button">Start</button>
        <button id="pause-btn" type="button" class="secondary">Pause</button>
      </div>

      @guest
        <p class="hint">
          <a href="{{ route('login') }}">Log in</a> or
          <a href="{{ route('register') }}">register</a> to save your scores.
        </p>
      @endguest
      <p id="save-status" class="hint" aria-live="polite"></p>

      <div class="panel leaderboard">
        <h2>Top 10</h2>
        @if ($leaderboard->isEmpty())
          <p class="hint">No scores yet. Be the first.</p>
        @else
          <ol>
            @foreach ($leaderboard as $entry)
              <li @class(['me' => $entry->user_id === auth()->id()])>
                <span class="name">{{ $entry->user->name }}</span>
                <span class="pts">{{ number_format($entry->score) }}</span>
              </li>
            @endforeach
          </ol>
        @endif
      </div>
    </div>
  </div>
@endsection

@push('scripts')
  <script>
    window.TETRIS = {
      authenticated: @json(auth()->check()),
      scoreUrl: @json(route('scores.store')),
      csrf: document.querySelector('meta[name="csrf-token"]').content,
    };
  </script>
  <script src="{{ asset('js/tetris.js') }}"></script>
@endpush
