// Headless test of public_html/js/tetris.js. Stubs the DOM and canvas, drives
// the game with simulated input, and asserts on HUD text and internal state.
//
//   node tests/js/game.test.cjs
//
// No dependencies. Exits non-zero on the first failed assertion.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, '../../public_html/js/tetris.js'), 'utf8');
// Expose internals for assertions (test only; the shipped file is untouched).
src = src.replace(/\}\)\(\);\s*$/, `window.__t = {
  get board(){return board;}, set board(b){board=b;},
  get piece(){return piece;}, set piece(p){piece=p;},
  get clearing(){return clearing;}, get mode(){return mode;},
  get elapsed(){return elapsed;}, set elapsed(v){elapsed=v;},
  get lines(){return lines;}, set lines(v){lines=v;},
  get nextQueue(){return nextQueue;}, get running(){return running;}, get gameOver(){return gameOver;},
  set lastWasRotate(v){lastWasRotate=v;}, get lockResets(){return lockResets;},
  get settings(){return settings;}, get countdown(){return countdown;}, get pendingRestart(){return pendingRestart;},
  get paused(){return paused;}, get deathStart(){return deathStart;}, get COLORS(){return COLORS;}, get held(){return held;},
  makePiece, ghostY, enterPlay, applySettings, buildKeymap, TOTAL_ROWS, BUFFER,
};\n})();`);

const noop = () => {};
const ctxStub = () => new Proxy({ canvas: null }, {
  get: (t, k) => (k in t ? t[k] : () => ({ addColorStop: noop })),
  set: (t, k, v) => (t[k] = v, true),
});
const els = {};
const listeners = {};
function el(id) {
  const e = { id, textContent: '', className: '', dataset: {}, style: {}, tagName: 'DIV', value: '', hidden: false,
    offsetWidth: 1, innerHTML: '', classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop, focus: noop, append: noop, addEventListener: (n, f) => { (listeners[id + ':' + n] ||= []).push(f); } };
  if (['tetris', 'hold', 'next'].includes(id)) { e.width = 320; e.height = 640; const c = ctxStub(); c.canvas = e; e.getContext = () => c; }
  return (els[id] = e);
}
['tetris', 'hold', 'next', 'board-wrap', 'score', 'lines', 'level', 'time', 'time-label', 'best', 'best-mode', 'save-status',
 'start-btn', 'pause-btn', 'mute-btn', 'overlay', 'overlay-title', 'overlay-text', 'overlay-btn', 'overlay-alt', 'summary',
 'countdown', 'combo', 'setup', 'mode-help', 'start-level', 'progress-bar', 'progress-label'].forEach(el);
els['best'].textContent = '0';
els['start-level'].value = '1';
const modeRadio = { value: 'marathon', type: 'radio', checked: true, addEventListener: noop };

let now = 0;
let pads = [];
const rafQueue = [];
const timers = [];
const store = { 'tetris.settings': JSON.stringify({ countdown: false }) };
const posted = [];
global.performance = { now: () => now };
global.requestAnimationFrame = f => rafQueue.push(f);
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
// Node has its own read-only navigator; replace it outright.
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true, writable: true });
global.window = {
  TETRIS: { authenticated: true, scoreUrl: '/scores', csrf: 'x', bests: { marathon: { score: 500, duration_ms: null }, sprint: null, ultra: null } },
  addEventListener: (n, f) => { (listeners['win:' + n] ||= []).push(f); },
  matchMedia: () => ({ matches: false }),
};
global.document = {
  getElementById: id => els[id],
  querySelector: sel => (sel.includes('name="mode"') ? modeRadio : null),
  querySelectorAll: () => [],
  createElement: () => el('tmp' + Math.random()),
  addEventListener: (n, f) => { (listeners['doc:' + n] ||= []).push(f); },
  hidden: false,
  activeElement: null,
};
global.fetch = async (url, opts) => { posted.push(JSON.parse(opts.body)); return { ok: true, status: 201, json: async () => ({ best: null, is_best: true }) }; };
global.setTimeout = (f, ms) => { timers.push({ f, at: now + (ms || 0) }); return timers.length; };
global.clearTimeout = noop;

eval(src);
const t = window.__t;

const runTimers = () => { for (let i = 0; i < timers.length;) { if (timers[i].at <= now) timers.splice(i, 1)[0].f(); else i++; } };
const frames = (n, step = 16) => { for (let i = 0; i < n; i++) { now += step; rafQueue.splice(0).forEach(f => f(now)); runTimers(); } };
const key = (k, type = 'keydown') => (listeners['doc:' + type] || []).forEach(f => f({ key: k, repeat: false, preventDefault: noop, stopPropagation: noop, target: { tagName: 'BODY' } }));
const tap = k => { key(k); key(k, 'keyup'); };
const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };
const title = () => els['overlay-title'].textContent;
const toast = () => els['combo'].textContent;
const num = id => +String(els[id].textContent).replace(/[^\d]/g, '');
const bottom = () => t.board.length - 1;
const emptyBoard = () => Array.from({ length: t.TOTAL_ROWS }, () => new Array(10).fill(0));
const newGame = () => { els['start-btn'].onclick(); if (t.pendingRestart) tap('Enter'); frames(3); };
function setPiece(type) { t.piece = t.makePiece(type); t.enterPlay(); }
function fillRows(n, gap = 4) { for (let y = bottom(); y > bottom() - n; y--) { t.board[y] = new Array(10).fill(3); t.board[y][gap] = 0; } }
function dropVerticalIAt(col) {
  setPiece(1);
  tap('ArrowUp');
  const want = col - t.piece.shape[0].findIndex(v => v);
  while (t.piece.x !== want) tap(t.piece.x < want ? 'ArrowRight' : 'ArrowLeft');
  tap(' ');
}
const ok = (name, detail = '') => console.log(('ok  ' + name).padEnd(34), detail);

