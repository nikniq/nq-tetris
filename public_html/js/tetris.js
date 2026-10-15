// Tetris game logic and rendering
(() => {
  const $ = id => document.getElementById(id);

  const canvas = $('tetris');
  const ctx = canvas.getContext('2d');
  const holdCtx = $('hold').getContext('2d');
  const nextCtx = $('next').getContext('2d');
  const boardWrap = $('board-wrap');

  const scoreElem = $('score');
  const linesElem = $('lines');
  const levelElem = $('level');
  const timeElem = $('time');
  const timeLabel = $('time-label');
  const bestElem = $('best');
  const bestModeElem = $('best-mode');
  const saveStatus = $('save-status');
  const startBtn = $('start-btn');
  const pauseBtn = $('pause-btn');
  const muteBtn = $('mute-btn');
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');
  const overlayBtn = $('overlay-btn');
  const comboElem = $('combo');
  const setupElem = $('setup');
  const modeHelp = $('mode-help');
  const startLevelSel = $('start-level');

  const CONFIG = window.TETRIS || { authenticated: false, bests: {} };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const COLS = 10;
  const ROWS = 20;
  const BLOCK_SIZE = 32;
  const PREVIEW_BLOCK = 24;
  const NEXT_COUNT = 3;
  const LINES_PER_LEVEL = 10;
  const LINE_SCORES = [0, 100, 300, 500, 800];   // 0..4 lines, scaled by level
  const TSPIN_SCORES = [400, 800, 1200, 1600];    // T-spin with 0..3 lines

  const MODES = {
    marathon: { label: 'Marathon', help: 'Endless. Speed rises every 10 lines.', timeLabel: 'Time' },
    sprint:   { label: 'Sprint 40', help: 'Clear 40 lines as fast as you can. Speed stays fixed.', timeLabel: 'Time', targetLines: 40 },
    ultra:    { label: 'Ultra 2:00', help: 'Score as much as you can in two minutes. Speed stays fixed.', timeLabel: 'Left', timeLimit: 120000 },
  };

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
      tspin:  () => { [880, 740, 988].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'triangle', 0.06), i * 60)); },
      level:  () => { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.06), i * 90)); },
      win:    () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.07), i * 120)); },
      over:   () => { [400, 300, 200, 120].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.06, -40), i * 160)); },
      tick:   () => tone(1200, 0.03, 'square', 0.03),
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
  let board, piece, nextQueue, holdPiece, holdUsed;
  let score, lines, level, startLevel, combo, backToBack;
  let mode = 'marathon';
  let elapsed = 0;       // ms of play this game (pauses excluded)
  let lastTick = -1;     // last whole second a countdown tick played
  let running = false;   // a game is in progress (may be paused)
  let paused = false;
  let gameOver = false;
  let clearing = null;   // { rows: [...], until: ts, tspin } while rows flash
  let dropCounter = 0;
  let lastTime = 0;
  let bag = [];
  let lockTimer = 0;     // ms the piece has rested on something
  let lockResets = 0;
  let lastWasRotate = false; // for T-spin detection
  let particles = [];

  // Per-mode bests: players get theirs from the server, guests keep one
  // per mode in this browser.
  const bests = {};
  for (const m of Object.keys(MODES)) {
    const s = CONFIG.bests && CONFIG.bests[m];
    bests[m] = s ? { score: s.score, duration_ms: s.duration_ms } : null;
    if (!CONFIG.authenticated) {
      try {
        const raw = localStorage.getItem('tetris.best.' + m);
        if (raw) bests[m] = JSON.parse(raw);
      } catch (_) {}
    }
  }

  // ---- helpers ----
  function createMatrix(w, h) {
    const matrix = [];
    while (h--) matrix.push(new Array(w).fill(0));
    return matrix;
  }

  function fmtTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function fmtTimePrecise(ms) {
    const m = Math.floor(ms / 60000);
    const s = ((ms % 60000) / 1000).toFixed(2);
    return `${m}:${s.padStart(5, '0')}`;
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
    if (piece.typeId === 4) return false; // O never changes
    const rotated = rotateMatrix(piece.shape, dir);
    const kicks = [[0,0], [-1,0], [1,0], [-2,0], [2,0], [0,-1], [-1,-1], [1,-1]];
    const original = piece.shape;
    const ox = piece.x, oy = piece.y;
    piece.shape = rotated;
    for (const [kx, ky] of kicks) {
      piece.x = ox + kx;
      piece.y = oy + ky;
      if (!collide(board, piece)) { sound.rotate(); touchLock(); lastWasRotate = true; return true; }
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
    lastWasRotate = false;
    return true;
  }

  function ghostY() {
    const probe = { ...piece, y: piece.y };
    while (!collide(board, probe)) probe.y++;
    return probe.y - 1;
  }

  // A T piece that was last rotated (not moved) and has three of the four
  // cells diagonal to its centre blocked counts as a T-spin.
  function isTSpin() {
    if (piece.typeId !== 6 || !lastWasRotate) return false;
    // The T's centre is always the middle of its 3x3 box.
    const cx = piece.x + 1, cy = piece.y + 1;
    let filled = 0;
    for (const [dx, dy] of [[-1,-1], [1,-1], [-1,1], [1,1]]) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x] !== 0)) filled++;
    }
    return filled >= 3;
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

  // Draw a piece centred in a slot of the preview canvas. slot 0 is the top.
  function drawPreviewPiece(c, p, slot, slotHeight) {
    const cv = c.canvas;
    const rows = p.shape.filter(r => r.some(v => v));
    const cols = p.shape[0].map((_, i) => p.shape.some(r => r[i])).reduce((a, v, i) => (v ? a.concat(i) : a), []);
    const w = cols.length, h = rows.length;
    const offX = (cv.width / PREVIEW_BLOCK - w) / 2 - cols[0];
    const offY = (slot * slotHeight + (slotHeight - h * PREVIEW_BLOCK) / 2) / PREVIEW_BLOCK - p.shape.findIndex(r => r.some(v => v));
    drawMatrix(c, p.shape, { x: offX, y: offY }, PREVIEW_BLOCK);
  }

  function drawPreviews() {
    nextCtx.fillStyle = '#111';
    nextCtx.fillRect(0, 0, nextCtx.canvas.width, nextCtx.canvas.height);
    const slotH = nextCtx.canvas.height / NEXT_COUNT;
    (nextQueue || []).forEach((p, i) => drawPreviewPiece(nextCtx, p, i, slotH));

    holdCtx.fillStyle = '#111';
    holdCtx.fillRect(0, 0, holdCtx.canvas.width, holdCtx.canvas.height);
    if (holdPiece) {
      holdCtx.globalAlpha = holdUsed ? 0.4 : 1;
      drawPreviewPiece(holdCtx, holdPiece, 0, holdCtx.canvas.height);
      holdCtx.globalAlpha = 1;
    }
  }

  function spawnParticles(rows, tspin) {
    if (reducedMotion) return;
    for (const y of rows) {
      for (let x = 0; x < COLS; x++) {
        const color = COLORS[board[y][x]] || '#fff';
        for (let i = 0; i < 2; i++) {
          particles.push({
            x: (x + 0.5) * BLOCK_SIZE,
            y: (y + 0.5) * BLOCK_SIZE,
            vx: (Math.random() - 0.5) * 0.35,
            vy: -Math.random() * 0.35 - 0.05,
            life: 450 + Math.random() * 250,
            age: 0,
            size: 3 + Math.random() * 4,
            color: tspin ? '#ff6ef7' : color,
          });
        }
      }
    }
  }

  function updateParticles(delta) {
    if (!particles.length) return;
    for (const p of particles) {
      p.age += delta;
      p.vy += 0.0009 * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
    }
    particles = particles.filter(p => p.age < p.life);
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function shake() {
    if (reducedMotion) return;
    boardWrap.classList.remove('shake');
    void boardWrap.offsetWidth; // restart the animation
    boardWrap.classList.add('shake');
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

    drawParticles();
    drawPreviews();
  }

  function bestLabel(m) {
    const b = bests[m];
    if (!b) return '0';
    if (m === 'sprint') return b.duration_ms != null ? fmtTimePrecise(b.duration_ms) : '—';
    return b.score.toLocaleString();
  }

  function updateHud() {
    scoreElem.textContent = score.toLocaleString();
    linesElem.textContent = mode === 'sprint' ? `${lines} / ${MODES.sprint.targetLines}` : lines;
    levelElem.textContent = level;
    timeLabel.textContent = MODES[mode].timeLabel;
    timeElem.textContent = fmtTime(MODES[mode].timeLimit ? MODES[mode].timeLimit - elapsed : elapsed);
    bestModeElem.textContent = MODES[mode].label;
    // While playing marathon/ultra, show the live best if this run beats it.
    if (mode !== 'sprint' && running && (!bests[mode] || score > bests[mode].score)) {
      bestElem.textContent = score.toLocaleString();
    } else {
      bestElem.textContent = bestLabel(mode);
    }
  }

  let comboTimer = null;
  function flashCombo(text) {
    comboElem.textContent = text;
    comboElem.classList.add('show');
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => comboElem.classList.remove('show'), 1200);
  }

  function showOverlay(title, text, btnLabel, withSetup) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayBtn.textContent = btnLabel;
    setupElem.classList.toggle('hidden', !withSetup);
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  // ---- game flow ----
  function spawn() {
    piece = nextQueue.shift();
    nextQueue.push(makePiece(nextTypeId()));
    holdUsed = false;
    lockTimer = 0;
    lockResets = 0;
    dropCounter = 0;
    lastWasRotate = false;
    if (collide(board, piece)) endGame(false);
  }

  function fullRows() {
    const rows = [];
    for (let y = 0; y < ROWS; y++) if (board[y].every(v => v !== 0)) rows.push(y);
    return rows;
  }

  function lockPiece() {
    const tspin = isTSpin();
    merge(board, piece);
    const rows = fullRows();
    if (rows.length === 0) {
      if (tspin) {
        // A T-spin with no lines still scores and keeps back-to-back alive.
        const gained = TSPIN_SCORES[0] * level;
        score += gained;
        flashCombo(`T-spin  +${gained.toLocaleString()}`);
        sound.tspin();
        updateHud();
      } else {
        sound.lock();
      }
      combo = -1;
      spawn();
      return;
    }
    // Rows flash first; the score and the next piece wait for collapse.
    clearing = { rows, until: performance.now() + CLEAR_FLASH, tspin };
    spawnParticles(rows, tspin);
    piece = null;
    if (tspin) sound.tspin();
    else if (rows.length === 4) { sound.tetris(); shake(); }
    else sound.clear(rows.length);
  }

  function finishClear() {
    const n = clearing.rows.length;
    const tspin = clearing.tspin;
    for (const y of clearing.rows) {
      board.splice(y, 1);
      board.unshift(new Array(COLS).fill(0));
    }
    clearing = null;

    combo++;
    lines += n;
    const notes = [];
    let gained;
    const difficult = tspin || n === 4;
    if (tspin) {
      gained = TSPIN_SCORES[n] * level;
      notes.push(['T-spin', 'T-spin Single', 'T-spin Double', 'T-spin Triple'][n]);
    } else {
      gained = LINE_SCORES[n] * level;
      if (n === 4) notes.push('TETRIS');
    }
    if (difficult && backToBack) { gained = Math.floor(gained * 1.5); notes.unshift('Back-to-back'); }
    backToBack = difficult;
    if (combo > 0) {
      gained += 50 * combo * level;
      notes.push(`Combo ×${combo + 1}`);
    }
    score += gained;

    if (mode === 'marathon') {
      const newLevel = startLevel + Math.floor(lines / LINES_PER_LEVEL);
      if (newLevel > level) { level = newLevel; notes.push(`Level ${level}`); sound.level(); }
    }
    if (notes.length) flashCombo(notes.join(' · ') + `  +${gained.toLocaleString()}`);

    updateHud();

    if (MODES[mode].targetLines && lines >= MODES[mode].targetLines) {
      endGame(true);
      return;
    }
    spawn();
  }

  function softDrop() {
    piece.y++;
    if (collide(board, piece)) {
      piece.y--;
      return false;
    }
    score += 1;
    lastWasRotate = false;
    updateHud();
    dropCounter = 0;
    return true;
  }

  function hardDrop() {
    const target = ghostY();
    if (target > piece.y) lastWasRotate = false;
    score += (target - piece.y) * 2;
    piece.y = target;
    sound.drop();
    shake();
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
      piece = nextQueue.shift();
      nextQueue.push(makePiece(nextTypeId()));
    }
    holdUsed = true;
    lockTimer = 0;
    lockResets = 0;
    lastWasRotate = false;
    sound.hold();
    if (collide(board, piece)) endGame(false);
  }

  function update(time = 0) {
    if (!running || paused) return;
    const delta = Math.min(time - lastTime, 100); // cap so a hiccup doesn't teleport the piece
    lastTime = time;
    elapsed += delta;

    const limit = MODES[mode].timeLimit;
    if (limit) {
      const left = limit - elapsed;
      const sec = Math.ceil(left / 1000);
      if (sec <= 5 && sec !== lastTick && sec > 0) { lastTick = sec; sound.tick(); }
      if (left <= 0) { elapsed = limit; updateHud(); endGame(true); return; }
    }

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
          lastWasRotate = false;
          dropCounter = 0;
        }
      }
    }

    updateParticles(delta);
    if (running) {
      // Only the seconds digit changes each frame; cheap enough to refresh.
      timeElem.textContent = fmtTime(limit ? limit - elapsed : elapsed);
    }
    draw(time);
    requestAnimationFrame(update);
  }

  function readSetup() {
    const checked = document.querySelector('input[name="mode"]:checked');
    mode = checked && MODES[checked.value] ? checked.value : 'marathon';
    startLevel = Math.min(15, Math.max(1, parseInt(startLevelSel.value, 10) || 1));
  }

  function startGame() {
    sound.unlock();
    readSetup();
    board = createMatrix(COLS, ROWS);
    bag = [];
    score = 0;
    lines = 0;
    level = startLevel;
    combo = -1;
    backToBack = false;
    holdPiece = null;
    holdUsed = false;
    clearing = null;
    particles = [];
    elapsed = 0;
    lastTick = -1;
    gameOver = false;
    paused = false;
    running = true;
    nextQueue = [];
    for (let i = 0; i < NEXT_COUNT; i++) nextQueue.push(makePiece(nextTypeId()));
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
      showOverlay('PAUSED', 'Press P or Resume to continue', 'Resume', false);
    } else {
      hideOverlay();
      lastTime = performance.now();
      requestAnimationFrame(update);
    }
  }

  function recordBest() {
    const result = { score, duration_ms: Math.round(elapsed) };
    const prev = bests[mode];
    let isBest;
    if (mode === 'sprint') {
      isBest = lines >= MODES.sprint.targetLines && (!prev || result.duration_ms <= prev.duration_ms);
    } else {
      isBest = !prev || score > prev.score;
    }
    if (isBest) {
      bests[mode] = result;
      if (!CONFIG.authenticated) { try { localStorage.setItem('tetris.best.' + mode, JSON.stringify(result)); } catch (_) {} }
    }
    return isBest;
  }

  function endGame(won) {
    running = false;
    gameOver = true;
    held.clear();
    draw();
    if (won) sound.win(); else sound.over();
    const isBest = recordBest();
    updateHud();

    let title, text;
    if (mode === 'sprint' && won) {
      title = 'FINISHED';
      text = `${MODES.sprint.targetLines} lines in ${fmtTimePrecise(elapsed)} · ${score.toLocaleString()} points`;
    } else if (mode === 'ultra' && won) {
      title = "TIME'S UP";
      text = `${score.toLocaleString()} points · ${lines} lines`;
    } else {
      title = 'GAME OVER';
      text = `${score.toLocaleString()} points · ${lines} lines · level ${level}`;
      if (mode === 'sprint') text += ` · ${fmtTimePrecise(elapsed)}`;
    }
    if (isBest) text += ' · New best!';
    showOverlay(title, text, 'Play again', true);
    submitScore(won);
  }

  async function submitScore(won) {
    if (!CONFIG.authenticated) {
      saveStatus.textContent = 'Log in to save this result to the leaderboard.';
      return;
    }
    if (score === 0 && lines === 0) return;
    saveStatus.textContent = 'Saving…';
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
        body: JSON.stringify({ mode, score, lines, level, duration_ms: Math.round(elapsed) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.best != null) bests[mode] = { score: data.best, duration_ms: data.best_duration_ms };
      updateHud();
      const unfinished = mode === 'sprint' && !won;
      saveStatus.textContent = unfinished ? 'Saved. Finish all 40 lines to rank on the Sprint board.'
        : data.is_best ? 'Saved — new personal best!' : 'Saved.';
      saveStatus.className = 'hint ok';
    } catch (err) {
      saveStatus.textContent = 'Could not save (' + err.message + ').';
      saveStatus.className = 'hint bad';
    }
  }

  // ---- input: held keys with DAS/ARR ----
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
      while (h.elapsed >= rate && piece && !clearing) {
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
    const tag = e.target && e.target.tagName;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && e.target.type !== 'radio' && e.key !== 'Escape') return;
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
    if (!running || gameOver) return; // let arrows work the setup controls
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
    if (!running || gameOver) { /* the overlay button handles starting */ }
    else if (dy > 60 && Math.abs(dx) < 40 && quick) press('drop');
    else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) press('cw');
    touchStart = null;
  });

  // ---- setup, tabs, buttons ----
  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.addEventListener('change', () => {
      if (!MODES[r.value]) return;
      modeHelp.textContent = MODES[r.value].help;
      if (!running) { mode = r.value; updateHud(); }
      startLevelSel.disabled = false;
    });
  });

  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-tab]').forEach(t => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
      document.querySelectorAll('.board[data-board]').forEach(b => { b.hidden = b.dataset.board !== tab.dataset.tab; });
    });
  });

  function setMuteLabel(m) {
    muteBtn.textContent = m ? '🔇 Sound off' : '🔊 Sound on';
    muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
  }
  startBtn.onclick = () => {
    if (running && !gameOver) {
      // Restart mid-game: show the setup screen rather than silently resetting.
      paused = true;
      running = false;
      showOverlay('NEW GAME', 'Pick a mode, then press Start', 'Start', true);
      return;
    }
    startGame();
  };
  pauseBtn.onclick = togglePause;
  muteBtn.onclick = () => setMuteLabel(sound.toggle());
  overlayBtn.onclick = () => {
    if (paused && running) togglePause();
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
  score = 0; lines = 0; level = 1; startLevel = 1; elapsed = 0;
  nextQueue = [];
  readSetup();
  updateHud();
  draw();
  showOverlay('TETRIS', 'Pick a mode, then press Start or Enter', 'Start', true);
})();
