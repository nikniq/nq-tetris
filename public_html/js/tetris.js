// Tetris game logic and rendering
(() => {
  const canvas = document.getElementById('tetris');
  const ctx = canvas.getContext('2d');
  const holdCanvas = document.getElementById('hold');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nextCtx = nextCanvas.getContext('2d');

  const scoreElem = document.getElementById('score');
  const linesElem = document.getElementById('lines');
  const levelElem = document.getElementById('level');
  const bestElem = document.getElementById('best');
  const saveStatus = document.getElementById('save-status');
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const overlayBtn = document.getElementById('overlay-btn');

  const CONFIG = window.TETRIS || { authenticated: false };

  const COLS = 10;
  const ROWS = 20;
  const BLOCK_SIZE = 32;
  const PREVIEW_BLOCK = 24;
  const LINES_PER_LEVEL = 10;
  const LINE_SCORES = [0, 100, 300, 500, 800]; // 0..4 lines, scaled by level

  const COLORS = [
    null,
    '#00f0f0', // I
    '#0000f0', // J
    '#f0a000', // L
    '#f0f000', // O
    '#00f000', // S
    '#a000f0', // T
    '#f00000', // Z
  ];

  const SHAPES = [
    [],
    [
      [0,0,0,0],
      [1,1,1,1],
      [0,0,0,0],
      [0,0,0,0],
    ], // I
    [
      [2,0,0],
      [2,2,2],
      [0,0,0],
    ], // J
    [
      [0,0,3],
      [3,3,3],
      [0,0,0],
    ], // L
    [
      [4,4],
      [4,4],
    ], // O
    [
      [0,5,5],
      [5,5,0],
      [0,0,0],
    ], // S
    [
      [0,6,0],
      [6,6,6],
      [0,0,0],
    ], // T
    [
      [7,7,0],
      [0,7,7],
      [0,0,0],
    ], // Z
  ];

  // ---- state ----
  let board, piece, nextPiece, holdPiece, holdUsed;
  let score, lines, level;
  let running = false;   // a game is in progress (may be paused)
  let paused = false;
  let gameOver = false;
  let dropCounter = 0;
  let lastTime = 0;
  let bag = [];
  let best = parseInt(bestElem.textContent.replace(/\D/g, ''), 10) || 0;

  // ---- helpers ----
  function createMatrix(w, h) {
    const matrix = [];
    while (h--) matrix.push(new Array(w).fill(0));
    return matrix;
  }

  // 7-bag randomiser: every piece appears once per seven, so droughts of
  // the I piece can't go on forever.
  function nextTypeId() {
    if (bag.length === 0) {
      bag = [1, 2, 3, 4, 5, 6, 7];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  function makePiece(typeId) {
    const shape = SHAPES[typeId].map(row => row.slice());
    return {
      typeId,
      shape,
      x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
      y: 0,
    };
  }

  function dropIntervalFor(lvl) {
    // Classic-ish curve: 800ms at level 1, ~100ms by level 10, floor 60ms.
    return Math.max(60, Math.round(800 * Math.pow(0.82, lvl - 1)));
  }

  function merge(board, piece) {
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) board[y + piece.y][x + piece.x] = value;
      });
    });
  }

  function collide(board, piece) {
    for (let y = 0; y < piece.shape.length; ++y) {
      for (let x = 0; x < piece.shape[y].length; ++x) {
        if (!piece.shape[y][x]) continue;
        const by = y + piece.y;
        const bx = x + piece.x;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx] !== 0) return true;
      }
    }
    return false;
  }

  function rotateMatrix(matrix, dir) {
    const rotated = matrix[0].map((_, i) => matrix.map(row => row[i]));
    return dir > 0 ? rotated.map(row => row.reverse()) : rotated.reverse();
  }

  // Rotate with simple wall kicks: try in place, then one or two cells
  // either side, so pieces against a wall still turn.
  function rotatePiece(dir) {
    const rotated = rotateMatrix(piece.shape, dir);
    const kicks = [0, -1, 1, -2, 2];
    const original = piece.shape;
    const originalX = piece.x;
    piece.shape = rotated;
    for (const k of kicks) {
      piece.x = originalX + k;
      if (!collide(board, piece)) return;
    }
    piece.shape = original;
    piece.x = originalX;
  }

  function ghostY() {
    const probe = { ...piece, y: piece.y };
    while (!collide(board, probe)) probe.y++;
    return probe.y - 1;
  }

  // ---- drawing ----
  function drawCell(c, x, y, size, color, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(x * size, y * size, size, size);
    c.strokeStyle = '#23272e';
    c.lineWidth = 1;
    c.strokeRect(x * size + 0.5, y * size + 0.5, size - 1, size - 1);
    // small highlight for a bevelled look
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(x * size + 2, y * size + 2, size - 4, 3);
    c.globalAlpha = 1;
  }

  function drawMatrix(c, matrix, offset, size, alpha = 1) {
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) drawCell(c, x + offset.x, y + offset.y, size, COLORS[value], alpha);
      });
    });
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * BLOCK_SIZE + 0.5, 0);
      ctx.lineTo(x * BLOCK_SIZE + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * BLOCK_SIZE + 0.5);
      ctx.lineTo(canvas.width, y * BLOCK_SIZE + 0.5);
      ctx.stroke();
    }
  }

  function drawPreview(c, cv, p) {
    c.fillStyle = '#111';
    c.fillRect(0, 0, cv.width, cv.height);
    if (!p) return;
    // trim empty rows/cols so the piece sits centred
    const rows = p.shape.filter(r => r.some(v => v));
    const cols = p.shape[0].map((_, i) => p.shape.some(r => r[i])).reduce((a, v, i) => (v ? a.concat(i) : a), []);
    const w = cols.length, h = rows.length;
    const offX = (cv.width / PREVIEW_BLOCK - w) / 2 - cols[0];
    const offY = (cv.height / PREVIEW_BLOCK - h) / 2 - p.shape.findIndex(r => r.some(v => v));
    drawMatrix(c, p.shape, { x: offX, y: offY }, PREVIEW_BLOCK);
  }

  function draw() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawMatrix(ctx, board, { x: 0, y: 0 }, BLOCK_SIZE);
    if (piece && running) {
      drawMatrix(ctx, piece.shape, { x: piece.x, y: ghostY() }, BLOCK_SIZE, 0.22);
      drawMatrix(ctx, piece.shape, { x: piece.x, y: piece.y }, BLOCK_SIZE);
    }
    drawPreview(nextCtx, nextCanvas, nextPiece);
    drawPreview(holdCtx, holdCanvas, holdPiece);
  }

  function updateHud() {
    scoreElem.textContent = score.toLocaleString();
    linesElem.textContent = lines;
    levelElem.textContent = level;
    bestElem.textContent = Math.max(best, score).toLocaleString();
  }

  function showOverlay(title, text, btnLabel) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayBtn.textContent = btnLabel;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  // ---- game flow ----
  function spawn() {
    piece = nextPiece;
    nextPiece = makePiece(nextTypeId());
    holdUsed = false;
    if (collide(board, piece)) endGame();
  }

  function lockPiece() {
    merge(board, piece);
    const cleared = sweep();
    if (cleared) {
      lines += cleared;
      score += LINE_SCORES[cleared] * level;
      level = Math.floor(lines / LINES_PER_LEVEL) + 1;
    }
    updateHud();
    spawn();
    dropCounter = 0;
  }

  function sweep() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; --y) {
      if (board[y].every(v => v !== 0)) {
        board.splice(y, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++;
        y++;
      }
    }
    return cleared;
  }

  function softDrop() {
    piece.y++;
    if (collide(board, piece)) {
      piece.y--;
      lockPiece();
    } else {
      score += 1;
      updateHud();
    }
    dropCounter = 0;
  }

  function hardDrop() {
    const target = ghostY();
    score += (target - piece.y) * 2;
    piece.y = target;
    lockPiece();
  }

  function hold() {
    if (holdUsed) return;
    const current = makePiece(piece.typeId);
    if (holdPiece) {
      piece = makePiece(holdPiece.typeId);
      holdPiece = current;
    } else {
      holdPiece = current;
      piece = nextPiece;
      nextPiece = makePiece(nextTypeId());
    }
    holdUsed = true;
    if (collide(board, piece)) endGame();
  }

  function gravity() {
    piece.y++;
    if (collide(board, piece)) {
      piece.y--;
      lockPiece();
    }
    dropCounter = 0;
  }

  function update(time = 0) {
    if (!running || paused) return;
    const delta = time - lastTime;
    lastTime = time;
    dropCounter += delta;
    if (dropCounter > dropIntervalFor(level)) gravity();
    draw();
    requestAnimationFrame(update);
  }

  function startGame() {
    board = createMatrix(COLS, ROWS);
    bag = [];
    score = 0;
    lines = 0;
    level = 1;
    holdPiece = null;
    holdUsed = false;
    gameOver = false;
    paused = false;
    running = true;
    nextPiece = makePiece(nextTypeId());
    spawn();
    updateHud();
    saveStatus.textContent = '';
    saveStatus.className = 'hint';
    hideOverlay();
    pauseBtn.textContent = 'Pause';
    lastTime = performance.now();
    dropCounter = 0;
    requestAnimationFrame(update);
  }

  function togglePause() {
    if (!running || gameOver) return;
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    if (paused) {
      showOverlay('PAUSED', 'Press P or Resume to continue', 'Resume');
    } else {
      hideOverlay();
      lastTime = performance.now();
      requestAnimationFrame(update);
    }
  }

  function endGame() {
    running = false;
    gameOver = true;
    draw();
    const isBest = score > best;
    if (isBest) best = score;
    updateHud();
    showOverlay(
      'GAME OVER',
      `${score.toLocaleString()} points · ${lines} lines · level ${level}${isBest ? ' · New best!' : ''}`,
      'Play again'
    );
    submitScore();
  }

  async function submitScore() {
    if (!CONFIG.authenticated) {
      saveStatus.textContent = 'Log in to save this score.';
      return;
    }
    if (score === 0) return;
    saveStatus.textContent = 'Saving score…';
    saveStatus.className = 'hint';
    try {
      const res = await fetch(CONFIG.scoreUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-TOKEN': CONFIG.csrf,
        },
        credentials: 'same-origin',
        body: JSON.stringify({ score, lines, level }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      best = Math.max(best, data.best || 0);
      updateHud();
      saveStatus.textContent = data.is_best ? 'Saved — new personal best!' : 'Score saved.';
      saveStatus.className = 'hint ok';
    } catch (err) {
      saveStatus.textContent = 'Could not save score (' + err.message + ').';
      saveStatus.className = 'hint bad';
    }
  }

  // ---- input ----
  startBtn.onclick = startGame;
  pauseBtn.onclick = togglePause;
  overlayBtn.onclick = () => {
    if (paused) togglePause();
    else startGame();
  };

  document.addEventListener('keydown', e => {
    // don't fight with form inputs on the page
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

    if (e.key === 'Enter' && (!running || gameOver)) {
      e.preventDefault();
      startGame();
      return;
    }
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      e.preventDefault();
      togglePause();
      return;
    }
    if (!running || paused) return;

    switch (e.key) {
      case 'ArrowLeft':
        piece.x--;
        if (collide(board, piece)) piece.x++;
        break;
      case 'ArrowRight':
        piece.x++;
        if (collide(board, piece)) piece.x--;
        break;
      case 'ArrowDown':
        softDrop();
        break;
      case 'ArrowUp':
      case 'x':
      case 'X':
        rotatePiece(1);
        break;
      case 'z':
      case 'Z':
        rotatePiece(-1);
        break;
      case ' ':
        hardDrop();
        break;
      case 'c':
      case 'C':
      case 'Shift':
        hold();
        break;
      default:
        return;
    }
    e.preventDefault();
    draw();
  });

  // Pause automatically if the tab loses focus so a piece doesn't drop
  // through the floor while the player is away.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running && !paused) togglePause();
  });

  // ---- initial paint ----
  board = createMatrix(COLS, ROWS);
  score = 0; lines = 0; level = 1;
  updateHud();
  draw();
  showOverlay('TETRIS', 'Press Start or hit Enter', 'Start');
})();
