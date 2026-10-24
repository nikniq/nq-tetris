@extends('layouts.app')

@section('title', $modes[$mode].' leaderboard · Tetris')

@php
  $fmtTime = fn (?int $ms) => $ms === null ? '—' : sprintf('%d:%05.2f', intdiv($ms, 60000), ($ms % 60000) / 1000);
  $value = fn ($row) => $mode === 'sprint' ? $fmtTime($row->duration_ms) : number_format($row->score);
@endphp

@section('content')
  <div class="page">
    <div class="card leaderboard full">
      <div class="card-head">
        <div>
          <h1 class="lb-title">Leaderboard</h1>
          <p class="hint">
            {{ $modes[$mode] }} · {{ $players }} {{ $players === 1 ? 'player' : 'players' }} ranked ·
            {{ $mode === 'sprint' ? 'fastest 40 lines' : 'highest score' }} · top {{ App\Http\Controllers\LeaderboardController::LIMIT }}
          </p>
        </div>
        <div class="tabs" role="tablist">
          @foreach ($modes as $key => $label)
            <a href="{{ route('leaderboard', $key === 'marathon' ? [] : ['mode' => $key]) }}" role="tab" class="tab" aria-selected="{{ $key === $mode ? 'true' : 'false' }}">{{ $label }}</a>
          @endforeach
        </div>
      </div>

      @auth
        <div class="my-rank">
          @if ($myRank)
            <span class="rank-badge">#{{ $myRank }}</span>
            <span>Your best: <strong>{{ $value($myRow) }}</strong>{{ $myRank > count($rows) ? ' · outside the top '.count($rows) : '' }}</span>
          @elseif ($mode === 'sprint')
            <span>Finish all 40 lines in Sprint to be ranked.</span>
          @else
            <span>No {{ $modes[$mode] }} result yet. <a href="{{ route('tetris') }}">Play a game</a> to get on the board.</span>
          @endif
        </div>
      @else
        <p class="hint my-rank"><a href="{{ route('login') }}">Log in</a> to see your own rank.</p>
      @endauth

      @if ($rows->isEmpty())
        <p class="hint">No results yet. <a href="{{ route('tetris') }}">Be the first.</a></p>
      @else
        <ol class="lb-rows">
          @foreach ($rows as $row)
            <li @class(['me' => $row->user_id === auth()->id()])>
              <span class="rank">{{ $loop->iteration }}</span>
              <span class="who-cell">
                @if ($row->user->avatar)
                  <img src="{{ $row->user->avatar }}" alt="" class="avatar tiny" referrerpolicy="no-referrer" />
                @endif
                <span class="name">{{ $row->user->name }}</span>
              </span>
              <span class="meta">{{ number_format($row->lines) }} lines · L{{ $row->level }}@if ($mode !== 'sprint' && $row->duration_ms) · {{ $fmtTime($row->duration_ms) }}@endif</span>
              <span class="pts">{{ $value($row) }}</span>
              <span class="when" title="{{ $row->created_at }}">{{ $row->created_at->diffForHumans(null, true, true) }}</span>
            </li>
          @endforeach
        </ol>
      @endif
    </div>
  </div>
@endsection
