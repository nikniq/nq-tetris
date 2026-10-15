// Tetris game logic and rendering
const canvas = document.getElementById('tetris');
const ctx = canvas.getContext('2d');
const scoreElem = document.getElementById('score');
const linesElem = document.getElementById('lines');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 32;
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

function randomPiece() {
  const typeId = Math.floor(Math.random() * (SHAPES.length - 1)) + 1;
  return {
    typeId,
    shape: SHAPES[typeId],
    x: Math.floor(COLS / 2) - 2,
    y: 0,
  };
}

function createMatrix(w, h) {
  const matrix = [];
  while (h--) matrix.push(new Array(w).fill(0));
  return matrix;
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
      if (
        piece.shape[y][x] &&
        (board[y + piece.y] && board[y + piece.y][x + piece.x]) !== 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function rotate(matrix) {
  return matrix[0].map((_, i) => matrix.map(row => row[i])).reverse();
}

function drawMatrix(matrix, offset) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        ctx.fillStyle = COLORS[value];
        ctx.fillRect(
          (x + offset.x) * BLOCK_SIZE,
          (y + offset.y) * BLOCK_SIZE,
          BLOCK_SIZE,
          BLOCK_SIZE
        );
        ctx.strokeStyle = '#23272e';
        ctx.strokeRect(
          (x + offset.x) * BLOCK_SIZE,
          (y + offset.y) * BLOCK_SIZE,
          BLOCK_SIZE,
          BLOCK_SIZE
        );
      }
    });
  });
}

function draw() {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawMatrix(board, { x: 0, y: 0 });
  drawMatrix(piece.shape, { x: piece.x, y: piece.y });
}

function drop() {
  piece.y++;
  if (collide(board, piece)) {
    piece.y--;
    merge(board, piece);
    resetPiece();
    sweep();
    updateScore();
    if (collide(board, piece)) {
      running = false;
      alert('Game Over!');
    }
  }
  dropCounter = 0;
}

function sweep() {
  let rowCount = 1;
  outer: for (let y = board.length - 1; y >= 0; --y) {
    for (let x = 0; x < board[y].length; ++x) {
      if (!board[y][x]) continue outer;
    }
    const row = board.splice(y, 1)[0].fill(0);
    board.unshift(row);
    ++y;
    score += rowCount * 100;
    lines++;
    rowCount *= 2;
  }
}

function resetPiece() {
  piece = randomPiece();
  piece.x = Math.floor(COLS / 2) - Math.floor(piece.shape[0].length / 2);
  piece.y = 0;
}

function updateScore() {
  scoreElem.textContent = 'Score: ' + score;
  linesElem.textContent = 'Lines: ' + lines;
}

function hardDrop() {
  while (!collide(board, piece)) {
    piece.y++;
  }
  piece.y--;
  merge(board, piece);
  resetPiece();
  sweep();
  updateScore();
  if (collide(board, piece)) {
    running = false;
    alert('Game Over!');
  }
}

let board = createMatrix(COLS, ROWS);
let piece = randomPiece();
let score = 0;
let lines = 0;
let running = false;
let dropCounter = 0;
let dropInterval = 600;
let lastTime = 0;

function update(time = 0) {
  if (!running) return;
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  if (dropCounter > dropInterval) {
    drop();
  }
  draw();
  requestAnimationFrame(update);
}

function startGame() {
  board = createMatrix(COLS, ROWS);
  score = 0;
  lines = 0;
  running = true;
  resetPiece();
  updateScore();
  update();
}

function pauseGame() {
  running = !running;
  if (running) update();
}

startBtn.onclick = startGame;
pauseBtn.onclick = pauseGame;

document.addEventListener('keydown', e => {
  if (!running) return;
  if (e.key === 'ArrowLeft') {
    piece.x--;
    if (collide(board, piece)) piece.x++;
  } else if (e.key === 'ArrowRight') {
    piece.x++;
    if (collide(board, piece)) piece.x--;
  } else if (e.key === 'ArrowDown') {
    drop();
  } else if (e.key === 'ArrowUp') {
    const rotated = rotate(piece.shape);
    const oldX = piece.x;
    piece.x += (piece.x < COLS / 2 ? 1 : -1);
    piece.shape = rotated;
    if (collide(board, piece)) {
      piece.shape = rotate(rotate(rotate(piece.shape)));
      piece.x = oldX;
    }
  } else if (e.key === ' ') {
    hardDrop();
  }
  draw();
});

draw();
