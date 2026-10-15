<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="csrf-token" content="{{ csrf_token() }}" />
  <title>@yield('title', 'Tetris')</title>
  <link rel="stylesheet" href="{{ asset('css/style.css') }}" />
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
        <span class="who">{{ auth()->user()->name }}</span>
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
    <div class="flash">{{ session('status') }}</div>
  @endif

  <main>
    @yield('content')
  </main>

  @stack('scripts')
</body>
</html>
