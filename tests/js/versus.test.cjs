// Headless test of the two-player rules in public_html/js/versus.js.
//
//   node tests/js/versus.test.cjs
//
// Only the Core class is exercised; the file skips its UI when there is no
// document, so no DOM stubs are needed.
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, '../../public_html/js/versus.js'), 'utf8'));
const { Core, Bot, placements, TOTAL, COLS, GARBAGE, emptyBoard, makePiece, gravityFor } = window.Versus;

const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };
const ok = name => console.log('ok  ' + name);

// Two linked players fed a fixed piece order (all I pieces unless told otherwise).
function match(order = () => 1) {
  const log = [[], []];
  const lost = [false, false];
  const cores = [];
  for (const i of [0, 1]) {
    cores[i] = new Core({
      nextType: order,
      random: () => 0.35,                       // hole always in column 3
      onAttack: n => { log[i].push(n); cores[1 - i].receive(n); },
      onTopOut: () => { lost[i] = true; },
      onEvent: () => {},
    });
  }
  cores.forEach(c => c.start());
  return { a: cores[0], b: cores[1], log, lost };
}

const bottom = TOTAL - 1;
// Fill the bottom n rows except one column.
function fill(core, n, gap = 4) {
  for (let y = bottom; y > bottom - n; y--) { core.board[y] = new Array(COLS).fill(3); core.board[y][gap] = 0; }
}
// Drop a vertical I into a column.
function dropI(core, col) {
  core.piece = makePiece(1); core.enter();
  core.rotate(1);
  const want = col - core.piece.shape[0].findIndex(v => v);
  while (core.piece.x !== want) if (!core.move(core.piece.x < want ? 1 : -1)) break;
  core.hardDrop();
}
const garbageRows = core => core.board.filter(r => r.includes(GARBAGE)).length;

// 1. attack table
{
  const { a, b, log } = match();
  fill(a, 1); dropI(a, 4);
  assert(log[0].length === 0, 'a single sends nothing');
  a.board = emptyBoard(); a.combo = -1;
  fill(a, 2); a.board[bottom - 2][0] = 3;      // leave a block so it is not a perfect clear
  dropI(a, 4);
  assert(log[0].at(-1) === 1, 'a double sends 1, got ' + log[0].at(-1));
  a.board = emptyBoard(); a.combo = -1;
  fill(a, 4); a.board[bottom - 4][0] = 3;
  dropI(a, 4);
  assert(log[0].at(-1) === 4 && a.b2b, 'a tetris sends 4');
  a.combo = -1; fill(a, 4); a.board[bottom - 4][0] = 3; a.board[bottom - 5][0] = 3;
  dropI(a, 4);
  assert(log[0].at(-1) === 5, 'a back-to-back tetris sends 5, got ' + log[0].at(-1));
  assert(b.pendingTotal() === 10 && garbageRows(b) === 0, 'garbage waits in the queue, not on the board');
  ok('attack table and back-to-back');
}

// 2. garbage rises only when a piece locks without clearing
{
  const { a, b } = match();
  b.receive(3);
  assert(garbageRows(b) === 0, 'nothing rises on receipt');
  b.hardDrop();                                  // flat I on an empty board: no clear
  assert(garbageRows(b) === 3 && b.pendingTotal() === 0, 'three rows rose after a clear-less lock');
  const rows = b.board.slice(-3);
  assert(rows.every(r => r[3] === 0 && r.filter(v => v === GARBAGE).length === COLS - 1), 'each garbage row has one hole, same column');
  assert(b.board[bottom - 3].filter(Boolean).length === 4, 'the placed piece was lifted with the stack');
  ok('garbage rises on a clear-less lock');
}

// 3. clearing cancels incoming garbage before sending any
{
  const { a, b, log } = match();
  a.receive(3);
  fill(a, 4); a.board[bottom - 4][0] = 3;
  dropI(a, 4);                                   // attack 4: cancels 3, sends 1
  assert(a.pendingTotal() === 0 && log[0].at(-1) === 1, 'tetris cancelled 3 and sent 1, sent ' + log[0].at(-1));
  assert(garbageRows(a) === 0, 'cancelled garbage never reached the board');
  a.receive(6); a.combo = -1; a.b2b = false;
  fill(a, 2); a.board[bottom - 2][0] = 3;
  const sentBefore = log[0].length;
  dropI(a, 4);                                   // attack 1: partially cancels, sends nothing
  assert(a.pendingTotal() === 5 && log[0].length === sentBefore, 'a double took 1 off a 6-line batch and sent nothing');
  assert(garbageRows(a) === 0, 'a clearing lock does not raise the remaining garbage');
  ok('cancelling');
}

// 4. combos add to the attack
{
  const { a, log } = match();
  for (let k = 0; k < 3; k++) { fill(a, 2); a.board[bottom - 2][0] = 3; dropI(a, 4); }
  assert(JSON.stringify(log[0]) === '[1,1,2]', 'three doubles in a row send 1, 1, 2: ' + JSON.stringify(log[0]));
  ok('combo bonus');
}

// 5. enough garbage tops a player out, and only that player
{
  const { a, b, lost } = match();
  for (let k = 0; k < 6 && !lost[1]; k++) { b.receive(4); b.hardDrop(); }
  assert(lost[1] && !b.alive, 'burying a board ends that player');
  assert(!lost[0] && a.alive, 'the other player is unaffected');
  const snapshot = JSON.stringify(b.board);
  b.move(1); b.hardDrop(); b.receive(4); b.tick(1000, 10);
  assert(JSON.stringify(b.board) === snapshot, 'a dead board ignores input, garbage and time');
  ok('top out');
}

