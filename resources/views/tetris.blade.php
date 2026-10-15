@extends('layouts.app')

@section('title', 'Tetris Game')

@php
  $modeLabels = ['marathon' => 'Marathon', 'sprint' => 'Sprint 40', 'ultra' => 'Ultra 2:00'];
  $fmtTime = fn (?int $ms) => $ms === null ? '—' : sprintf('%d:%05.2f', intdiv($ms, 60000), ($ms % 60000) / 1000);
@endphp

@section('content')
  <div class="page">

    {{-- The playfield: previews | board | live stats, all sized to the board --}}
    <section class="stage" aria-label="Game">
      <aside class="col previews">
        <div class="panel">
          <h2>Hold</h2>
          <canvas id="hold" width="128" height="96"></canvas>
        </div>
        <div class="panel">
          <h2>Next</h2>
          <canvas id="next" width="128" height="288"></canvas>
        </div>
      </aside>

      <div id="board-wrap">
        <canvas id="tetris" width="320" height="640"></canvas>
        <div id="combo" class="combo" aria-live="polite"></div>
        <div id="overlay" class="overlay">
          <div class="overlay-box">
            <h2 id="overlay-title">TETRIS</h2>
            <p id="overlay-text">Pick a mode, then press Start or Enter</p>

            <div id="setup">
              <div class="modes" role="radiogroup" aria-label="Game mode">
                @foreach ($modeLabels as $key => $label)
                  <label class="mode">
                    <input type="radio" name="mode" value="{{ $key }}" {{ $key === 'marathon' ? 'checked' : '' }} />
                    <span>{{ $label }}</span>
                  </label>
                @endforeach
              </div>
              <p class="mode-help" id="mode-help">Endless. Speed rises every 10 lines.</p>
              <label class="level-pick">
                Start level
                <select id="start-level">
                  @for ($i = 1; $i <= 15; $i++)
                    <option value="{{ $i }}">{{ $i }}</option>
                  @endfor
                </select>
              </label>
            </div>

            <button id="overlay-btn" type="button">Start</button>
          </div>
        </div>
      </div>

      <aside class="col hud">
        <div class="stats">
          <div class="stat"><span>Score</span><strong id="score">0</strong></div>
          <div class="stat"><span>Lines</span><strong id="lines">0</strong></div>
          <div class="stat"><span>Level</span><strong id="level">1</strong></div>
          <div class="stat"><span id="time-label">Time</span><strong id="time">0:00</strong></div>
          <div class="stat wide"><span>Best · <em id="best-mode">Marathon</em></span><strong id="best">{{ $bests['marathon']?->score ?? 0 }}</strong></div>
        </div>
        <div class="controls">
          <button id="start-btn" type="button">Start</button>
          <button id="pause-btn" type="button" class="secondary">Pause</button>
        </div>
        <button id="mute-btn" type="button" class="secondary small" aria-pressed="false">🔊 Sound on</button>
        <p id="save-status" class="hint" aria-live="polite"></p>
        @guest
          <p class="hint">
            <a href="{{ route('login') }}">Log in</a> or
            <a href="{{ route('register') }}">register</a> to save your results.
          </p>
        @endguest

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
            <dt>M</dt><dd>Mute</dd>
          </dl>
        </div>
      </aside>
    </section>

    <div id="touch" aria-label="Touch controls">
      <div class="row">
        <button type="button" data-action="hold">Hold</button>
        <button type="button" data-action="ccw">↺</button>
        <button type="button" data-action="cw">↻</button>
        <button type="button" data-action="drop">Drop</button>
      </div>
      <div class="row">
        <button type="button" data-action="left">◀</button>
        <button type="button" data-action="down">▼</button>
        <button type="button" data-action="right">▶</button>
      </div>
    </div>

    {{-- Records: leaderboard and the player's own numbers --}}
    <section class="records" aria-label="Records">
      <div class="card leaderboard">
        <div class="card-head">
          <h2>Top 10</h2>
          <div class="tabs" role="tablist">
            @foreach ($modeLabels as $key => $label)
              <button type="button" role="tab" class="tab" data-tab="{{ $key }}" aria-selected="{{ $key === 'marathon' ? 'true' : 'false' }}">{{ $label }}</button>
            @endforeach
          </div>
        </div>
        @foreach ($leaderboards as $mode => $rows)
          <div class="board" data-board="{{ $mode }}" @if ($mode !== 'marathon') hidden @endif>
            @if ($rows->isEmpty())
              <p class="hint">No {{ strtolower($modeLabels[$mode]) }} results yet. Be the first.</p>
            @else
              <ol>
                @foreach ($rows as $entry)
                  <li @class(['me' => $entry->user_id === auth()->id()])>
                    <span class="rank">{{ $loop->iteration }}</span>
                    <span class="name">{{ $entry->user->name }}</span>
                    <span class="meta">{{ $entry->lines }} lines · L{{ $entry->level }}</span>
                    <span class="pts">{{ $mode === 'sprint' ? $fmtTime($entry->duration_ms) : number_format($entry->score) }}</span>
                  </li>
                @endforeach
              </ol>
            @endif
          </div>
        @endforeach
      </div>

      <div class="card mystats">
        <div class="card-head"><h2>Your stats</h2></div>
        @auth
          <dl>
            <dt>Games</dt><dd>{{ number_format($stats['games']) }}</dd>
            <dt>Total lines</dt><dd>{{ number_format($stats['lines']) }}</dd>
            <dt>Top level</dt><dd>{{ $stats['level'] }}</dd>
            <dt>Average score</dt><dd>{{ number_format($stats['average']) }}</dd>
            <dt>Best marathon</dt><dd>{{ number_format($bests['marathon']?->score ?? 0) }}</dd>
            <dt>Best sprint</dt><dd>{{ $fmtTime($bests['sprint']?->duration_ms) }}</dd>
            <dt>Best ultra</dt><dd>{{ number_format($bests['ultra']?->score ?? 0) }}</dd>
          </dl>
        @else
          <p class="hint">
            <a href="{{ route('register') }}">Create an account</a> to track your games,
            keep a personal best per mode and appear on the leaderboard.
          </p>
        @endauth
      </div>
    </section>

  </div>
@endsection

@push('scripts')
  <script>
    window.TETRIS = {
      authenticated: @json(auth()->check()),
      scoreUrl: @json(route('scores.store')),
      csrf: document.querySelector('meta[name="csrf-token"]').content,
      bests: @json(collect($bests)->map(fn ($s) => $s ? ['score' => $s->score, 'duration_ms' => $s->duration_ms] : null)),
    };
  </script>
  <script src="{{ asset('js/tetris.js') }}"></script>
@endpush
