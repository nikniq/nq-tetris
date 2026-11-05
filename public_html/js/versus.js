// Two-player versus Tetris: two boards on one screen, garbage sent on clears.
//
// The file has two parts. Core is the rules for one board with no DOM in it,
// so it can be tested headlessly (tests/js/versus.test.cjs). The UI part
// below wires two Cores to canvases, the keyboard and gamepads.
(() => {
  const COLS = 10;
  const ROWS = 20;
  const BUFFER = 2;
  const TOTAL = ROWS + BUFFER;
  const LOCK_DELAY = 500;
  const LOCK_RESETS = 15;
  const GARBAGE = 8; // cell value for garbage blocks

  const SHAPES = [
    [],
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[2,0,0],[2,2,2],[0,0,0]],
    [[0,0,3],[3,3,3],[0,0,0]],
    [[4,4],[4,4]],
    [[0,5,5],[5,5,0],[0,0,0]],
    [[0,6,0],[6,6,6],[0,0,0]],
    [[7,7,0],[0,7,7],[0,0,0]],
  ];

  // SRS wall kicks ("from>to"), y pointing up as in the SRS tables.
  const KICKS_JLSTZ = {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],     '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  };
  const KICKS_I = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],   '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],   '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],   '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],   '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  };

  // Lines sent to the opponent for clearing n rows at once.
  const ATTACK = [0, 0, 1, 2, 4];
  // Extra lines for a combo of this many consecutive clears (0-based).
  const COMBO_BONUS = [0, 0, 1, 1, 2, 2, 3, 3, 4];

  const emptyBoard = () => Array.from({ length: TOTAL }, () => new Array(COLS).fill(0));

  function makePiece(typeId) {
    return { typeId, shape: SHAPES[typeId].map(r => r.slice()), rot: 0, x: typeId === 4 ? 4 : 3, y: 0, lowest: 0 };
  }

  function rotateMatrix(m, dir) {
    const r = m[0].map((_, i) => m.map(row => row[i]));
    return dir > 0 ? r.map(row => row.reverse()) : r.reverse();
  }

  // Guideline gravity, ms per row.
  function gravityFor(level) {
    const l = Math.min(level, 20);
    return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
  }

  class Core {
    // opts.nextType(i): the i-th piece of the shared sequence (both players
    //   get the same pieces in the same order).
    // opts.onAttack(n): this player sends n garbage lines.
    // opts.onTopOut(): this player has lost.
    // opts.onEvent(name, data): cosmetic hooks for the UI (sound, flashes).
    // opts.random(): 0..1, for garbage hole positions.
    constructor(opts) {
      this.opts = opts;
      this.reset();
    }

    reset() {
      this.board = emptyBoard();
      this.piece = null;
      this.hold = null;
      this.holdUsed = false;
      this.idx = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.dropCounter = 0;
      this.combo = -1;
      this.b2b = false;
      this.pending = [];   // garbage batches waiting to rise, oldest first
      this.alive = true;
      this.lines = 0;
      this.sent = 0;
      this.pieces = 0;
    }

    start() { this.spawn(); }

    peek(n) { return Array.from({ length: n }, (_, i) => this.opts.nextType(this.idx + i)); }

    pendingTotal() { return this.pending.reduce((a, b) => a + b, 0); }

    collide(p = this.piece) {
      for (let y = 0; y < p.shape.length; y++) {
        for (let x = 0; x < p.shape[y].length; x++) {
          if (!p.shape[y][x]) continue;
          const by = y + p.y, bx = x + p.x;
          if (bx < 0 || bx >= COLS || by >= TOTAL) return true;
          if (by >= 0 && this.board[by][bx]) return true;
        }
      }
      return false;
    }

    grounded() {
      this.piece.y++;
      const g = this.collide();
      this.piece.y--;
      return g;
    }

    ghostY() {
      const probe = { ...this.piece };
      while (!this.collide(probe)) probe.y++;
      return probe.y - 1;
    }

    spawn() {
      this.piece = makePiece(this.opts.nextType(this.idx++));
      this.holdUsed = false;
      this.enter();
    }

    enter() {
      this.lockTimer = 0;
      this.lockResets = 0;
      this.dropCounter = 0;
      this.piece.y = 0;
      if (this.collide()) { this.topOut(); return; }
      this.piece.y++;
      if (this.collide()) this.piece.y--;
      this.piece.lowest = this.piece.y;
    }

    topOut() {
      if (!this.alive) return;
      this.alive = false;
      this.opts.onTopOut();
    }

    touchLock() {
      if (this.grounded() && this.lockResets < LOCK_RESETS) { this.lockTimer = 0; this.lockResets++; }
    }

    noteDescent() {
      if (this.piece.y > this.piece.lowest) { this.piece.lowest = this.piece.y; this.lockResets = 0; this.lockTimer = 0; }
    }

    move(dx) {
      if (!this.alive) return false;
      this.piece.x += dx;
      if (this.collide()) { this.piece.x -= dx; return false; }
      this.touchLock();
      this.opts.onEvent('move');
      return true;
    }

    rotate(dir) {
      if (!this.alive || this.piece.typeId === 4) return false;
      const p = this.piece;
      const from = p.rot, to = (from + (dir > 0 ? 1 : 3)) % 4;
      const kicks = (p.typeId === 1 ? KICKS_I : KICKS_JLSTZ)[from + '>' + to];
      const shape = p.shape, ox = p.x, oy = p.y;
      p.shape = rotateMatrix(shape, dir);
      for (const [kx, ky] of kicks) {
        p.x = ox + kx; p.y = oy - ky;
        if (!this.collide()) {
          p.rot = to;
          this.noteDescent();
          this.touchLock();
          this.opts.onEvent('rotate');
          return true;
        }
      }
      p.shape = shape; p.x = ox; p.y = oy;
      return false;
    }

    softDrop() {
      if (!this.alive) return false;
      this.piece.y++;
      if (this.collide()) { this.piece.y--; return false; }
      this.noteDescent();
      this.dropCounter = 0;
      return true;
    }

    hardDrop() {
      if (!this.alive) return;
      this.piece.y = this.ghostY();
      this.opts.onEvent('drop');
      this.lock();
    }

    holdPiece() {
      if (!this.alive || this.holdUsed) return;
      const current = this.piece.typeId;
      if (this.hold) { this.piece = makePiece(this.hold); this.hold = current; }
      else { this.hold = current; this.piece = makePiece(this.opts.nextType(this.idx++)); }
      this.holdUsed = true;
      this.opts.onEvent('hold');
      this.enter();
    }

    // Advance time. gravity is ms per row.
    tick(delta, gravity) {
      if (!this.alive) return;
      if (this.grounded()) {
        this.lockTimer += delta;
        if (this.lockTimer >= LOCK_DELAY) this.lock();
      } else {
        this.lockTimer = 0;
        this.dropCounter += delta;
        while (this.dropCounter >= gravity && !this.grounded()) {
          this.piece.y++;
          this.dropCounter -= gravity;
          this.noteDescent();
        }
        if (this.grounded()) this.dropCounter = 0;
      }
    }

    lock() {
      const p = this.piece;
      p.shape.forEach((row, y) => row.forEach((v, x) => { if (v && p.y + y >= 0) this.board[p.y + y][p.x + x] = v; }));
      this.pieces++;

      // Locking entirely above the visible board is a loss.
      if (p.shape.every((row, y) => row.every(v => !v || p.y + y < BUFFER))) { this.topOut(); return; }

      const full = [];
      for (let y = 0; y < TOTAL; y++) if (this.board[y].every(v => v)) full.push(y);

      if (full.length) {
        for (const y of full) { this.board.splice(y, 1); this.board.unshift(new Array(COLS).fill(0)); }
        this.combo++;
        this.lines += full.length;
        let attack = ATTACK[full.length];
        const difficult = full.length === 4;
        if (difficult && this.b2b) attack += 1;
        this.b2b = difficult;
        attack += COMBO_BONUS[Math.min(this.combo, COMBO_BONUS.length - 1)];
        if (this.board.every(row => row.every(v => !v))) attack += 6; // perfect clear
        this.opts.onEvent('clear', { rows: full, count: full.length, attack });

        // An attack first cancels garbage waiting on this board; only what
        // is left over goes to the opponent.
        while (attack > 0 && this.pending.length) {
          const take = Math.min(attack, this.pending[0]);
          this.pending[0] -= take;
          attack -= take;
          if (this.pending[0] === 0) this.pending.shift();
        }
        if (attack > 0) { this.sent += attack; this.opts.onAttack(attack); }
      } else {
        this.combo = -1;
        this.opts.onEvent('lock');
        // No clear: waiting garbage rises now.
        if (this.pending.length) this.raise();
      }

      if (this.alive) this.spawn();
    }

    receive(n) {
      if (!this.alive || n <= 0) return;
      this.pending.push(n);
      this.opts.onEvent('incoming', { total: this.pendingTotal() });
    }

    // Push every waiting batch up from the bottom. Each batch has one hole
    // in the same column, so a batch can be cleared with one vertical piece.
    raise() {
      let rows = 0;
      for (const n of this.pending) {
        const hole = Math.floor(this.opts.random() * COLS);
        for (let i = 0; i < n; i++) {
          this.board.shift();
          const row = new Array(COLS).fill(GARBAGE);
          row[hole] = 0;
          this.board.push(row);
          rows++;
        }
      }
      this.pending = [];
      this.opts.onEvent('garbage', { rows });
    }
  }

  const api = { Core, COLS, ROWS, BUFFER, TOTAL, GARBAGE, SHAPES, gravityFor, makePiece, emptyBoard };
  if (typeof window !== 'undefined') window.Versus = api;
  if (typeof document === 'undefined' || !document.getElementById('versus')) return;

  // ------------------------------------------------------------------ UI --

  const $ = id => document.getElementById(id);
  const BLOCK = 28;
  const PREVIEW = 20;
  const WIN_TARGET = 3;       // first to this many rounds takes the match
  const DAS = 170, ARR = 40, SOFT = 45;
  const COUNTDOWN_STEP = 600;

  let safeColors = false;
  try { safeColors = !!JSON.parse(localStorage.getItem('tetris.settings') || '{}').safeColors; } catch (_) {}
  const COLORS = safeColors
    ? [null, '#56b4e9', '#0072b2', '#e69f00', '#f0e442', '#009e73', '#cc79a7', '#d55e00', '#6b7280']
    : [null, '#00f0f0', '#0000f0', '#f0a000', '#f0f000', '#00f000', '#a000f0', '#f00000', '#6b7280'];

  // ---- sound ----
  let actx = null;
  let muted = false;
  try { muted = localStorage.getItem('tetris.muted') === '1'; } catch (_) {}
  function tone(freq, dur, type = 'square', gain = 0.04, pan = 0) {
    if (muted) return;
    try {
      if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
      if (actx.state === 'suspended') actx.resume();
      const osc = actx.createOscillator(), g = actx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      let node = osc.connect(g);
      // Each player's sounds come from their side of the screen.
      if (actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
      node.connect(actx.destination);
      osc.start(); osc.stop(actx.currentTime + dur);
    } catch (_) {}
  }

  // ---- shared piece sequence (7-bag), same for both players ----
  let sequence = [];
  function nextType(i) {
    while (sequence.length <= i) {
      const bag = [1, 2, 3, 4, 5, 6, 7];
      for (let k = bag.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [bag[k], bag[j]] = [bag[j], bag[k]]; }
      sequence.push(...bag);
    }
    return sequence[i];
  }

  // ---- players ----
  const KEYS = [
    { KeyA: 'left', KeyD: 'right', KeyS: 'down', KeyW: 'cw', KeyQ: 'ccw', KeyE: 'hold', Space: 'drop' },
    { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'cw', Slash: 'ccw', ShiftRight: 'hold', Enter: 'drop' },
  ];

  function fitCanvas(cv, w, h) {
    const ratio = window.devicePixelRatio || 1;
    cv.width = Math.round(w * ratio); cv.height = Math.round(h * ratio);
    const c = cv.getContext('2d');
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    return c;
  }

  const players = [0, 1].map(i => {
    const root = $('p' + (i + 1));
    const q = sel => root.querySelector(sel);
    const p = {
      i, root,
      ctx: fitCanvas(q('.vs-board'), COLS * BLOCK, ROWS * BLOCK),
      holdCtx: fitCanvas(q('.vs-hold'), 4 * PREVIEW + 8, 3 * PREVIEW),
      nextCtx: fitCanvas(q('.vs-next'), 4 * PREVIEW + 8, 3 * 3 * PREVIEW),
      meter: q('.vs-meter i'),
      winsEl: q('.vs-wins'),
      sentEl: q('.vs-sent'),
      linesEl: q('.vs-lines'),
      banner: q('.vs-banner'),
      wins: 0,
      held: new Map(),
      flash: 0,        // ms left of the line-clear flash
      shake: 0,
      pan: i === 0 ? -0.6 : 0.6,
    };
    p.core = new Core({
      nextType,
      random: Math.random,
      onAttack: n => players[1 - i].core.receive(n),
      onTopOut: () => endRound(1 - i),
      onEvent: (name, data) => {
        if (name === 'rotate') tone(330, 0.04, 'triangle', 0.03, p.pan);
        else if (name === 'drop') tone(110, 0.08, 'sawtooth', 0.04, p.pan);
        else if (name === 'lock') tone(150, 0.05, 'square', 0.03, p.pan);
        else if (name === 'hold') tone(440, 0.05, 'triangle', 0.03, p.pan);
        else if (name === 'clear') {
          p.flash = 160;
          for (let k = 0; k < data.count; k++) setTimeout(() => tone(520 + k * 120, 0.1, 'square', 0.04, p.pan), k * 50);
          if (data.attack > 0) showBanner(p, data.count === 4 ? 'TETRIS  +' + data.attack : '+' + data.attack);
        } else if (name === 'garbage') { p.shake = 180; tone(70, 0.18, 'sawtooth', 0.06, p.pan); }
      },
    });
    return p;
  });

  function showBanner(p, text) {
    p.banner.textContent = text;
    p.banner.classList.add('show');
    clearTimeout(p.bannerTimer);
    p.bannerTimer = setTimeout(() => p.banner.classList.remove('show'), 900);
  }

  // ---- match state ----
  const overlay = $('vs-overlay');
  const overlayTitle = $('vs-title');
  const overlayText = $('vs-text');
  const startBtn = $('vs-start');
  const countdownEl = $('vs-countdown');
  let state = 'idle';     // idle | countdown | playing | paused | roundover | matchover
  let countdown = 0;
  let lastCount = 0;
  let elapsed = 0;
  let lastTime = 0;
  let resumeState = 'playing';
  let continueAfter = 0;  // "next round" input is ignored until this time

  function showOverlay(title, text, button) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startBtn.textContent = button;
    overlay.classList.remove('hidden');
    // The button is deliberately not focused: Space and Enter are the two
    // hard-drop keys, and a player still hammering one when a round ends
    // would otherwise press it and skip straight past the result.
  }

  function startRound() {
    sequence = [];
    elapsed = 0;
    for (const p of players) {
      p.core.reset();
      p.held.clear();
      p.flash = 0; p.shake = 0;
      p.root.classList.remove('lost', 'won');
    }
    for (const p of players) p.core.start();
    overlay.classList.add('hidden');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    state = 'countdown';
    countdown = 3 * COUNTDOWN_STEP;
    lastCount = 3;
    countdownEl.textContent = '3';
    countdownEl.hidden = false;
    tone(1200, 0.04);
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function startMatch() {
    for (const p of players) p.wins = 0;
    startRound();
  }

  function endRound(winner) {
    if (state !== 'playing') return;
    const w = players[winner], l = players[1 - winner];
    // Both can top out on the same frame only if garbage lands on both at
    // once; the first to be reported loses, which is all a draw needs.
    continueAfter = performance.now() + 1200;
    w.wins++;
    w.root.classList.add('won');
    l.root.classList.add('lost');
    [660, 880, 1100].forEach((f, k) => setTimeout(() => tone(f, 0.15, 'triangle', 0.06, w.pan), k * 90));
    draw();
    if (w.wins >= WIN_TARGET) {
      state = 'matchover';
      showOverlay(`PLAYER ${winner + 1} WINS`, `Match ${players[0].wins} – ${players[1].wins}`, 'New match');
    } else {
      state = 'roundover';
      showOverlay(`Round to Player ${winner + 1}`, `${players[0].wins} – ${players[1].wins} · first to ${WIN_TARGET}`, 'Next round');
    }
  }

  function togglePause() {
    if (state === 'playing' || state === 'countdown') {
      resumeState = state;
      state = 'paused';
      for (const p of players) p.held.clear();
      showOverlay('PAUSED', 'Press P or Esc to continue', 'Resume');
    } else if (state === 'paused') {
      overlay.classList.add('hidden');
      state = resumeState;
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function proceed() {
    if (performance.now() < continueAfter) return;
    if (state === 'paused') togglePause();
    else if (state === 'roundover') startRound();
    else if (state === 'idle' || state === 'matchover') startMatch();
  }
  startBtn.addEventListener('click', proceed);

  // ---- input ----
  function act(p, action) {
    if (state !== 'playing') return;
    const c = p.core;
    if (action === 'left') c.move(-1);
    else if (action === 'right') c.move(1);
    else if (action === 'down') c.softDrop();
    else if (action === 'cw') c.rotate(1);
    else if (action === 'ccw') c.rotate(-1);
    else if (action === 'drop') c.hardDrop();
    else if (action === 'hold') c.holdPiece();
  }

  function press(p, action) {
    if (p.held.has(action)) return;
    if (action === 'left') p.held.delete('right');
    if (action === 'right') p.held.delete('left');
    p.held.set(action, { t: 0, repeating: false });
    act(p, action);
  }

  function repeat(p, delta) {
    for (const [action, h] of p.held) {
      if (action !== 'left' && action !== 'right' && action !== 'down') continue;
      h.t += delta;
      const start = action === 'down' ? 0 : DAS;
      const rate = action === 'down' ? SOFT : ARR;
      if (!h.repeating) { if (h.t < start) continue; h.repeating = true; h.t = 0; }
      while (h.t >= rate) { h.t -= rate; act(p, action); }
    }
  }

  document.addEventListener('keydown', e => {
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
    if (e.code === 'KeyM') { muted = !muted; try { localStorage.setItem('tetris.muted', muted ? '1' : '0'); } catch (_) {} return; }
    if (state !== 'playing' && state !== 'countdown') {
      const gameKey = KEYS.some(map => map[e.code]);
      if (gameKey) e.preventDefault();   // no page scrolling from Space or arrows
      // While players are still hitting game keys after a round, keep the
      // result on screen: each press pushes the "continue" moment back, so
      // it only registers once the hammering has stopped.
      if (gameKey && performance.now() < continueAfter) { continueAfter = performance.now() + 700; return; }
      if (e.code === 'Enter' && !e.repeat) proceed();
      return;
    }
    for (const p of players) {
      const action = KEYS[p.i][e.code];
      if (action) { e.preventDefault(); if (!e.repeat) press(p, action); return; }
    }
  });
  document.addEventListener('keyup', e => {
    for (const p of players) { const action = KEYS[p.i][e.code]; if (action) p.held.delete(action); }
  });
  window.addEventListener('blur', () => { for (const p of players) p.held.clear(); if (state === 'playing') togglePause(); });

  // Gamepads: the first controller is Player 1, the second Player 2.
  const PAD = { 14: 'left', 15: 'right', 13: 'down', 12: 'drop', 0: 'cw', 2: 'cw', 1: 'ccw', 3: 'ccw', 4: 'hold', 5: 'hold' };
  const padPrev = [new Set(), new Set()];
  const padStart = [false, false];
  function pollPads() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    pads.slice(0, 2).forEach((pad, i) => {
      const now = new Set();
      for (const [b, action] of Object.entries(PAD)) if (pad.buttons[b] && pad.buttons[b].pressed) now.add(action);
      if (pad.axes[0] < -0.5) now.add('left');
      if (pad.axes[0] > 0.5) now.add('right');
      if (pad.axes[1] > 0.6) now.add('down');
      const p = players[i];
      for (const a of now) if (!padPrev[i].has(a)) press(p, a);
      for (const a of padPrev[i]) if (!now.has(a)) p.held.delete(a);
      padPrev[i] = now;
      const start = !!(pad.buttons[9] && pad.buttons[9].pressed);
      if (start && !padStart[i]) { if (state === 'playing' || state === 'countdown' || state === 'paused') togglePause(); else proceed(); }
      padStart[i] = start;
    });
    if (pads.length) requestAnimationFrame(pollPads);
    else padLoop = false;
  }
  let padLoop = false;
  window.addEventListener('gamepadconnected', () => {
    $('vs-pads').textContent = 'Controller connected. First controller is Player 1, second is Player 2.';
    if (!padLoop) { padLoop = true; requestAnimationFrame(pollPads); }
  });

  // ---- drawing ----
  function cell(c, x, y, size, color, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(x * size, y * size, size, size);
    c.strokeStyle = '#23272e';
    c.lineWidth = 1;
    c.strokeRect(x * size + 0.5, y * size + 0.5, size - 1, size - 1);
    c.fillStyle = 'rgba(255,255,255,0.16)';
    c.fillRect(x * size + 2, y * size + 2, size - 4, 3);
    c.globalAlpha = 1;
  }

  function drawPreview(c, w, h, types, slotH) {
    c.fillStyle = '#0f1012';
    c.fillRect(0, 0, w, h);
    types.forEach((t, i) => {
      if (!t) return;
      const shape = SHAPES[t];
      const rows = shape.filter(r => r.some(v => v));
      const cols = shape[0].map((_, k) => shape.some(r => r[k])).reduce((a, v, k) => (v ? a.concat(k) : a), []);
      const offX = (w / PREVIEW - cols.length) / 2 - cols[0];
      const offY = (i * slotH + (slotH - rows.length * PREVIEW) / 2) / PREVIEW - shape.findIndex(r => r.some(v => v));
      shape.forEach((row, y) => row.forEach((v, x) => { if (v) cell(c, x + offX, y + offY, PREVIEW, COLORS[v]); }));
    });
  }

  function drawPlayer(p) {
    const c = p.ctx, core = p.core;
    const W = COLS * BLOCK, H = ROWS * BLOCK;
    c.fillStyle = '#0f1012';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.beginPath();
    for (let x = 1; x < COLS; x++) { c.moveTo(x * BLOCK + 0.5, 0); c.lineTo(x * BLOCK + 0.5, H); }
    for (let y = 1; y < ROWS; y++) { c.moveTo(0, y * BLOCK + 0.5); c.lineTo(W, y * BLOCK + 0.5); }
    c.stroke();

    c.save();
    c.translate(0, -BUFFER * BLOCK);
    const dead = !core.alive;
    core.board.forEach((row, y) => row.forEach((v, x) => { if (v) cell(c, x, y, BLOCK, dead ? '#4a525d' : COLORS[v]); }));
    if (core.piece && core.alive && state !== 'idle') {
      const gy = core.ghostY();
      core.piece.shape.forEach((row, y) => row.forEach((v, x) => { if (v) cell(c, core.piece.x + x, gy + y, BLOCK, COLORS[v], 0.22); }));
      core.piece.shape.forEach((row, y) => row.forEach((v, x) => { if (v) cell(c, core.piece.x + x, core.piece.y + y, BLOCK, COLORS[v]); }));
    }
    c.restore();
    if (p.flash > 0) { c.fillStyle = `rgba(255,255,255,${0.35 * (p.flash / 160)})`; c.fillRect(0, 0, W, H); }

    drawPreview(p.holdCtx, 4 * PREVIEW + 8, 3 * PREVIEW, [core.hold], 3 * PREVIEW);
    drawPreview(p.nextCtx, 4 * PREVIEW + 8, 9 * PREVIEW, state === 'idle' ? [] : core.peek(3), 3 * PREVIEW);

    // Incoming garbage: the meter fills from the bottom, one row per line.
    p.meter.style.height = Math.min(100, (core.pendingTotal() / ROWS) * 100) + '%';
    p.winsEl.textContent = '●'.repeat(p.wins) + '○'.repeat(Math.max(0, WIN_TARGET - p.wins));
    p.sentEl.textContent = core.sent;
    p.linesEl.textContent = core.lines;
    p.root.classList.toggle('shake', p.shake > 0);
  }

  function draw() { for (const p of players) drawPlayer(p); }

  // ---- loop ----
  function loop(time) {
    if (state !== 'playing' && state !== 'countdown') return;
    const delta = Math.min(time - lastTime, 100);
    lastTime = time;

    if (state === 'countdown') {
      countdown -= delta;
      const n = Math.ceil(countdown / COUNTDOWN_STEP);
      if (countdown <= 0) { countdownEl.hidden = true; state = 'playing'; tone(1600, 0.08); }
      else if (n !== lastCount) { lastCount = n; countdownEl.textContent = n; tone(1200, 0.04); }
    } else {
      elapsed += delta;
      // Both boards speed up together: one level every 20 seconds.
      const gravity = gravityFor(Math.min(15, 1 + Math.floor(elapsed / 20000)));
      for (const p of players) {
        repeat(p, delta);
        if (state !== 'playing') break; // a hard drop just ended the round
        p.core.tick(delta, gravity);
        if (p.flash > 0) p.flash -= delta;
        if (p.shake > 0) p.shake -= delta;
      }
    }
    draw();
    if (state === 'playing' || state === 'countdown') requestAnimationFrame(loop);
  }

  draw();
  showOverlay('TWO PLAYER', `First to ${WIN_TARGET} rounds. Clear lines to send garbage.`, 'Start match');
})();
