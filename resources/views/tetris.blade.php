<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tetris Game</title>
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
  <div id="tetris-container">
    <canvas id="tetris" width="320" height="640"></canvas>
    <div id="sidebar">
      <h1>TETRIS</h1>
      <div id="score">Score: 0</div>
      <div id="lines">Lines: 0</div>
      <button id="start-btn">Start</button>
      <button id="pause-btn">Pause</button>
    </div>
  </div>
  <script src="{{ asset('js/tetris.js') }}"></script>
</body>
</html>
