// Tetris game logic and rendering
(() => {
  const $ = id => document.getElementById(id);

  const canvas = $('tetris');
  const ctx = canvas.getContext('2d');
  const holdCtx = $('hold').getContext('2d');
  const nextCtx = $('next').getContext('2d');

  const scoreElem = $('score');
  const linesElem = $('lines');
  const levelElem = $('level');
  const bestElem = $('best');
  const saveStatus = $('save-status');
  const startBtn = $('start-btn');
  const pauseBtn = $('pause-btn');
  const muteBtn = $('mute-btn');
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');
  const overlayBtn = $('overlay-btn');
  const comboElem = $('combo');

  const CONFIG = window.TETRIS || { authenticated: false };

  const COLS = 10;
  const ROWS = 20;
  const BLOCK_SIZE = 32;
  const PREVIEW_BLOCK = 24;
  const LINES_PER_LEVEL = 10;
  const LINE_SCORES = [0, 100, 300, 500, 800]; // 0..4 lines, scaled by level

  // Feel
  const DAS = 170;          // ms before a held left/right starts repeating
  const ARR = 40;           // ms between repeats once it has started
  const SOFT_DROP_RATE = 45;
  const LOCK_DELAY = 500;   // ms a piece can rest before it locks
  const LOCK_RESETS = 15;   // moves/rotates that may postpone the lock
  const CLEAR_FLASH = 220;  // ms the cleared rows flash before collapsing

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

  // ---- sound (synthesised, no files to load) ----
  const sound = (() => {
    let actx = null;
    let muted = false;
    try { muted = localStorage.getItem('tetris.muted') === '1'; } catch (_) {}

    function ensure() {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }

    function tone(freq, dur, type = 'square', gain = 0.05, slide = 0) {
      if (muted) return;
      const a = ensure();
      if (!a) return;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, a.currentTime);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
      g.gain.setValueAtTime(gain, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      osc.connect(g).connect(a.destination);
      osc.start();
      osc.stop(a.currentTime + dur);
    }

    return {
      move:   () => tone(220, 0.04, 'square', 0.03),
      rotate: () => tone(330, 0.05, 'triangle', 0.04),
      lock:   () => tone(140, 0.08, 'square', 0.05, -60),
      drop:   () => tone(110, 0.1, 'sawtooth', 0.05, -70),
      hold:   () => tone(440, 0.06, 'triangle', 0.04),
      clear:  n => { for (let i = 0; i < n; i++) setTimeout(() => tone(520 + i * 120, 0.12, 'square', 0.05), i * 60); },
      tetris: () => { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'square', 0.06), i * 70)); },
      level:  () => { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.06), i * 90)); },
      over:   () => { [400, 300, 200, 120].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.06, -40), i * 160)); },
      unlock: ensure,
      get muted() { return muted; },
      toggle() {
        muted = !muted;
        try { localStorage.setItem('tetris.muted', muted ? '1' : '0'); } catch (_) {}
        return muted;
      },
    };
  })();

  // ---- state ----
  let board, piece, nextPiece, holdPiece, holdUsed;
  let score, lines, level, combo, backToBack;
  let running = false;   // a game is in progress (may be paused)
  let paused = false;
  let gameOver = false;
  let clearing = null;   // { rows: [...], until: ts } while rows flash
  let dropCounter = 0;
  let lastTime = 0;
  let bag = [];
  let lockTimer = 0;     // ms the piece has rested on something
  let lockResets = 0;
  let best = parseInt(bestElem.textContent.replace(/\D/g, ''), 10) || 0;

  // Guests keep a best score in this browser; players get theirs from the server.
  if (!CONFIG.authenticated) {
    try { best = Math.max(best, parseInt(localStorage.getItem('tetris.best') || '0', 10) || 0); } catch (_) {}
  }

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
        if (value && y + piece.y >= 0) board[y + piece.y][x + piece.x] = value;
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

  function grounded() {
    piece.y++;
    const g = collide(board, piece);
    piece.y--;
    return g;
  }

  function rotateMatrix(matrix, dir) {
    const rotated = matrix[0].map((_, i) => matrix.map(row => row[i]));
    return dir > 0 ? rotated.map(row => row.reverse()) : rotated.reverse();
  }

  // A successful move or rotate while resting gives the player a little more
  // time, up to a cap so a piece can't be kept alive forever.
  function touchLock() {
    if (grounded() && lockResets < LOCK_RESETS) {
      lockTimer = 0;
      lockResets++;
    }
  }

  // Rotate with simple wall kicks: try in place, then one or two cells
  // either side, then one up, so pieces against a wall or floor still turn.
  function rotatePiece(dir) {
    if (piece.typeId === 4) return; // O never changes
    const rotated = rotateMatrix(piece.shape, dir);
    const kicks = [[0,0], [-1,0], [1,0], [-2,0], [2,0], [0,-1], [-1,-1], [1,-1]];
    const original = piece.shape;
    const ox = piece.x, oy = piece.y;
    piece.shape = rotated;
    for (const [kx, ky] of kicks) {
      piece.x = ox + kx;
      piece.y = oy + ky;
      if (!collide(board, piece)) { sound.rotate(); touchLock(); return true; }
    }
    piece.shape = original;
    piece.x = ox;
    piece.y = oy;
    return false;
  }

  function move(dx) {
    piece.x += dx;
    if (collide(board, piece)) { piece.x -= dx; return false; }
    sound.move();
    touchLock();
    return true;
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

  function drawPreview(c, p) {
    const cv = c.canvas;
    c.fillStyle = '#111';
    c.fillRect(0, 0, cv.width, cv.height);
    if (!p) return;
    const rows = p.shape.filter(r => r.some(v => v));
    const cols = p.shape[0].map((_, i) => p.shape.some(r => r[i])).reduce((a, v, i) => (v ? a.concat(i) : a), []);
    const w = cols.length, h = rows.length;
    const offX = (cv.width / PREVIEW_BLOCK - w) / 2 - cols[0];
    const offY = (cv.height / PREVIEW_BLOCK - h) / 2 - p.shape.findIndex(r => r.some(v => v));
    drawMatrix(c, p.shape, { x: offX, y: offY }, PREVIEW_BLOCK);
  }

  function draw(now = performance.now()) {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawMatrix(ctx, board, { x: 0, y: 0 }, BLOCK_SIZE);

    if (clearing) {
      // Flash the full rows white/transparent at ~12Hz until they collapse.
      const on = Math.floor((clearing.until - now) / 40) % 2 === 0;
      ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)';
      for (const y of clearing.rows) ctx.fillRect(0, y * BLOCK_SIZE, canvas.width, BLOCK_SIZE);
    } else if (piece && running) {
      drawMatrix(ctx, piece.shape, { x: piece.x, y: ghostY() }, BLOCK_SIZE, 0.22);
      // Fade slightly as the lock timer runs down so the player can feel it.
      const alpha = grounded() ? 1 - 0.35 * (lockTimer / LOCK_DELAY) : 1;
      drawMatrix(ctx, piece.shape, { x: piece.x, y: piece.y }, BLOCK_SIZE, alpha);
    }

    drawPreview(nextCtx, nextPiece);
    drawPreview(holdCtx, holdPiece);
  }

  function updateHud() {
    scoreElem.textContent = score.toLocaleString();
    linesElem.textContent = lines;
    levelElem.textContent = level;
    bestElem.textContent = Math.max(best, score).toLocaleString();
  }

  let comboTimer = null;
  function flashCombo(text) {
    comboElem.textContent = text;
    comboElem.classList.add('show');
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => comboElem.classList.remove('show'), 1200);
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
    lockTimer = 0;
    lockResets = 0;
    dropCounter = 0;
    if (collide(board, piece)) endGame();
  }

  function fullRows() {
    const rows = [];
    for (let y = 0; y < ROWS; y++) if (board[y].every(v => v !== 0)) rows.push(y);
    return rows;
  }

  function lockPiece() {
    merge(board, piece);
    const rows = fullRows();
    if (rows.length === 0) {
      sound.lock();
      combo = -1;
      spawn();
      return;
    }
    // Rows flash first; the score and the next piece wait for collapse.
    clearing = { rows, until: performance.now() + CLEAR_FLASH };
    piece = null;
    if (rows.length === 4) sound.tetris(); else sound.clear(rows.length);
  }

  function finishClear() {
    const n = clearing.rows.length;
    for (const y of clearing.rows) {
      board.splice(y, 1);
      board.unshift(new Array(COLS).fill(0));
    }
    clearing = null;

    combo++;
    lines += n;
    let gained = LINE_SCORES[n] * level;
    const notes = [];
    if (n === 4) {
      if (backToBack) { gained = Math.floor(gained * 1.5); notes.push('Back-to-back'); }
      notes.push('TETRIS');
      backToBack = true;
    } else {
      backToBack = false;
    }
    if (combo > 0) {
      gained += 50 * combo * level;
      notes.push(`Combo ×${combo + 1}`);
    }
    score += gained;
    const newLevel = Math.floor(lines / LINES_PER_LEVEL) + 1;
    if (newLevel > level) { level = newLevel; notes.push(`Level ${level}`); sound.level(); }
    if (notes.length) flashCombo(notes.join(' · ') + `  +${gained.toLocaleString()}`);

    updateHud();
    spawn();
  }

  function softDrop() {
    piece.y++;
    if (collide(board, piece)) {
      piece.y--;
      return false;
    }
    score += 1;
    updateHud();
    dropCounter = 0;
    return true;
  }

  function hardDrop() {
    const target = ghostY();
    score += (target - piece.y) * 2;
    piece.y = target;
    sound.drop();
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
    lockTimer = 0;
    lockResets = 0;
    sound.hold();
    if (collide(board, piece)) endGame();
  }

  function update(time = 0) {
    if (!running || paused) return;
    const delta = Math.min(time - lastTime, 100); // cap so a hiccup doesn't teleport the piece
    lastTime = time;

    if (clearing) {
      if (time >= clearing.until) finishClear();
    } else {
      handleHeldKeys(delta);
      if (grounded()) {
        lockTimer += delta;
        if (lockTimer >= LOCK_DELAY) { lockPiece(); }
      } else {
        lockTimer = 0;
        dropCounter += delta;
        if (dropCounter > dropIntervalFor(level)) {
          piece.y++;
          dropCounter = 0;
        }
      }
    }

    draw(time);
    requestAnimationFrame(update);
  }

  function startGame() {
    sound.unlock();
    board = createMatrix(COLS, ROWS);
    bag = [];
    score = 0;
    lines = 0;
    level = 1;
    combo = -1;
    backToBack = false;
    holdPiece = null;
    holdUsed = false;
    clearing = null;
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
    held.clear();
    draw();
    sound.over();
    const isBest = score > best;
    if (isBest) {
      best = score;
      if (!CONFIG.authenticated) { try { localStorage.setItem('tetris.best', String(best)); } catch (_) {} }
    }
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
      saveStatus.textContent = 'Log in to save this score to the leaderboard.';
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

  // ---- input: held keys with DAS/ARR ----
  // Each entry: { action, elapsed, repeating }
  const held = new Map();

  function press(action) {
    if (!running || paused || clearing || !piece) return;
    switch (action) {
      case 'left':  move(-1); break;
      case 'right': move(1); break;
      case 'down':  softDrop(); break;
      case 'cw':    rotatePiece(1); break;
      case 'ccw':   rotatePiece(-1); break;
      case 'drop':  hardDrop(); break;
      case 'hold':  hold(); break;
      default: return;
    }
    draw();
  }

  function startHold(action) {
    if (held.has(action)) return;
    held.set(action, { elapsed: 0, repeating: false });
    press(action);
  }

  function endHold(action) {
    held.delete(action);
  }

  function handleHeldKeys(delta) {
    for (const [action, h] of held) {
      if (action !== 'left' && action !== 'right' && action !== 'down') continue;
      h.elapsed += delta;
      const start = action === 'down' ? 0 : DAS;
      const rate = action === 'down' ? SOFT_DROP_RATE : ARR;
      if (!h.repeating) {
        if (h.elapsed >= start) { h.repeating = true; h.elapsed = 0; }
        else continue;
      }
      while (h.elapsed >= rate) {
        h.elapsed -= rate;
        if (action === 'down') softDrop(); else move(action === 'left' ? -1 : 1);
      }
    }
  }

  const KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
    ArrowUp: 'cw', x: 'cw', X: 'cw',
    z: 'ccw', Z: 'ccw',
    ' ': 'drop',
    c: 'hold', C: 'hold', Shift: 'hold',
  };

  document.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) && e.key !== 'Escape') {
      if (e.target.tagName !== 'BUTTON') return;
    }
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
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      setMuteLabel(sound.toggle());
      return;
    }
    const action = KEYMAP[e.key];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return; // we do our own repeat
    startHold(action);
  });

  document.addEventListener('keyup', e => {
    const action = KEYMAP[e.key];
    if (action) endHold(action);
  });

  window.addEventListener('blur', () => held.clear());

  // ---- touch controls ----
  document.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.dataset.action;
    const down = e => { e.preventDefault(); sound.unlock(); startHold(action); btn.classList.add('active'); };
    const up = e => { e.preventDefault(); endHold(action); btn.classList.remove('active'); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('contextmenu', e => e.preventDefault());
  });

  // Swipe/tap on the board itself: tap rotates, swipe left/right moves,
  // swipe down hard-drops.
  let touchStart = null;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), moved: 0 };
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (!touchStart || !running || paused) return;
    const dx = e.touches[0].clientX - touchStart.x;
    const cells = Math.trunc(dx / 28);
    if (cells !== touchStart.moved) {
      const step = cells > touchStart.moved ? 1 : -1;
      while (touchStart.moved !== cells) { press(step > 0 ? 'right' : 'left'); touchStart.moved += step; }
    }
  }, { passive: true });
  canvas.addEventListener('touchend', e => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const quick = Date.now() - touchStart.t < 300;
    if (!running || gameOver) { startGame(); }
    else if (dy > 60 && Math.abs(dx) < 40 && quick) press('drop');
    else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) press('cw');
    touchStart = null;
  });

  // ---- buttons ----
  function setMuteLabel(m) {
    muteBtn.textContent = m ? '🔇 Sound off' : '🔊 Sound on';
    muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
  }
  startBtn.onclick = startGame;
  pauseBtn.onclick = togglePause;
  muteBtn.onclick = () => setMuteLabel(sound.toggle());
  overlayBtn.onclick = () => {
    if (paused) togglePause();
    else startGame();
  };
  setMuteLabel(sound.muted);

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
