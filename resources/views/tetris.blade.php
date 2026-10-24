@extends('layouts.app')

@section('title', 'Tetris Game')

@php
  $modeLabels = ['marathon' => 'Marathon', 'sprint' => 'Sprint 40', 'ultra' => 'Ultra 2:00'];
  $fmtTime = fn (?int $ms) => $ms === null ? '—' : sprintf('%d:%05.2f', intdiv($ms, 60000), ($ms % 60000) / 1000);
@endphp

@section('content')
  <div class="page">

    {{-- Playfield: previews | board | live stats. On phones the stats sit
         above the board and the previews beside it. --}}
    <section class="stage" aria-label="Game">
      <aside class="previews">
        <div class="panel">
          <h2>Hold</h2>
          <canvas id="hold" width="128" height="96" aria-hidden="true"></canvas>
        </div>
        <div class="panel">
          <h2>Next</h2>
          <canvas id="next" width="128" height="320" aria-hidden="true"></canvas>
        </div>
      </aside>

      <div id="board-wrap">
        <canvas id="tetris" width="320" height="640" role="img" aria-label="Tetris board"></canvas>
        <div id="combo" class="combo" aria-live="polite"></div>
        <div id="countdown" class="countdown" aria-hidden="true" hidden></div>
        <div id="overlay" class="overlay">
          <div class="overlay-box">
            <h2 id="overlay-title">TETRIS</h2>
            <p id="overlay-text">Pick a mode, then press Start or Enter</p>
            <dl id="summary" class="summary" hidden></dl>

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

            <div class="overlay-actions">
              <button id="overlay-btn" type="button">Start</button>
              <button id="overlay-alt" type="button" class="secondary" hidden>Resume</button>
            </div>
            <p class="overlay-hint"><kbd>Enter</kbd> start · <kbd>R</kbd> retry · <kbd>Esc</kbd> pause · <kbd>?</kbd> help</p>
          </div>
        </div>
      </div>

      <aside class="hud">
        <div class="stats">
          <div class="stat"><span>Score</span><strong id="score">0</strong></div>
          <div class="stat"><span>Lines</span><strong id="lines">0</strong></div>
          <div class="stat"><span>Level</span><strong id="level">1</strong></div>
          <div class="stat"><span id="time-label">Time</span><strong id="time">0:00</strong></div>
          <div class="stat wide"><span>Best<em> · <b id="best-mode">Marathon</b></em></span><strong id="best">{{ $bests['marathon']?->score ?? 0 }}</strong></div>
        </div>

        <div class="hud-actions">
          <div class="controls">
            <button id="start-btn" type="button">New game</button>
            <button id="pause-btn" type="button" class="secondary">Pause</button>
          </div>
          <div class="toolbar">
            <button id="mute-btn" type="button" class="secondary small" aria-pressed="false">🔊 Sound</button>
            <button id="settings-btn" type="button" class="secondary small" aria-haspopup="dialog">⚙ Settings</button>
            <button id="help-btn" type="button" class="secondary small" aria-haspopup="dialog">? Help</button>
          </div>
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
              <dt>P / Esc</dt><dd>Pause</dd>
              <dt>R</dt><dd>Retry</dd>
              <dt>M</dt><dd>Mute</dd>
              <dt>?</dt><dd>Help</dd>
            </dl>
          </div>
        </div>
      </aside>
    </section>

    <div id="touch" aria-label="Touch controls">
      <div class="row">
        <button type="button" data-action="hold" aria-label="Hold">Hold</button>
        <button type="button" data-action="ccw" aria-label="Rotate left">↺</button>
        <button type="button" data-action="cw" aria-label="Rotate right">↻</button>
        <button type="button" data-action="drop" aria-label="Hard drop">Drop</button>
      </div>
      <div class="row">
        <button type="button" data-action="left" aria-label="Move left">◀</button>
        <button type="button" data-action="down" aria-label="Soft drop">▼</button>
        <button type="button" data-action="right" aria-label="Move right">▶</button>
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
            <p class="board-note">Each player's best result is shown once. <a href="{{ route('leaderboard', $mode === 'marathon' ? [] : ['mode' => $mode]) }}">Full leaderboard</a></p>
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

  {{-- Settings --}}
  <dialog id="settings-dialog" class="dialog" aria-labelledby="settings-title">
    <form method="dialog">
      <h2 id="settings-title" class="dialog-title">Settings</h2>

      <fieldset>
        <legend>Display</legend>
        <label class="toggle"><input type="checkbox" id="set-ghost" /> Ghost piece <small>shows where the piece will land</small></label>
        <label class="toggle"><input type="checkbox" id="set-grid" /> Grid lines</label>
        <label class="toggle"><input type="checkbox" id="set-effects" /> Particles and screen shake</label>
        <label class="toggle"><input type="checkbox" id="set-countdown" /> 3-2-1 countdown before each game</label>
        <label class="range">
          <span>Next queue <output id="set-next-out"></output></span>
          <input type="range" id="set-next" min="1" max="6" step="1" />
        </label>
      </fieldset>

      <fieldset>
        <legend>Handling</legend>
        <label class="range">
          <span>Auto-repeat delay <output id="set-das-out"></output></span>
          <input type="range" id="set-das" min="50" max="300" step="10" />
          <small>How long to hold left or right before the piece starts sliding.</small>
        </label>
        <label class="range">
          <span>Auto-repeat speed <output id="set-arr-out"></output></span>
          <input type="range" id="set-arr" min="0" max="100" step="5" />
          <small>Time between steps while sliding. 0 moves straight to the wall.</small>
        </label>
        <label class="range">
          <span>Soft drop speed <output id="set-sdr-out"></output></span>
          <input type="range" id="set-sdr" min="0" max="60" step="5" />
          <small>Time per row while holding down. 0 drops to the floor without locking.</small>
        </label>
      </fieldset>

      <fieldset>
        <legend>Sound</legend>
        <label class="range">
          <span>Volume <output id="set-volume-out"></output></span>
          <input type="range" id="set-volume" min="0" max="100" step="5" />
        </label>
      </fieldset>

      <div class="dialog-actions">
        <button type="button" id="set-reset" class="secondary">Reset to defaults</button>
        <button value="close">Done</button>
      </div>
      <p class="hint">Settings are saved in this browser.</p>
    </form>
  </dialog>

  {{-- Help --}}
  <dialog id="help-dialog" class="dialog" aria-labelledby="help-title">
    <form method="dialog">
      <h2 id="help-title" class="dialog-title">How to play</h2>
      <p>Move and rotate the falling pieces to fill complete rows. Full rows clear and score points.</p>
      <p>Pieces enter from just above the board. The game ends when a new piece has no room to appear, or a piece locks entirely above the top edge. A red notch on the top edge marks a column stacked above the board.</p>

      <h3>Modes</h3>
      <dl class="help-list">
        <dt>Marathon</dt><dd>Endless. The speed rises every 10 lines, and from level 19 pieces land the moment they appear. Ranked by score.</dd>
        <dt>Sprint 40</dt><dd>Clear 40 lines as fast as possible. Ranked by time.</dd>
        <dt>Ultra 2:00</dt><dd>Two minutes to score as much as possible. Ranked by score.</dd>
      </dl>

      <h3>Controls</h3>
      <dl class="help-list keys-list">
        <dt>← →</dt><dd>Move. Hold to slide.</dd>
        <dt>↑ or X</dt><dd>Rotate clockwise</dd>
        <dt>Z</dt><dd>Rotate counter-clockwise</dd>
        <dt>↓</dt><dd>Soft drop, 1 point per row</dd>
        <dt>Space</dt><dd>Hard drop, 2 points per row</dd>
        <dt>C or Shift</dt><dd>Hold the piece for later, once per piece</dd>
        <dt>P or Esc</dt><dd>Pause</dd>
        <dt>R</dt><dd>Retry. Instant in Sprint and Ultra, asks first in Marathon.</dd>
        <dt>M</dt><dd>Mute</dd>
        <dt>Touch</dt><dd>Tap the board to rotate, swipe to move, flick down to drop</dd>
      </dl>

      <h3>Scoring</h3>
      <p class="hint">Every value is multiplied by the current level.</p>
      <table class="score-table">
        <tbody>
          <tr><th>Single · Double · Triple</th><td>100 · 300 · 500</td></tr>
          <tr><th>Tetris (4 lines)</th><td>800</td></tr>
          <tr><th>T-spin, 0 to 3 lines</th><td>400 · 800 · 1,200 · 1,600</td></tr>
          <tr><th>T-spin Mini, 0 to 2 lines</th><td>100 · 200 · 400</td></tr>
          <tr><th>Back-to-back Tetris or T-spin</th><td>× 1.5</td></tr>
          <tr><th>Combo, consecutive clears</th><td>+ 50 × combo</td></tr>
          <tr><th>Perfect clear, empty board</th><td>+ 800 to 2,000</td></tr>
        </tbody>
      </table>
      <p class="hint">A T-spin is a T piece rotated into a slot where three of its four corners are blocked.</p>

      <div class="dialog-actions">
        <button value="close">Got it</button>
      </div>
    </form>
  </dialog>
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
  <script src="{{ asset('js/tetris.js') }}?v={{ filemtime(public_path('js/tetris.js')) }}"></script>
@endpush
