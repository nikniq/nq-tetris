@extends('layouts.app')

@section('title', 'Two Player · Tetris')

@section('content')
  <div class="page vs-page">
    <section id="versus" class="vs-stage" aria-label="Two player game">
      @foreach ([1 => 'Player 1', 2 => 'Player 2'] as $n => $name)
        <div class="vs-player" id="p{{ $n }}">
          <div class="vs-head">
            <h2>{{ $name }}</h2>
            <span class="vs-wins" aria-label="Rounds won">○○○</span>
          </div>
          <div class="vs-field">
            <div class="vs-side">
              <span class="vs-label">Hold</span>
              <canvas class="vs-hold" aria-hidden="true"></canvas>
              <span class="vs-label">Next</span>
              <canvas class="vs-next" aria-hidden="true"></canvas>
              <dl class="vs-stats">
                <dt>Sent</dt><dd class="vs-sent">0</dd>
                <dt>Lines</dt><dd class="vs-lines">0</dd>
              </dl>
            </div>
            <div class="vs-meter" title="Incoming garbage"><i></i></div>
            <div class="vs-board-wrap">
              <canvas class="vs-board" role="img" aria-label="{{ $name }} board"></canvas>
              <div class="vs-banner" aria-live="polite"></div>
            </div>
          </div>
          <dl class="vs-keys">
            @if ($n === 1)
              <dt>A D</dt><dd>Move</dd>
              <dt>W</dt><dd>Rotate</dd>
              <dt>Q</dt><dd>Rotate back</dd>
              <dt>S</dt><dd>Soft drop</dd>
              <dt>Space</dt><dd>Hard drop</dd>
              <dt>E</dt><dd>Hold</dd>
            @else
              <dt>← →</dt><dd>Move</dd>
              <dt>↑</dt><dd>Rotate</dd>
              <dt>/</dt><dd>Rotate back</dd>
              <dt>↓</dt><dd>Soft drop</dd>
              <dt>Enter</dt><dd>Hard drop</dd>
              <dt>Right Shift</dt><dd>Hold</dd>
            @endif
          </dl>
        </div>
      @endforeach

      <div id="vs-countdown" class="vs-countdown" aria-hidden="true" hidden></div>
      <div id="vs-overlay" class="vs-overlay">
        <div class="overlay-box">
          <h2 id="vs-title">TWO PLAYER</h2>
          <p id="vs-text">First to 3 rounds. Clear lines to send garbage.</p>
          <div id="vs-options">
            <div class="modes" role="radiogroup" aria-label="Opponent">
              @foreach (['human' => '2 Players', 'easy' => 'CPU Easy', 'normal' => 'CPU Normal', 'hard' => 'CPU Hard'] as $key => $label)
                <label class="mode">
                  <input type="radio" name="opponent" value="{{ $key }}" {{ $key === 'human' ? 'checked' : '' }} />
                  <span>{{ $label }}</span>
                </label>
              @endforeach
            </div>
          </div>
          <div class="overlay-actions"><button id="vs-start" type="button">Start match</button></div>
          <p class="overlay-hint"><kbd>P</kbd> or <kbd>Esc</kbd> pause · <kbd>M</kbd> mute</p>
        </div>
      </div>
    </section>

    <div class="card vs-rules">
      <div class="card-head"><h2>How versus works</h2></div>
      <ul>
        <li>Both players get the same pieces in the same order.</li>
        <li>Clearing two, three or four lines sends one, two or four garbage lines to the other board. Back-to-back Tetrises and combos send more.</li>
        <li>Incoming garbage waits in the red meter beside your board. Clearing lines cancels it. If you place a piece without clearing, it rises.</li>
        <li>The speed increases every 20 seconds. Whoever tops out loses the round. First to three rounds wins the match.</li>
      </ul>
      <p class="hint">No second player? Pick a CPU level on the start screen and play the computer. Against the computer you can use either set of keys.</p>
      <p class="hint" id="vs-pads">Two controllers work too: the first is Player 1, the second is Player 2. Some keyboards cannot register many keys at once; if moves get dropped, use a controller for one player.</p>
      <p class="hint vs-small-note">This mode needs a keyboard or controllers, and works best on a wide screen.</p>
    </div>
  </div>
@endsection

@push('scripts')
  <script src="{{ asset('js/versus.js') }}?v={{ filemtime(public_path('js/versus.js')) }}"></script>
@endpush
