<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="csrf-token" content="{{ csrf_token() }}" />
  <title>@yield('title', 'Tetris')</title>
  <meta name="theme-color" content="#15171a" />
  <link rel="icon" href="{{ asset('favicon.ico') }}" sizes="48x48" />
  <link rel="icon" href="{{ asset('favicon.svg') }}" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="{{ asset('apple-touch-icon.png') }}" />
  <link rel="manifest" href="{{ asset('manifest.webmanifest') }}" />
  <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}" />
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-34RWEG01MV"></script>
  <script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-34RWEG01MV');
  </script>
  <!-- End Google Analytics -->
</head>
<body>
  <header id="topbar">
    <a href="{{ route('tetris') }}" class="brand">TETRIS</a>
    <nav>
      <a href="{{ route('leaderboard') }}" @class(['active' => request()->routeIs('leaderboard')])>Leaderboard</a>
      @auth
        <a href="{{ route('account') }}" class="who" title="Account">
          @if (auth()->user()->avatar)
            <img src="{{ auth()->user()->avatar }}" alt="" class="avatar tiny" referrerpolicy="no-referrer" />
          @endif
          {{ auth()->user()->name }}
        </a>
        <form method="POST" action="{{ route('logout') }}" class="inline">
          @csrf
          <button type="submit" class="link">Log out</button>
        </form>
      @else
        <a href="{{ route('login') }}">Log in</a>
        <a href="{{ route('register') }}" class="cta">Register</a>
      @endauth
    </nav>
  </header>

  @if (session('status'))
    <div class="flash" role="status">{{ session('status') }}</div>
  @endif

  @auth
    @if (! auth()->user()->hasPassword() && ! request()->routeIs('password.set', 'account'))
      <div class="flash notice">
        You have not set a password yet.
        <a href="{{ route('password.set') }}">Set one now</a> so you can log in without an email link{{ auth()->user()->google_id ? ' or Google' : '' }}.
      </div>
    @endif
  @endauth

  <main>
    @yield('content')
  </main>

  <script>
    // Show/hide toggle on every password field.
    document.querySelectorAll('input[type="password"]').forEach(function (input) {
      var wrap = document.createElement('span');
      wrap.className = 'pw-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pw-toggle';
      btn.textContent = 'Show';
      btn.setAttribute('aria-label', 'Show password');
      btn.addEventListener('click', function () {
        var hidden = input.type === 'password';
        input.type = hidden ? 'text' : 'password';
        btn.textContent = hidden ? 'Hide' : 'Show';
        btn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
      });
      wrap.appendChild(btn);
    });
    // Status messages can be dismissed, and fade on their own after a while.
    document.querySelectorAll('.flash[role="status"]').forEach(function (flash) {
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'flash-close';
      close.setAttribute('aria-label', 'Dismiss');
      close.textContent = '×';
      close.addEventListener('click', function () { flash.remove(); });
      flash.appendChild(close);
      setTimeout(function () { flash.classList.add('fade'); }, 8000);
    });
  </script>
  @stack('scripts')
</body>
</html>
