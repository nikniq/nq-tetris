<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="csrf-token" content="{{ csrf_token() }}" />
  <title>@yield('title', 'Tetris')</title>
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

  @stack('scripts')
</body>
</html>
