@extends('layouts.app')

@section('title', 'Account · Tetris')

@section('content')
  <div class="auth-card account">
    <div class="account-head">
      @if ($user->avatar)
        <img src="{{ $user->avatar }}" alt="" class="avatar" referrerpolicy="no-referrer" />
      @else
        <div class="avatar initial">{{ mb_strtoupper(mb_substr($user->name, 0, 1)) }}</div>
      @endif
      <div>
        <h1>{{ $user->name }}</h1>
        <p class="hint">{{ $user->email }} · {{ $games }} {{ $games === 1 ? 'game' : 'games' }} played</p>
      </div>
    </div>

    @if ($errors->has('google'))
      <p class="error">{{ $errors->first('google') }}</p>
    @endif

    <section>
      <h2>Display name</h2>
      <form method="POST" action="{{ route('account.name') }}">
        @csrf
        <label>
          <input type="text" name="name" value="{{ old('name', $user->name) }}" required maxlength="50" autocomplete="nickname" />
        </label>
        @error('name') <p class="error">{{ $message }}</p> @enderror
        <button type="submit" class="secondary">Save name</button>
      </form>
    </section>

    <section>
      <h2>Password</h2>
      @if (! $user->hasPassword())
        <p class="hint">No password set. Add one to log in without Google.</p>
      @endif
      <form method="POST" action="{{ route('account.password') }}">
        @csrf
        @if ($user->hasPassword())
          <label>
            Current password
            <input type="password" name="current_password" required autocomplete="current-password" />
          </label>
          @error('current_password') <p class="error">{{ $message }}</p> @enderror
        @endif
        <label>
          New password <small>(at least 8 characters)</small>
          <input type="password" name="password" required autocomplete="new-password" />
        </label>
        @error('password') <p class="error">{{ $message }}</p> @enderror
        <label>
          Confirm new password
          <input type="password" name="password_confirmation" required autocomplete="new-password" />
        </label>
        <button type="submit" class="secondary">{{ $user->hasPassword() ? 'Change password' : 'Set password' }}</button>
      </form>
    </section>

    @if ($googleEnabled)
      <section>
        <h2>Google</h2>
        @if ($user->google_id)
          <p class="hint">Linked. You can sign in with Google.</p>
          <form method="POST" action="{{ route('account.google.unlink') }}">
            @csrf
            <button type="submit" class="secondary" @if (! $user->hasPassword()) disabled title="Set a password first" @endif>Unlink Google</button>
          </form>
          @unless ($user->hasPassword())
            <p class="hint">Set a password before unlinking, or you would have no way to sign in.</p>
          @endunless
        @else
          <p class="hint">Not linked. Link it to sign in with one click.</p>
          <a href="{{ route('google.redirect') }}" class="google-btn">Link Google account</a>
        @endif
      </section>
    @endif

    <section class="danger-zone">
      <h2>Delete account</h2>
      <p class="hint">Removes your account and every score you have saved. This cannot be undone.</p>
      <form method="POST" action="{{ route('account.destroy') }}" onsubmit="return confirm('Delete your account and all scores?');">
        @csrf
        @method('DELETE')
        @if ($user->hasPassword())
          <label>
            Current password
            <input type="password" name="current_password" required autocomplete="current-password" />
          </label>
          @error('current_password', 'default') @enderror
        @else
          <label>
            Type <strong>DELETE</strong> to confirm
            <input type="text" name="confirm" required autocomplete="off" />
          </label>
          @error('confirm') <p class="error">{{ $message }}</p> @enderror
        @endif
        <button type="submit" class="danger">Delete my account</button>
      </form>
    </section>
  </div>
@endsection