// 6. both players draw the same pieces; hold and lock delay work
{
  const seq = [6, 2, 5, 1, 3, 7, 4];
  const { a, b } = match(i => seq[i % seq.length]);
  assert(a.piece.typeId === 6 && b.piece.typeId === 6, 'same first piece');
  assert(JSON.stringify(a.peek(3)) === '[2,5,1]' && JSON.stringify(b.peek(3)) === '[2,5,1]', 'same queue');
  a.holdPiece();
  assert(a.hold === 6 && a.piece.typeId === 2, 'hold stashes the piece and takes the next');
  a.holdPiece();
  assert(a.hold === 6 && a.piece.typeId === 2, 'hold works once per piece');
  a.hardDrop(); a.holdPiece();
  assert(a.hold === 5 && a.piece.typeId === 6, 'hold swaps back after a lock');
  assert(b.piece.typeId === 6 && b.idx === 1, "one player's hold does not move the other's queue");
  const y0 = b.piece.y;
  b.tick(gravityFor(1) + 1, gravityFor(1));
  assert(b.piece.y === y0 + 1, 'gravity moves a row per interval');
  while (!b.grounded()) b.softDrop();
  const pieces = b.pieces;
  b.tick(400, 1000); assert(b.pieces === pieces, 'a resting piece does not lock before the delay');
  b.tick(200, 1000); assert(b.pieces === pieces + 1, 'it locks once the delay has passed');
  ok('shared pieces, hold, gravity, lock delay');
}

// Seeded random numbers so the computer's games are repeatable.
function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
function bagOrder(rand) {
  const seq = [];
  return i => {
    while (seq.length <= i) {
      const bag = [1, 2, 3, 4, 5, 6, 7];
      for (let k = 6; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [bag[k], bag[j]] = [bag[j], bag[k]]; }
      seq.push(...bag);
    }
    return seq[i];
  };
}
// Two computers against each other, stepped 16 ms at a time.
function botMatch(levelA, levelB, seed, maxMs = 240000) {
  const rand = seeded(seed);
  const order = bagOrder(rand);
  const cores = [], lost = [false, false];
  for (const i of [0, 1]) {
    cores[i] = new Core({ nextType: order, random: rand, onAttack: n => cores[1 - i].receive(n), onTopOut: () => { lost[i] = true; }, onEvent() {} });
  }
  cores.forEach(c => c.start());
  const bots = [new Bot(cores[0], levelA, rand), new Bot(cores[1], levelB, rand)];
  let t = 0;
  for (; t < maxMs && !lost[0] && !lost[1]; t += 16) {
    const g = gravityFor(Math.min(15, 1 + Math.floor(t / 20000)));
    for (const i of [0, 1]) { if (lost[0] || lost[1]) break; bots[i].update(16); cores[i].tick(16, g); }
  }
  return { winner: lost[0] ? 1 : lost[1] ? 0 : -1, cores, t };
}

// 7. the computer finds every column and plays through the normal controls
{
  const spots = placements(emptyBoard(), 1);
  assert(spots.length === 7 + 10, 'an I piece has 7 flat and 10 upright spots on an empty board, got ' + spots.length);
  assert(placements(emptyBoard(), 4).length === 9, 'an O piece has 9 spots');

  const { a, log } = match();
  fill(a, 4, 7); a.board[bottom - 4][0] = 3;
  const bot = new Bot(a, 'hard', () => 0.99);
  for (let ms = 0; ms < 3000 && a.pieces < 2; ms += 16) bot.update(16);
  assert(log[0].includes(4), 'given a well, the computer takes the tetris within two pieces');
  ok('computer finds placements and takes a tetris');
}

// 8. alone, the computer survives and keeps its stack low
{
  const rand = seeded(7);
  const core = new Core({ nextType: bagOrder(rand), random: rand, onAttack() {}, onTopOut() {}, onEvent() {} });
  core.start();
  const bot = new Bot(core, 'normal', rand);
  for (let ms = 0; ms < 180000 && core.alive; ms += 16) { bot.update(16); core.tick(16, gravityFor(3)); }
  assert(core.alive, 'normal computer survived three minutes alone');
  assert(core.lines > 80, 'and cleared plenty of lines: ' + core.lines);
  ok('computer survives alone (' + core.pieces + ' pieces, ' + core.lines + ' lines)');
}

// 9. the levels are ordered: harder beats easier
{
  let hardOverEasy = 0, normalOverEasy = 0, hardOverNormal = 0;
  const games = 8;
  for (let s = 1; s <= games; s++) {
    if (botMatch('hard', 'easy', s * 11).winner === 0) hardOverEasy++;
    if (botMatch('easy', 'normal', s * 13).winner === 1) normalOverEasy++;
    if (botMatch('hard', 'normal', s * 17).winner === 0) hardOverNormal++;
  }
  console.log(`    hard beat easy ${hardOverEasy}/${games}, normal beat easy ${normalOverEasy}/${games}, hard beat normal ${hardOverNormal}/${games}`);
  assert(hardOverEasy >= games - 1, 'hard nearly always beats easy');
  assert(normalOverEasy >= games - 2, 'normal usually beats easy');
  assert(hardOverNormal > games / 2, 'hard beats normal more often than not');
  ok('difficulty levels are ordered');
}

console.log('\nALL PASSED');