// 1. marathon: random play to game over
newGame();
assert(t.running && t.nextQueue.length === 6 && t.board.length === 22, 'game starts with a 6-piece queue and 2 hidden rows');
const actions = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'z', 'x', ' ', 'c'];
for (let i = 0; i < 2000 && !t.gameOver; i++) {
  const k = actions[Math.floor(Math.random() * actions.length)];
  key(k); frames(Math.floor(Math.random() * 20) + 1); key(k, 'keyup');
}
key('ArrowLeft'); frames(25); key('ArrowLeft', 'keyup');
tap('p'); frames(3); tap('p'); tap('m'); tap('m'); frames(3);
for (let i = 0; i < 800 && !t.gameOver; i++) { tap(' '); frames(2); }
frames(70);
assert(title() === 'GAME OVER' && t.deathStart > 0, 'marathon ends with the death sweep');
assert(!els['summary'].hidden && /Pieces/.test(els['summary'].innerHTML), 'summary rendered');
assert(posted.at(-1).mode === 'marathon', 'marathon result posted');
ok('marathon to game over', els['overlay-text'].textContent);

// 2. tetris, back-to-back, perfect clear
tap('Enter'); frames(3);
assert(t.running && num('score') === 0, 'Enter restarts and resets the HUD');
t.board = emptyBoard(); fillRows(4); dropVerticalIAt(4);
assert(t.clearing && t.clearing.rows.length === 4, 'four rows flash');
frames(20);
assert(t.lines === 4 && num('score') >= 800, 'tetris scores');
assert(els['progress-bar'].style.width === '40.0%' && /6 lines to level 2/.test(els['progress-label'].textContent), 'progress bar shows 4 of 10');
fillRows(4); dropVerticalIAt(4); frames(20);
assert(/Back-to-back/.test(toast()) && /Combo/.test(toast()) && /PERFECT CLEAR/.test(toast()), 'b2b + combo + perfect clear: ' + toast());
ok('tetris, b2b, perfect clear', toast());

// 3. T-spin double
t.board = emptyBoard();
const B = bottom();
t.board[B]     = [3,0,3,3,3,3,3,3,3,3];
t.board[B - 1] = [0,0,0,3,3,3,3,3,3,3];
t.board[B - 2] = [3,0,0,0,0,0,0,0,0,0];
setPiece(6); tap('ArrowUp'); tap('ArrowUp');
t.piece.x = 0; t.piece.y = B - 2; t.lastWasRotate = true;
tap(' '); frames(20);
assert(/T-spin Double/.test(toast()), 'T-spin double: ' + toast());
ok('t-spin double', toast());

// 4. SRS wall kick
t.board = emptyBoard(); setPiece(1);
tap('ArrowUp');
for (let i = 0; i < 10; i++) tap('ArrowRight');
tap('ArrowUp');
assert(t.piece.rot === 2, 'I piece rotates off the right wall');
ok('srs wall kick');

// 5. sprint
modeRadio.value = 'sprint';
els['start-btn'].onclick();
assert(t.pendingRestart && title() === 'NEW GAME?', 'New game asks first mid-marathon');
tap('Enter'); frames(3);
assert(t.mode === 'sprint', 'sprint started');
t.board = emptyBoard(); t.lines = 36; fillRows(4); dropVerticalIAt(4); frames(20);
assert(title() === 'FINISHED', 'sprint finishes at 40 lines');
assert(posted.at(-1).mode === 'sprint' && posted.at(-1).lines === 40 && posted.at(-1).duration_ms > 0, 'sprint posted with a duration');
ok('sprint', els['overlay-text'].textContent);

// 6. R retries a sprint at once; asks in marathon
tap('Enter'); frames(3); tap(' '); frames(2);
assert(num('score') > 0, 'hard drop points show immediately');
tap('r'); frames(2);
assert(t.running && !t.pendingRestart && num('score') === 0, 'R restarts a sprint instantly');
modeRadio.value = 'ultra'; tap('r'); frames(3);
assert(t.mode === 'ultra', 'ultra started');
tap('ArrowDown'); tap('ArrowDown');
t.elapsed = 119000; frames(80);
assert(title() === "TIME'S UP" && posted.at(-1).duration_ms === 120000, 'ultra ends on the clock');
modeRadio.value = 'marathon'; tap('Enter'); frames(3);
tap('r');
assert(t.pendingRestart && t.paused, 'R asks first in marathon');
els['overlay-alt'].onclick();
assert(!t.pendingRestart && !t.paused && t.running, 'Resume continues');
ok('retry, ultra, confirm');

