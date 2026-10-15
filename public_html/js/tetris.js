// Tetris game logic and rendering
(() => {
  const $ = id => document.getElementById(id);

  const canvas = $('tetris');
  const ctx = canvas.getContext('2d');
  const holdCv = $('hold');
  const holdCtx = holdCv.getContext('2d');
  const nextCv = $('next');
  const nextCtx = nextCv.getContext('2d');
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
  const overlayAlt = $('overlay-alt');
  const summaryElem = $('summary');
  const countdownElem = $('countdown');
  const comboElem = $('combo');
  const setupElem = $('setup');
  const modeHelp = $('mode-help');
  const startLevelSel = $('start-level');
  const settingsBtn = $('settings-btn');
  const helpBtn = $('help-btn');
  const settingsDlg = $('settings-dialog');
  const helpDlg = $('help-dialog');

  const CONFIG = window.TETRIS || { authenticated: false, bests: {} };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const COLS = 10;
  const ROWS = 20;
  const BLOCK_SIZE = 32;
  const W = COLS * BLOCK_SIZE;   // logical board size; the backing store is scaled to fit
  const H = ROWS * BLOCK_SIZE;
  const HOLD_W = 128, HOLD_H = 96;
  const NEXT_W = 128, NEXT_H = 288;
  const PREVIEW_BLOCK = 24;
  const NEXT_COUNT = 3;
  const LINES_PER_LEVEL = 10;
  const LINE_SCORES = [0, 100, 300, 500, 800];      // 0..4 lines, scaled by level
  const TSPIN_SCORES = [400, 800, 1200, 1600];       // full T-spin with 0..3 lines
  const TSPIN_MINI_SCORES = [100, 200, 400];         // mini T-spin with 0..2 lines
  const PERFECT_CLEAR_SCORES = [0, 800, 1200, 1800, 2000];
  const COUNTDOWN_STEP = 500;                         // ms per "3", "2", "1"

  const MODES = {
    marathon: { label: 'Marathon', help: 'Endless. Speed rises every 10 lines.', timeLabel: 'Time' },
    sprint:   { label: 'Sprint 40', help: 'Clear 40 lines as fast as you can. Speed stays fixed.', timeLabel: 'Time', targetLines: 40 },
    ultra:    { label: 'Ultra 2:00', help: 'Score as much as you can in two minutes. Speed stays fixed.', timeLabel: 'Left', timeLimit: 120000 },
  };

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

  // Spawn orientations match the Super Rotation System, so rotating the
  // bounding box gives the SRS states directly.
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

  // SRS wall-kick tables, keyed "from>to" rotation state (0 spawn, 1 right,
  // 2 reversed, 3 left). Offsets use the SRS convention of y pointing up;
  // the board's y grows downward, so dy is negated when a kick is applied.
  const KICKS_JLSTZ = {
    '0>1': [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
    '1>0': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
    '1>2': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
    '2>1': [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
    '2>3': [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]],
    '3>2': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
    '3>0': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
    '0>3': [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]],
  };
  const KICKS_I = {
    '0>1': [[0,0], [-2,0], [ 1,0], [-2,-1], [ 1, 2]],
    '1>0': [[0,0], [ 2,0], [-1,0], [ 2, 1], [-1,-2]],
    '1>2': [[0,0], [-1,0], [ 2,0], [-1, 2], [ 2,-1]],
    '2>1': [[0,0], [ 1,0], [-2,0], [ 1,-2], [-2, 1]],
    '2>3': [[0,0], [ 2,0], [-1,0], [ 2, 1], [-1,-2]],
    '3>2': [[0,0], [-2,0], [ 1,0], [-2,-1], [ 1, 2]],
    '3>0': [[0,0], [ 1,0], [-2,0], [ 1,-2], [-2, 1]],
    '0>3': [[0,0], [-1,0], [ 2,0], [-1, 2], [ 2,-1]],
  };

  // ---- storage ----
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  // ---- settings ----
  const DEFAULT_SETTINGS = {
    ghost: true,
    grid: true,
    effects: !reducedMotion,
    countdown: true,
    das: 170,     // ms before a held left/right starts repeating
    arr: 40,      // ms between repeats once it has started (0 = instant)
    volume: 60,   // percent
  };
  const settings = Object.assign({}, DEFAULT_SETTINGS, load('tetris.settings', {}));

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
      const vol = settings.volume / 60;
      if (muted || vol <= 0) return;
      const a = ensure();
      if (!a) return;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, a.currentTime);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
      g.gain.setValueAtTime(gain * vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      osc.connect(g).connect(a.destination);
      osc.start();
      osc.stop(a.currentTime + dur);
    }

    const seq = (notes, gap, dur, type, gain) =>
      notes.forEach((f, i) => setTimeout(() => tone(f, dur, type, gain), i * gap));

    return {
      move:   () => tone(220, 0.04, 'square', 0.03),
      rotate: () => tone(330, 0.05, 'triangle', 0.04),
      lock:   () => tone(140, 0.08, 'square', 0.05, -60),
      drop:   () => tone(110, 0.1, 'sawtooth', 0.05, -70),
      hold:   () => tone(440, 0.06, 'triangle', 0.04),
      clear:  n => seq(Array.from({ length: n }, (_, i) => 520 + i * 120), 60, 0.12, 'square', 0.05),
      tetris: () => seq([660, 880, 1100, 1320], 70, 0.14, 'square', 0.06),
      tspin:  () => seq([880, 740, 988], 60, 0.1, 'triangle', 0.06),
      perfect:() => seq([784, 988, 1175, 1568, 1976], 70, 0.16, 'triangle', 0.07),
      level:  () => seq([523, 659, 784], 90, 0.12, 'triangle', 0.06),
      win:    () => seq([523, 659, 784, 1047], 120, 0.2, 'triangle', 0.07),
      over:   () => { [400, 300, 200, 120].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.06, -40), i * 160)); },
      tick:   () => tone(1200, 0.03, 'square', 0.03),
      go:     () => tone(1600, 0.08, 'square', 0.04),
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
  let pieces, tetrises, tspins, maxCombo;
  let mode = 'marathon';
  let elapsed = 0;       // ms of play this game (pauses and countdown excluded)
  let countdown = 0;     // ms left in the pre-game countdown
  let lastCount = 0;
  let lastTick = -1;     // last whole second a countdown tick played (Ultra)
  let running = false;   // a game is in progress (may be paused)
  let paused = false;
  let gameOver = false;
  let pendingRestart = false; // "new game?" screen shown over a paused game
  let clearing = null;   // { rows, until, tspin } while rows flash
  let dropCounter = 0;
  let lastTime = 0;
  let bag = [];
  let lockTimer = 0;     // ms the piece has rested on something
  let lockResets = 0;
  let lastWasRotate = false; // for T-spin detection
  let lastKick = 0;          // which kick the last rotation used
  let particles = [];

  // Per-mode bests: players get theirs from the server, guests keep one
  // per mode in this browser.
  const bests = {};
  for (const m of Object.keys(MODES)) {
    const s = CONFIG.bests && CONFIG.bests[m];
    bests[m] = s ? { score: s.score, duration_ms: s.duration_ms } : null;
    if (!CONFIG.authenticated) {
      const local = load('tetris.best.' + m, null);
      if (local) bests[m] = local;
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
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
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
    return {
      typeId,
      shape: SHAPES[typeId].map(row => row.slice()),
      rot: 0,
      x: typeId === 4 ? 4 : 3, // guideline spawn columns
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

  function rotatePiece(dir) {
    if (piece.typeId === 4) return false; // O never changes
    const from = piece.rot;
    const to = (from + (dir > 0 ? 1 : 3)) % 4;
    const kicks = (piece.typeId === 1 ? KICKS_I : KICKS_JLSTZ)[from + '>' + to];
    const original = piece.shape;
    const ox = piece.x, oy = piece.y;
    piece.shape = rotateMatrix(original, dir);
    for (let i = 0; i < kicks.length; i++) {
      piece.x = ox + kicks[i][0];
      piece.y = oy - kicks[i][1];
      if (!collide(board, piece)) {
        piece.rot = to;
        lastKick = i;
        lastWasRotate = true;
        sound.rotate();
        touchLock();
        return true;
      }
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

  // T-spin rule: the T was last rotated (not moved) and three of the four
  // cells diagonal to its centre are blocked. It is a full T-spin when both
  // corners on the side the T points to are blocked, or the rotation used
  // the last SRS kick; otherwise it is a mini.
  function tSpinType() {
    if (piece.typeId !== 6 || !lastWasRotate) return null;
    const cx = piece.x + 1, cy = piece.y + 1;
    const blocked = ([dx, dy]) => {
      const x = cx + dx, y = cy + dy;
      return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x] !== 0);
    };
    const corners = [[-1,-1], [1,-1], [1,1], [-1,1]];
    if (corners.filter(blocked).length < 3) return null;
    const front = [
      [[-1,-1], [1,-1]],  // pointing up
      [[1,-1], [1,1]],    // pointing right
      [[-1,1], [1,1]],    // pointing down
      [[-1,-1], [-1,1]],  // pointing left
    ][piece.rot];
    return front.every(blocked) || lastKick === 4 ? 'full' : 'mini';
  }

  // ---- canvas sizing ----
  // Each canvas draws in fixed logical units; its backing store is resized
  // to the element's CSS width times the device pixel ratio so blocks stay
  // sharp at any size.
  function fit(cv, c, lw, lh) {
    const cssW = cv.clientWidth || lw;
    const ratio = window.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(cssW * ratio));
    const bh = Math.max(1, Math.round(cssW * (lh / lw) * ratio));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const s = bw / lw;
    c.setTransform(s, 0, 0, s, 0, 0);
  }

  function fitAll() {
    fit(canvas, ctx, W, H);
    fit(holdCv, holdCtx, HOLD_W, HOLD_H);
    fit(nextCv, nextCtx, NEXT_W, NEXT_H);
    draw();
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
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * BLOCK_SIZE + 0.5, 0);
      ctx.lineTo(x * BLOCK_SIZE + 0.5, H);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(0, y * BLOCK_SIZE + 0.5);
      ctx.lineTo(W, y * BLOCK_SIZE + 0.5);
    }
    ctx.stroke();
  }

  // Draw a piece centred in a slot of a preview canvas. Slot 0 is the top.
  function drawPreviewPiece(c, lw, p, slot, slotHeight) {
    const rows = p.shape.filter(r => r.some(v => v));
    const cols = p.shape[0].map((_, i) => p.shape.some(r => r[i])).reduce((a, v, i) => (v ? a.concat(i) : a), []);
    const w = cols.length, h = rows.length;
    const offX = (lw / PREVIEW_BLOCK - w) / 2 - cols[0];
    const offY = (slot * slotHeight + (slotHeight - h * PREVIEW_BLOCK) / 2) / PREVIEW_BLOCK - p.shape.findIndex(r => r.some(v => v));
    drawMatrix(c, p.shape, { x: offX, y: offY }, PREVIEW_BLOCK);
  }

  function drawPreviews() {
    nextCtx.fillStyle = '#0f1012';
    nextCtx.fillRect(0, 0, NEXT_W, NEXT_H);
    const slotH = NEXT_H / NEXT_COUNT;
    (nextQueue || []).forEach((p, i) => {
      nextCtx.globalAlpha = i === 0 ? 1 : 0.75;
      drawPreviewPiece(nextCtx, NEXT_W, p, i, slotH);
    });
    nextCtx.globalAlpha = 1;

    holdCtx.fillStyle = '#0f1012';
    holdCtx.fillRect(0, 0, HOLD_W, HOLD_H);
    if (holdPiece) {
      holdCtx.globalAlpha = holdUsed ? 0.35 : 1;
      drawPreviewPiece(holdCtx, HOLD_W, holdPiece, 0, HOLD_H);
      holdCtx.globalAlpha = 1;
    }
  }

  function spawnParticles(rows, tspin) {
    if (!settings.effects) return;
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
    if (!settings.effects) return;
    boardWrap.classList.remove('shake');
    void boardWrap.offsetWidth; // restart the animation
    boardWrap.classList.add('shake');
  }

  // 0 when the top four rows are empty, rising to 1 as the stack reaches
  // the ceiling. Drives the red warning glow.
  function dangerLevel() {
    for (let y = 0; y < 4; y++) if (board[y].some(v => v)) return (4 - y) / 4;
    return 0;
  }

  function draw(now = performance.now()) {
    ctx.fillStyle = '#0f1012';
    ctx.fillRect(0, 0, W, H);
    if (settings.grid) drawGrid();
    drawMatrix(ctx, board, { x: 0, y: 0 }, BLOCK_SIZE);

    const danger = running && !gameOver ? dangerLevel() : 0;
    if (danger > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.35);
      g.addColorStop(0, `rgba(255, 60, 90, ${0.35 * danger})`);
      g.addColorStop(1, 'rgba(255, 60, 90, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.35);
    }

    if (clearing) {
      // Flash the full rows white/transparent at ~12Hz until they collapse.
      const on = Math.floor((clearing.until - now) / 40) % 2 === 0;
      ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)';
      for (const y of clearing.rows) ctx.fillRect(0, y * BLOCK_SIZE, W, BLOCK_SIZE);
    } else if (piece && running) {
      if (settings.ghost) drawMatrix(ctx, piece.shape, { x: piece.x, y: ghostY() }, BLOCK_SIZE, 0.22);
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
    linesElem.textContent = mode === 'sprint' ? `${lines}/${MODES.sprint.targetLines}` : lines;
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
    comboTimer = setTimeout(() => comboElem.classList.remove('show'), 1400);
  }

  function showOverlay(title, text, btnLabel, opts = {}) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayBtn.textContent = btnLabel;
    setupElem.classList.toggle('hidden', !opts.setup);
    if (overlayAlt) {
      overlayAlt.hidden = !opts.alt;
      if (opts.alt) overlayAlt.textContent = opts.alt;
    }
    if (summaryElem && !opts.summary) summaryElem.hidden = true;
    overlay.classList.remove('hidden');
    if (overlayBtn.focus) overlayBtn.focus({ preventScroll: true });
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  function renderSummary() {
    if (!summaryElem) return;
    const secs = elapsed / 1000;
    const rows = [
      ['Time', fmtTimePrecise(elapsed)],
      ['Pieces', pieces],
      ['Pieces / sec', secs > 0 ? (pieces / secs).toFixed(2) : '0.00'],
      ['Tetrises', tetrises],
      ['T-spins', tspins],
      ['Best combo', maxCombo > 0 ? '×' + (maxCombo + 1) : '—'],
    ];
    // Values are numbers and fixed labels built here, never user input.
    summaryElem.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    summaryElem.hidden = false;
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
    const tspin = tSpinType();
    merge(board, piece);
    pieces++;
    const rows = fullRows();
    if (rows.length === 0) {
      if (tspin) {
        // A T-spin with no lines still scores; it does not break back-to-back.
        const gained = (tspin === 'full' ? TSPIN_SCORES[0] : TSPIN_MINI_SCORES[0]) * level;
        score += gained;
        tspins++;
        flashCombo(`${tspin === 'full' ? 'T-spin' : 'T-spin Mini'}  +${gained.toLocaleString()}`);
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
    maxCombo = Math.max(maxCombo, combo);
    lines += n;
    const notes = [];
    let gained;
    if (tspin === 'full') {
      gained = TSPIN_SCORES[n] * level;
      notes.push(['T-spin', 'T-spin Single', 'T-spin Double', 'T-spin Triple'][n]);
      tspins++;
    } else if (tspin === 'mini') {
      gained = TSPIN_MINI_SCORES[Math.min(n, 2)] * level;
      notes.push(['T-spin Mini', 'T-spin Mini Single', 'T-spin Mini Double'][Math.min(n, 2)]);
      tspins++;
    } else {
      gained = LINE_SCORES[n] * level;
      if (n === 4) { notes.push('TETRIS'); tetrises++; }
    }
    const difficult = n === 4 || !!tspin;
    if (difficult && backToBack) { gained = Math.floor(gained * 1.5); notes.unshift('Back-to-back'); }
    backToBack = difficult;
    if (combo > 0) {
      gained += 50 * combo * level;
      notes.push(`Combo ×${combo + 1}`);
    }
    if (board.every(row => row.every(v => v === 0))) {
      gained += PERFECT_CLEAR_SCORES[n] * level;
      notes.push('PERFECT CLEAR');
      sound.perfect();
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

    if (countdown > 0) {
      countdown -= delta;
      const n = Math.ceil(countdown / COUNTDOWN_STEP);
      if (countdown <= 0) {
        countdown = 0;
        if (countdownElem) countdownElem.hidden = true;
        sound.go();
      } else if (n !== lastCount) {
        lastCount = n;
        if (countdownElem) countdownElem.textContent = n;
        sound.tick();
      }
      draw(time);
      requestAnimationFrame(update);
      return;
    }

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
      if (piece && !gameOver) {
        if (grounded()) {
          lockTimer += delta;
          if (lockTimer >= LOCK_DELAY) lockPiece();
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
    }

    updateParticles(delta);
    if (running) timeElem.textContent = fmtTime(limit ? limit - elapsed : elapsed);
    draw(time);
    if (running) requestAnimationFrame(update);
  }

  function readSetup() {
    const checked = document.querySelector('input[name="mode"]:checked');
    mode = checked && MODES[checked.value] ? checked.value : 'marathon';
    startLevel = Math.min(15, Math.max(1, parseInt(startLevelSel.value, 10) || 1));
  }

  function restoreSetup() {
    const saved = load('tetris.setup', null);
    if (!saved) return;
    if (MODES[saved.mode]) {
      const r = document.querySelector(`input[name="mode"][value="${saved.mode}"]`);
      if (r) r.checked = true;
      modeHelp.textContent = MODES[saved.mode].help;
    }
    if (saved.level >= 1 && saved.level <= 15) startLevelSel.value = String(saved.level);
  }

  function startGame() {
    sound.unlock();
    readSetup();
    save('tetris.setup', { mode, level: startLevel });
    board = createMatrix(COLS, ROWS);
    bag = [];
    score = 0;
    lines = 0;
    level = startLevel;
    combo = -1;
    maxCombo = 0;
    backToBack = false;
    pieces = 0;
    tetrises = 0;
    tspins = 0;
    holdPiece = null;
    holdUsed = false;
    clearing = null;
    particles = [];
    elapsed = 0;
    lastTick = -1;
    gameOver = false;
    paused = false;
    pendingRestart = false;
    running = true;
    held.clear();
    nextQueue = [];
    for (let i = 0; i < NEXT_COUNT; i++) nextQueue.push(makePiece(nextTypeId()));
    spawn();
    updateHud();
    saveStatus.textContent = '';
    saveStatus.className = 'hint';
    hideOverlay();
    pauseBtn.textContent = 'Pause';
    // A focused button would also react to Space (hard drop) and Enter.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    countdown = settings.countdown ? 3 * COUNTDOWN_STEP : 0;
    lastCount = 3;
    if (countdownElem) {
      countdownElem.hidden = countdown === 0;
      countdownElem.textContent = '3';
    }
    if (countdown) sound.tick();

    lastTime = performance.now();
    requestAnimationFrame(update);
  }

  function togglePause() {
    if (!running || gameOver) return;
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    if (paused) {
      held.clear();
      showOverlay('PAUSED', 'Press P, Esc or Resume to continue', 'Resume');
    } else {
      pendingRestart = false;
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
      isBest = lines >= MODES.sprint.targetLines && (!prev || prev.duration_ms == null || result.duration_ms <= prev.duration_ms);
    } else {
      isBest = !prev || score > prev.score;
    }
    if (isBest) {
      bests[mode] = result;
      if (!CONFIG.authenticated) save('tetris.best.' + mode, result);
    }
    return isBest;
  }

  function endGame(won) {
    running = false;
    gameOver = true;
    pendingRestart = false;
    held.clear();
    if (countdownElem) countdownElem.hidden = true;
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
    }
    if (isBest) text += ' · New best!';
    renderSummary();
    showOverlay(title, text, 'Play again', { setup: true, summary: true });
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
      if (res.status === 419 || res.status === 401) throw new Error('your session expired, reload the page');
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
    if (!running || paused || clearing || !piece || countdown > 0) return;
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
    // Pressing one direction cancels the other, so a quick left-right
    // switch doesn't leave the first direction auto-repeating.
    if (action === 'left') held.delete('right');
    if (action === 'right') held.delete('left');
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
      const start = action === 'down' ? 0 : settings.das;
      const rate = action === 'down' ? SOFT_DROP_RATE : settings.arr;
      if (!h.repeating) {
        if (h.elapsed < start) continue;
        h.repeating = true;
        h.elapsed = 0;
      }
      if (rate === 0) {
        // Instant auto-repeat: slide to the wall.
        while (piece && !clearing && move(action === 'left' ? -1 : 1)) { /* keep going */ }
        h.elapsed = 0;
        continue;
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

  function dialogOpen() {
    return !!document.querySelector('dialog[open]');
  }

  document.addEventListener('keydown', e => {
    if (dialogOpen()) return; // the dialog owns the keyboard (Esc closes it)
    const tag = e.target && e.target.tagName;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && e.target.type !== 'radio' && e.key !== 'Escape') return;

    if (e.key === 'Enter') {
      if (tag === 'BUTTON') return; // let the focused button do its job
      if (!running || gameOver || pendingRestart) {
        e.preventDefault();
        startGame();
      }
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
    if (e.key === '?') {
      e.preventDefault();
      openDialog(helpDlg);
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
  // flick down hard-drops.
  let touchStart = null;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), moved: 0 };
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (!touchStart || !running || paused) return;
    const cell = (canvas.clientWidth || W) / COLS;
    const dx = e.touches[0].clientX - touchStart.x;
    const cells = Math.trunc(dx / cell);
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
    if (running && !gameOver) {
      if (dy > 60 && Math.abs(dx) < 40 && quick) press('drop');
      else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) press('cw');
    }
    touchStart = null;
  });

  // ---- dialogs ----
  function openDialog(dlg) {
    if (!dlg) return;
    if (running && !paused && !gameOver) togglePause();
    held.clear();
    if (dlg === settingsDlg) syncSettingsForm();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  const SETTING_INPUTS = {
    ghost:     ['set-ghost', 'bool'],
    grid:      ['set-grid', 'bool'],
    effects:   ['set-effects', 'bool'],
    countdown: ['set-countdown', 'bool'],
    das:       ['set-das', 'num'],
    arr:       ['set-arr', 'num'],
    volume:    ['set-volume', 'num'],
  };

  function formatSetting(key, v) {
    if (key === 'arr' && v === 0) return 'instant';
    if (key === 'das' || key === 'arr') return `${v} ms`;
    if (key === 'volume') return `${v}%`;
    return '';
  }

  function syncSettingsForm() {
    for (const [key, [id, kind]] of Object.entries(SETTING_INPUTS)) {
      const input = $(id);
      if (!input) continue;
      if (kind === 'bool') input.checked = !!settings[key];
      else input.value = settings[key];
      const out = $(id + '-out');
      if (out) out.textContent = formatSetting(key, settings[key]);
    }
  }

  for (const [key, [id, kind]] of Object.entries(SETTING_INPUTS)) {
    const input = $(id);
    if (!input) continue;
    input.addEventListener(kind === 'bool' ? 'change' : 'input', () => {
      settings[key] = kind === 'bool' ? input.checked : Number(input.value);
      save('tetris.settings', settings);
      syncSettingsForm();
      draw();
    });
  }

  const resetBtn = $('set-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      Object.assign(settings, DEFAULT_SETTINGS);
      save('tetris.settings', settings);
      syncSettingsForm();
      draw();
    });
  }

  if (settingsBtn) settingsBtn.onclick = () => openDialog(settingsDlg);
  if (helpBtn) helpBtn.onclick = () => openDialog(helpDlg);

  // ---- setup, tabs, buttons ----
  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.addEventListener('change', () => {
      if (!MODES[r.value]) return;
      modeHelp.textContent = MODES[r.value].help;
      if (!running) { mode = r.value; updateHud(); }
    });
  });

  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-tab]').forEach(t => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
      document.querySelectorAll('.board[data-board]').forEach(b => { b.hidden = b.dataset.board !== tab.dataset.tab; });
    });
  });

  function setMuteLabel(m) {
    muteBtn.textContent = m ? '🔇 Muted' : '🔊 Sound';
    muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
  }

  startBtn.onclick = () => {
    if (running && !gameOver) {
      // Mid-game: confirm rather than silently throwing the game away.
      if (!paused) togglePause();
      pendingRestart = true;
      showOverlay('NEW GAME?', 'Your current game will be abandoned.', 'Start new', { setup: true, alt: 'Resume' });
      return;
    }
    startGame();
  };
  pauseBtn.onclick = togglePause;
  muteBtn.onclick = () => setMuteLabel(sound.toggle());
  overlayBtn.onclick = () => {
    if (paused && running && !pendingRestart) togglePause();
    else startGame();
  };
  if (overlayAlt) overlayAlt.onclick = () => { if (paused) togglePause(); };
  setMuteLabel(sound.muted);

  // Pause automatically if the tab loses focus so a piece doesn't drop
  // through the floor while the player is away.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running && !paused && !gameOver) togglePause();
  });

  // Warn before leaving mid-game; the result is only saved at game end.
  window.addEventListener('beforeunload', e => {
    if (running && !gameOver && score > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---- initial paint ----
  board = createMatrix(COLS, ROWS);
  score = 0; lines = 0; level = 1; startLevel = 1; elapsed = 0;
  nextQueue = [];
  restoreSetup();
  readSetup();
  updateHud();
  fitAll();
  if (window.ResizeObserver) new ResizeObserver(fitAll).observe(boardWrap);
  window.addEventListener('resize', fitAll);
  showOverlay('TETRIS', 'Pick a mode, then press Start or Enter', 'Start', { setup: true });
})();