// 7. gravity, vanish zone, lock delay, instant soft drop
els['start-level'].value = '15'; newGame(); frames(8);
assert(t.piece.y === t.ghostY(), 'level 15 piece lands within a few frames');
els['start-level'].value = '1'; newGame();
t.board = emptyBoard();
for (let y = t.BUFFER; y <= bottom(); y++) { t.board[y] = new Array(10).fill(3); t.board[y][9] = 0; }
setPiece(6);
assert(t.running && t.piece.y === 0, 'a piece can spawn above a full-height stack');
tap(' '); frames(70);
assert(t.gameOver, 'locking entirely above the top ends the game');
tap('Enter'); frames(3);
t.board = emptyBoard(); t.board[bottom()] = [3,3,3,3,3,0,0,0,0,0];
setPiece(4); t.piece.x = 3; t.piece.y = bottom() - 2; t.piece.lowest = t.piece.y;
tap('ArrowLeft'); tap('ArrowRight'); tap('ArrowRight');
assert(t.lockResets >= 2, 'moves while resting use the allowance');
tap('ArrowRight'); tap('ArrowDown');
assert(t.lockResets === 0, 'a new lowest row refreshes it');
t.settings.sdr = 0; t.board = emptyBoard(); setPiece(2);
const live = t.piece; tap('ArrowDown');
assert(t.piece === live && t.piece.y === t.ghostY(), 'instant soft drop reaches the floor without locking');
t.settings.sdr = 45;
ok('gravity, vanish zone, lock delay');

// 8. zen never ends and never posts
modeRadio.value = 'zen'; newGame();
assert(t.mode === 'zen' && els['best'].textContent === '—', 'zen starts with no best shown');
const before = posted.length;
let cleared = false;
for (let i = 0; i < 80; i++) { tap(' '); frames(2); if (/Board cleared/.test(toast())) cleared = true; }
assert(t.running && !t.gameOver && cleared, 'zen clears the board and carries on');
assert(posted.length === before, 'zen posts nothing');
ok('zen mode');

// 9. key remapping
t.settings.keys.left = ['a']; t.buildKeymap();
t.board = emptyBoard(); setPiece(4);
const kx = t.piece.x; tap('A');
assert(t.piece.x === kx - 1, 'remapped key works, case-insensitively');
tap('ArrowLeft');
assert(t.piece.x === kx - 1, 'the old key is unbound');
t.settings.keys.left = ['ArrowLeft']; t.buildKeymap();
ok('key remapping');

// 10. rebinding through the capture listener
// (simulates Settings: choose an action, press a key)
{
  const capture = listeners['doc:keydown'][0];
  const press = k => capture({ key: k, preventDefault: noop, stopPropagation: noop, target: { tagName: 'BODY' } });
  press('q');
  assert(!t.settings.keys.hold.includes('q'), 'no rebind unless one was requested');
}
ok('rebind guard');

// 11. palette
t.settings.safeColors = true; t.applySettings();
assert(t.COLORS[6] === '#cc79a7', 'colour-blind palette applies');
t.settings.safeColors = false; t.applySettings();
assert(t.COLORS[6] === '#a000f0', 'classic palette restores');
ok('palette');

// 12. gamepad
const mkPad = pressed => ({ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })), axes: [0, 0, 0, 0] });
t.board = emptyBoard(); setPiece(4);
pads = [mkPad([])];
(listeners['win:gamepadconnected'] || []).forEach(f => f({}));
frames(2);
const gx = t.piece.x;
pads = [mkPad([14])]; frames(1);
assert(t.piece.x === gx - 1, 'd-pad left moves');
pads = [mkPad([])]; frames(1);
assert(!t.held.has('left'), 'release ends the hold');
pads = [mkPad([9])]; frames(1); pads = [mkPad([])]; frames(1);
assert(t.paused, 'Start pauses');
pads = [mkPad([9])]; frames(1); pads = [mkPad([])]; frames(1);
assert(!t.paused, 'Start resumes');
const live2 = t.piece; pads = [mkPad([12])]; frames(1); pads = [mkPad([])]; frames(2);
assert(t.piece !== live2, 'd-pad up hard-drops');
pads = [];
ok('gamepad');

// 13. countdown
t.settings.countdown = true; modeRadio.value = 'marathon'; newGame();
els['start-btn'].onclick(); tap('Enter'); frames(1);
assert(t.countdown > 0 && !els['countdown'].hidden, 'countdown runs');
const x0 = t.piece.x; tap('ArrowLeft');
assert(t.piece.x === x0, 'input is ignored during the countdown');
frames(120);
assert(t.countdown === 0 && t.elapsed > 0, 'play starts after the countdown');
ok('countdown');

console.log('\nALL PASSED');
