// Prism Stack — MIT License. See LICENSE.
// Headless tests for the Prism Stack game core. Run: node tests/core.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script id="game-core">([\s\S]*?)<\/script>/);
assert(match, 'core script not found');
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext(match[1], ctx);
const C = ctx.PrismCore;
const { CONFIG, TOTAL_ROWS, TYPES, SHAPES, Game } = C;
const HID = CONFIG.HIDDEN_ROWS;
const BOTTOM = TOTAL_ROWS - 1;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.message)); }
}
const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);

// Helpers ---------------------------------------------------------------
function newGame(seed = 1, cfg) { return new Game({ rng: C.mulberry32(seed), config: cfg }); }
function clearBoard(g) { g.board = C.createBoard(); }
function place(g, type, rot, x, y) {
  g.piece = { type, rot, x, y, lowestY: y, lastWasRotate: false, lastKick: -1 };
  g.lockTimer = 0; g.lockResets = 0; g.gravityAcc = 0; g.state = 'playing';
}
function fillRow(g, y, exceptCols = []) {
  for (let x = 0; x < CONFIG.COLS; x++) g.board[y][x] = exceptCols.includes(x) ? null : 'X';
}
function cells(g) { return g.cellsOf(g.piece); }
function tickFor(g, ms, step = 1) { for (let t = 0; t < ms; t += step) g.tick(step); }

console.log('\nPhase 0 — data & foundations');

test('every piece has 4 rotation states of 4 unique cells', () => {
  for (const t of TYPES) {
    assert.strictEqual(SHAPES[t].length, 4);
    for (const s of SHAPES[t]) {
      assert.strictEqual(s.length, 4);
      assert.strictEqual(new Set(s.map(c => c.join(','))).size, 4);
    }
  }
});

test('I and T rotation states match SRS', () => {
  eq(SHAPES.I[1].map(c => c[0]), [2, 2, 2, 2]);           // R: column 2
  eq(SHAPES.I[2].map(c => c[1]), [2, 2, 2, 2]);           // 2: row 2
  eq(SHAPES.I[3].map(c => c[0]), [1, 1, 1, 1]);           // L: column 1
  const tR = SHAPES.T[1].map(c => c.join(',')).sort();
  eq(tR, ['1,0', '1,1', '1,2', '2,1']);                   // T points right
  eq(SHAPES.O[1], SHAPES.O[0]);
});

test('kick tables: 5 tests each, start with (0,0), and are mirror-symmetric', () => {
  for (const table of [C.KICKS_JLSTZ, C.KICKS_I]) {
    for (const key of Object.keys(table)) {
      const [a, b] = key.split('>');
      const fwd = table[key], back = table[b + '>' + a];
      assert.strictEqual(fwd.length, 5);
      eq(fwd[0], [0, 0]);
      fwd.forEach((k, i) => eq([-k[0], -k[1]], back[i], key + ' #' + i));
    }
  }
  eq(C.getKicks('O', 0, 1), [[0, 0]]);
  assert.strictEqual(C.getKicks('T', 0, 2), C.KICKS_180);
});

test('7-bag: every group of 7 contains all pieces', () => {
  const bag = new C.Bag(C.mulberry32(42));
  for (let g = 0; g < 200; g++) {
    const set = new Set();
    for (let i = 0; i < 7; i++) set.add(bag.next());
    assert.strictEqual(set.size, 7);
  }
});

test('seeded games are repeatable', () => {
  const a = newGame(7), b = newGame(7);
  eq(a.queue, b.queue);
  assert.strictEqual(a.piece.type, b.piece.type);
});

test('collision: walls, floor and blocks', () => {
  const g = newGame();
  clearBoard(g);
  assert(g.collides('T', 0, -1, 30));
  assert(g.collides('T', 0, 8, 30));
  assert(!g.collides('T', 0, 7, 30));
  assert(g.collides('T', 0, 3, BOTTOM));      // row y+1 below floor
  assert(!g.collides('T', 0, 3, BOTTOM - 1));
  g.board[35][4] = 'X';
  assert(g.collides('T', 0, 3, 34));
});

test('gravity curve: level 1 = 1 s/row, strictly faster each level', () => {
  assert.strictEqual(C.secondsPerRow(1), 1);
  for (let l = 2; l <= 20; l++) assert(C.secondsPerRow(l) < C.secondsPerRow(l - 1));
  assert.strictEqual(C.secondsPerRow(25), C.secondsPerRow(20));
});

console.log('\nPhase 1 — gameplay');

test('spawn position: centred, flat side down, bottom row enters view', () => {
  for (const t of TYPES) {
    const g = newGame();
    clearBoard(g);
    g.spawn(t);
    const cs = cells(g);
    const cols = [...new Set(cs.map(c => c[0]))].sort((a, b) => a - b);
    if (t === 'I') eq(cols, [3, 4, 5, 6]);
    else if (t === 'O') eq(cols, [4, 5]);
    else eq(cols, [3, 4, 5]);
    assert.strictEqual(Math.max(...cs.map(c => c[1])), HID, t + ' lowest row should be first visible row');
  }
});

test('pieces never move through walls', () => {
  const g = newGame();
  clearBoard(g); g.spawn('I');
  for (let i = 0; i < 20; i++) g.tryMove(-1, 0);
  assert.strictEqual(Math.min(...cells(g).map(c => c[0])), 0);
  for (let i = 0; i < 20; i++) g.tryMove(1, 0);
  assert.strictEqual(Math.max(...cells(g).map(c => c[0])), 9);
});

test('SRS: I piece kicks off the left wall (R→2 uses kick #2)', () => {
  const g = newGame(); clearBoard(g);
  place(g, 'I', 1, -2, 30);               // vertical in column 0
  assert(g.tryRotate(1));
  assert.strictEqual(g.piece.rot, 2);
  assert.strictEqual(g.piece.x, 0);
  assert.strictEqual(g.piece.lastKick, 2);
});

test('SRS: T piece kicks off the left wall (R→2 uses kick #1)', () => {
  const g = newGame(); clearBoard(g);
  place(g, 'T', 1, -1, 30);
  assert(g.tryRotate(1));
  assert.strictEqual(g.piece.x, 0);
  assert.strictEqual(g.piece.lastKick, 1);
});

test('SRS: rotation fails cleanly when every kick is blocked', () => {
  const g = newGame(); clearBoard(g);
  for (let y = 25; y <= BOTTOM; y++) fillRow(g, y, [4]);
  place(g, 'I', 1, 2, 30);                // vertical I in a 1-wide well
  const before = JSON.stringify(g.piece);
  assert(!g.tryRotate(1));
  assert.strictEqual(JSON.stringify(g.piece), before);
});

test('180° rotation and counter-clockwise rotation return to start', () => {
  const g = newGame(); clearBoard(g);
  place(g, 'T', 0, 3, 30);
  g.tryRotate(2); assert.strictEqual(g.piece.rot, 2);
  g.tryRotate(-1); assert.strictEqual(g.piece.rot, 1);
  g.tryRotate(-1); assert.strictEqual(g.piece.rot, 0);
});

test('ghost matches hard-drop landing; hard drop scores 2/row and locks', () => {
  const g = newGame(); clearBoard(g); g.score = 0;
  g.spawn('O');
  const gy = g.ghostY(), y0 = g.piece.y;
  g.hardDrop();
  assert.strictEqual(g.score, 2 * (gy - y0));
  assert.strictEqual(g.board[BOTTOM][4], 'O');
  assert.strictEqual(g.board[BOTTOM][5], 'O');
  assert.strictEqual(g.piecesPlaced, 1);
  assert(g.piece);                         // next piece spawned
});

test('soft drop scores 1 per row moved', () => {
  const g = newGame(); clearBoard(g); g.score = 0;
  g.spawn('T');
  const y0 = g.piece.y;
  g.press('soft');
  tickFor(g, 500, CONFIG.TICK_MS);
  const moved = g.piece.y - y0;
  assert(moved > 5, 'should fall fast');
  assert.strictEqual(g.score, moved);
});

test('gravity: level 1 piece falls 1 row per second', () => {
  const g = newGame(); clearBoard(g); g.spawn('T');
  const y0 = g.piece.y;
  tickFor(g, 990);
  assert.strictEqual(g.piece.y, y0);
  tickFor(g, 20);
  assert.strictEqual(g.piece.y, y0 + 1);
});

// A lone block high on the right stops a Quad here from also being a
// perfect clear (Phase 2), so these tests measure plain line clears.
const JUNK = [9, BOTTOM - 10];
function clearWithI(lines, junk = true) {
  const g = newGame(); clearBoard(g); g.score = 0;
  for (let i = 0; i < lines; i++) fillRow(g, BOTTOM - i, [0]);
  if (junk) g.board[JUNK[1]][JUNK[0]] = 'X';
  place(g, 'I', 1, -2, 20);                // vertical I down column 0
  g.hardDrop();
  return g;
}
for (const n of [1, 2, 3, 4]) {
  test(`${n}-line clear scores ${C.LINE_CLEAR_POINTS[n]} × level and removes rows`, () => {
    const g = clearWithI(n);
    assert.strictEqual(g.state, 'clearing');
    assert.strictEqual(g.lines, n);
    tickFor(g, CONFIG.LINE_CLEAR_DELAY_MS + 5);
    assert.strictEqual(g.state, 'playing');
    // Only the leftover I cells (4 - n) and the junk block remain.
    let count = 0;
    for (let y = 0; y < TOTAL_ROWS; y++) for (let x = 0; x < 10; x++) if (g.board[y][x]) count++;
    assert.strictEqual(count, 4 - n + 1);
  });
}

test('line-clear points are exact (separate from drop points)', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = newGame(); clearBoard(g); g.score = 0;
    for (let i = 0; i < n; i++) fillRow(g, BOTTOM - i, [0]);
    g.board[JUNK[1]][JUNK[0]] = 'X';       // not a perfect clear
    place(g, 'I', 1, -2, BOTTOM - 3);      // already resting: drop distance 0
    g.hardDrop();
    assert.strictEqual(g.score, C.LINE_CLEAR_POINTS[n] * 1);
  }
});

test('non-adjacent rows clear and the gap row shifts down correctly', () => {
  const g = newGame(); clearBoard(g);
  fillRow(g, BOTTOM, [0]);
  fillRow(g, BOTTOM - 1, [0, 5]);         // not completable
  fillRow(g, BOTTOM - 2, [0]);
  place(g, 'I', 1, -2, BOTTOM - 3);
  g.hardDrop();
  eq(g.clearingRows, [BOTTOM - 2, BOTTOM]);
  tickFor(g, CONFIG.LINE_CLEAR_DELAY_MS + 5);
  // Row that had gaps at 0 (now filled by I) and 5 should now be at BOTTOM.
  eq(g.board[BOTTOM].map(c => (c ? 1 : 0)), [1, 1, 1, 1, 1, 0, 1, 1, 1, 1]);
  eq(g.board[BOTTOM - 1].map(c => (c ? 1 : 0)), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  eq(g.board[BOTTOM - 2].map(c => (c ? 1 : 0)), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('level increases every 10 lines and score uses level at clear time', () => {
  const g = newGame(); clearBoard(g); g.lines = 9; g.score = 0;
  fillRow(g, BOTTOM, [0]);
  place(g, 'I', 1, -2, BOTTOM - 3);
  g.hardDrop();
  assert.strictEqual(g.level, 2);
  assert.strictEqual(g.score, 100);       // cleared at level 1
});

test('lock delay: locks after 500 ms on the ground, not before', () => {
  const g = newGame(); clearBoard(g);
  place(g, 'T', 0, 3, BOTTOM - 1);
  tickFor(g, 490);
  assert.strictEqual(g.piecesPlaced, 0);
  tickFor(g, 15);
  assert.strictEqual(g.piecesPlaced, 1);
});

test('lock delay: 15 resets allowed, the 16th grounded move locks', () => {
  const g = newGame(); clearBoard(g);
  place(g, 'T', 0, 3, BOTTOM - 1);
  for (let i = 0; i < 15; i++) {
    tickFor(g, 400);
    assert(g.tryMove(i % 2 ? 1 : -1, 0));
    assert.strictEqual(g.piecesPlaced, 0, 'locked early at reset ' + (i + 1));
  }
  tickFor(g, 400);
  assert.strictEqual(g.piecesPlaced, 0);
  g.tryMove(-1, 0);                        // 16th move
  g.tick(1);
  assert.strictEqual(g.piecesPlaced, 1);
});

test('lock reset counter refreshes on reaching a new lowest row', () => {
  const g = newGame(); clearBoard(g);
  fillRow(g, BOTTOM, [0, 1, 2, 3, 4]);    // step down on the left
  place(g, 'O', 0, 4, BOTTOM - 2);        // resting on the ledge (cols 5-6)
  for (let i = 0; i < 10; i++) { g.tryMove(i % 2 ? 1 : -1, 0); }
  assert(g.lockResets >= 10);
  g.tryMove(-1, 0); g.tryMove(-1, 0); g.tryMove(-1, 0);   // slide off the ledge
  tickFor(g, 1100);                       // falls one row
  assert.strictEqual(g.lockResets, 0);
});

test('hold: stores first piece, swaps later, once per piece', () => {
  const g = newGame(); clearBoard(g);
  const first = g.piece.type, next = g.queue[0];
  assert(g.hold());
  assert.strictEqual(g.holdType, first);
  assert.strictEqual(g.piece.type, next);
  assert(!g.hold(), 'second hold before lock must fail');
  g.hardDrop();
  assert(g.canHold);
  const cur = g.piece.type;
  assert(g.hold());
  assert.strictEqual(g.piece.type, first);
  assert.strictEqual(g.piece.rot, 0);
  assert.strictEqual(g.holdType, cur);
});

test('block out ends the game', () => {
  const g = newGame(); clearBoard(g);
  for (let x = 0; x < 10; x++) { g.board[HID - 2][x] = 'X'; g.board[HID - 1][x] = 'X'; }
  g.spawn('T');
  assert.strictEqual(g.state, 'over');
  assert.strictEqual(g.gameOverReason, 'blockout');
});

test('lock out ends the game', () => {
  const g = newGame(); clearBoard(g);
  for (let y = HID; y <= BOTTOM; y++) for (let x = 3; x <= 6; x++) g.board[y][x] = 'X';
  g.spawn('T');
  g.hardDrop();
  assert.strictEqual(g.state, 'over');
  assert.strictEqual(g.gameOverReason, 'lockout');
});

test('inputs are ignored after game over', () => {
  const g = newGame(); g.endGame('test');
  const before = JSON.stringify(g.piece);
  for (const a of ['left', 'right', 'cw', 'hard', 'hold']) g.press(a);
  g.tick(1000);
  assert.strictEqual(JSON.stringify(g.piece), before);
});

test('pause freezes gravity, lock delay and the clock', () => {
  const g = newGame(); clearBoard(g); g.spawn('T');
  const y0 = g.piece.y;
  g.paused = true;
  tickFor(g, 5000, 16);
  assert.strictEqual(g.piece.y, y0);
  assert.strictEqual(g.elapsedMs, 0);
  g.paused = false;
  tickFor(g, 1100);
  assert(g.piece.y > y0);
});

test('restart (new game) resets everything', () => {
  let g = newGame(3);
  g.score = 999; g.lines = 50; g.hold();
  g = newGame(3);
  assert.strictEqual(g.score, 0); assert.strictEqual(g.lines, 0);
  assert.strictEqual(g.level, 1); assert.strictEqual(g.holdType, null);
  assert(g.canHold); assert.strictEqual(g.state, 'playing');
});

test('DAS/ARR: one step on press, auto-shift after 170 ms, then every 50 ms', () => {
  const g = newGame(); clearBoard(g); g.spawn('T');
  const x0 = g.piece.x;
  g.press('right');
  assert.strictEqual(g.piece.x, x0 + 1);
  tickFor(g, 169);
  assert.strictEqual(g.piece.x, x0 + 1);
  tickFor(g, 2);
  assert.strictEqual(g.piece.x, x0 + 2);
  tickFor(g, 50);
  assert.strictEqual(g.piece.x, x0 + 3);
  g.release('right');
  tickFor(g, 200);
  assert.strictEqual(g.piece.x, x0 + 3);
});

test('DAS: most recent direction wins and hands back on release', () => {
  const g = newGame(); clearBoard(g); g.spawn('T');
  g.press('left'); g.press('right');
  assert.strictEqual(g.dir, 1);
  g.release('right');
  assert.strictEqual(g.dir, -1);
  g.release('left');
  assert.strictEqual(g.dir, 0);
});

test('ARR 0 shifts instantly to the wall after DAS', () => {
  const g = newGame(1, { ARR_MS: 0 }); clearBoard(g); g.spawn('T');
  g.press('left');
  tickFor(g, 175);
  assert.strictEqual(Math.min(...cells(g).map(c => c[0])), 0);
});

test('DAS charge carries into the next piece', () => {
  const g = newGame(); clearBoard(g); g.spawn('T');
  g.press('left');
  tickFor(g, 300);
  g.hardDrop();
  // New piece should have shifted at least one column left immediately.
  assert(Math.min(...cells(g).map(c => c[0])) < 3);
});

// Fuzz test ---------------------------------------------------------------
test('fuzz: 300 random games never break board invariants', () => {
  const actions = ['left', 'right', 'soft', 'hard', 'cw', 'ccw', 'r180', 'hold'];
  let games = 0, totalLines = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rng = C.mulberry32(seed * 977);
    const g = new Game({ rng: C.mulberry32(seed) });
    let steps = 0;
    while (g.state !== 'over' && steps < 20000) {
      const r = rng();
      if (r < 0.25) {
        const a = actions[Math.floor(rng() * actions.length)];
        g.press(a);
        if (rng() < 0.5) g.release(a);
      } else if (r < 0.3) {
        g.releaseAll();
      }
      g.tick(CONFIG.TICK_MS);
      steps++;
      // Invariants
      for (const row of g.board) assert.strictEqual(row.length, 10);
      assert.strictEqual(g.board.length, TOTAL_ROWS);
      if (g.piece && g.state === 'playing') {
        for (const [x, y] of g.cellsOf(g.piece)) {
          assert(x >= 0 && x < 10 && y >= 0 && y < TOTAL_ROWS, 'piece out of bounds');
          assert.strictEqual(g.board[y][x], null, 'piece overlaps board');
        }
      }
      for (const row of g.board) assert(!row.every(c => c !== null) || g.state === 'clearing', 'full row left on board');
      assert(g.queue.length === CONFIG.NEXT_COUNT);
    }
    games++; totalLines += g.lines;
  }
  console.log(`      (${games} games, ${totalLines} lines cleared)`);
});

// Bot test: a greedy player that actually clears lines -------------------
function botMove(g) {
  const p = g.piece;
  let bestScore = Infinity, best = null;
  for (let rot = 0; rot < 4; rot++) {
    for (let x = -3; x < 10; x++) {
      if (g.collides(p.type, rot, x, p.y)) continue;
      let y = p.y;
      while (!g.collides(p.type, rot, x, y + 1)) y++;
      const b = g.board.map(r => r.slice());
      for (const [dx, dy] of SHAPES[p.type][rot]) b[y + dy][x + dx] = p.type;
      const kept = b.filter(r => !r.every(c => c));
      const cleared = b.length - kept.length;
      let holes = 0, agg = 0, bump = 0, prevH = -1;
      for (let cx = 0; cx < 10; cx++) {
        let seen = false, h = 0;
        for (let cy = 0; cy < kept.length; cy++) {
          if (kept[cy][cx]) { if (!seen) h = kept.length - cy; seen = true; }
          else if (seen) holes++;
        }
        agg += h;
        if (prevH >= 0) bump += Math.abs(h - prevH);
        prevH = h;
      }
      const s = agg * 0.51 + holes * 0.36 * 10 + bump * 0.18 - cleared * 0.76 * 4;
      if (s < bestScore) { bestScore = s; best = { rot, x }; }
    }
  }
  return best;
}
test('bot: 40 greedy games clear lines, level up and stay valid', () => {
  let totalLines = 0, maxLevel = 1;
  for (let seed = 1; seed <= 40; seed++) {
    const g = new Game({ rng: C.mulberry32(seed) });
    let guard = 0;
    while (g.state !== 'over' && g.piecesPlaced < 400 && guard++ < 100000) {
      if (g.state === 'clearing') { g.tick(CONFIG.TICK_MS); continue; }
      const m = botMove(g);
      if (!m) { g.hardDrop(); continue; }
      while (g.piece && g.piece.rot !== m.rot) { if (!g.tryRotate(1)) break; }
      while (g.piece && g.piece.x < m.x && g.tryMove(1, 0));
      while (g.piece && g.piece.x > m.x && g.tryMove(-1, 0));
      g.hardDrop();
      assert.strictEqual(g.lines, Math.round(g.lines));
      assert.strictEqual(g.level, 1 + Math.floor(g.lines / 10));
    }
    totalLines += g.lines; maxLevel = Math.max(maxLevel, g.level);
  }
  assert(totalLines > 1000, 'bot should clear many lines, got ' + totalLines);
  console.log(`      (${totalLines} lines cleared, highest level ${maxLevel})`);
});

// =======================================================================
console.log('\nModes update — difficulty, goals, stages');

function playBot(g, maxPieces = 600) {
  let guard = 0;
  while (g.state !== 'over' && g.piecesPlaced < maxPieces && guard++ < 200000) {
    if (g.state === 'clearing') { g.tick(CONFIG.TICK_MS); continue; }
    const m = botMove(g);
    if (!m) { g.hardDrop(); continue; }
    while (g.piece && g.piece.rot !== m.rot) { if (!g.tryRotate(1)) break; }
    while (g.piece && g.piece.x < m.x && g.tryMove(1, 0));
    while (g.piece && g.piece.x > m.x && g.tryMove(-1, 0));
    g.hardDrop();
  }
  return g;
}

test('difficulty: Normal level 7 and Easy level 10 fall like Hard level 4', () => {
  const mk = d => C.createGame({ mode: 'marathon', difficulty: d });
  const hard = mk('hard'), normal = mk('normal'), easy = mk('easy');
  hard.level = 4; normal.level = 7; easy.level = 10;
  assert.strictEqual(hard.gravityLevel(), 4);
  assert.strictEqual(normal.gravityLevel(), 4);
  assert(Math.abs(easy.gravityLevel() - 4) < 1e-9);
  assert.strictEqual(easy.cfg.LOCK_DELAY_MS, 1000);
  assert.strictEqual(hard.cfg.LOCK_DELAY_MS, 500);
});

test('Hard marathon matches the original game exactly', () => {
  const a = new Game({ rng: C.mulberry32(5) });
  const b = new Game({ rng: C.mulberry32(5), rules: C.buildMode({ mode: 'marathon', difficulty: 'hard' }).rules });
  for (const g of [a, b]) { g.level = 6; }
  assert.strictEqual(a.gravityLevel(), b.gravityLevel());
  eq(a.queue, b.queue);
});

test('Easy lock delay: piece survives 900 ms on the ground', () => {
  const g = C.createGame({ mode: 'marathon', difficulty: 'easy' }); clearBoard(g);
  place(g, 'T', 0, 3, BOTTOM - 1);
  tickFor(g, 900);
  assert.strictEqual(g.piecesPlaced, 0);
  tickFor(g, 120);
  assert.strictEqual(g.piecesPlaced, 1);
});

test('Sprint: reaching 40 lines wins and stops the clock on that piece', () => {
  const g = C.createGame({ mode: 'sprint' }); clearBoard(g);
  g.lines = 39; g.elapsedMs = 61234;
  fillRow(g, BOTTOM, [0]);
  place(g, 'I', 1, -2, BOTTOM - 3);
  g.hardDrop();
  assert.strictEqual(g.state, 'over');
  assert.strictEqual(g.outcome, 'win');
  assert.strictEqual(g.elapsedMs, 61234);
  g.tick(1000);
  assert.strictEqual(g.elapsedMs, 61234);
});

test('Ultra: time up after 2:00 is a finish, not a loss', () => {
  const g = C.createGame({ mode: 'ultra' }); clearBoard(g); g.spawn('T');
  g.elapsedMs = 119990;
  tickFor(g, 20);
  assert.strictEqual(g.state, 'over');
  assert.strictEqual(g.outcome, 'finish');
  assert.strictEqual(g.elapsedMs, 120000);
});

test('timed stage: running out of time is a loss', () => {
  const n = C.STAGES.findIndex(s => s.type === 'timed') + 1;
  const g = C.createGame({ mode: 'stage', stage: n });
  g.elapsedMs = g.rules.timeLimitMs - 5;
  tickFor(g, 10);
  assert.strictEqual(g.outcome, 'lose');
  assert.strictEqual(g.gameOverReason, 'timeup');
});

test('Zen: topping out wipes the board and play continues', () => {
  const g = C.createGame({ mode: 'zen' }); clearBoard(g);
  for (let x = 0; x < 10; x++) { g.board[HID - 2][x] = 'X'; g.board[HID - 1][x] = 'X'; }
  g.spawn('T');
  assert.strictEqual(g.state, 'playing');
  assert.strictEqual(g.zenWipes, 1);
  assert.strictEqual(g.countGems() + g.board.flat().filter(Boolean).length, 0);
  assert(g.piece);
  assert.strictEqual(g.gravityLevel(), 1);
  g.level = 9;
  assert.strictEqual(g.gravityLevel(), 1, 'Zen never speeds up');
});

test('junk pile: one hole per row, right gem count, same every time', () => {
  for (let seed = 1; seed < 50; seed++) {
    const a = C.makeGarbage(10, 4, 0.5, C.mulberry32(seed));
    const b = C.makeGarbage(10, 4, 0.5, C.mulberry32(seed));
    eq(a, b);
    for (const row of a) assert.strictEqual(row.filter(c => c === null).length, 1);
    assert.strictEqual(a.flat().filter(c => c === 'G').length, 4);
    const deepest = Math.max(...a.map((r, i) => (r.includes('G') ? i : -1)));
    assert(deepest >= Math.floor(10 * 2 / 3), 'deepest gem in bottom third');
  }
});

test('dig: clearing a row without a gem does not win; clearing the last gem does', () => {
  const g = new Game({ rng: C.mulberry32(1), rules: { gemGoal: true } }); clearBoard(g);
  fillRow(g, BOTTOM, [0]);                    // junk row, no gem
  fillRow(g, BOTTOM - 1, [0, 9]);             // gem row, two holes
  g.board[BOTTOM - 1][5] = 'G';
  place(g, 'I', 1, -2, BOTTOM - 3);           // vertical I in column 0
  g.hardDrop();                               // clears only the gem-free row
  assert.strictEqual(g.outcome, null);
  assert.strictEqual(g.state, 'clearing');
  tickFor(g, CONFIG.LINE_CLEAR_DELAY_MS + 5);
  assert.strictEqual(g.countGems(), 1);
  eq(g.board[BOTTOM].map(c => (c ? 1 : 0)), [1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
  place(g, 'I', 1, 7, BOTTOM - 3);            // vertical I in column 9
  g.hardDrop();
  assert.strictEqual(g.outcome, 'win');
  assert.strictEqual(g.state, 'over');
  assert.strictEqual(g.countGems(), 0);
});

test('dig: gem events report how many are left', () => {
  const g = new Game({ rng: C.mulberry32(1), rules: { gemGoal: true } }); clearBoard(g);
  fillRow(g, BOTTOM, [0]); g.board[BOTTOM][4] = 'G';
  g.board[BOTTOM - 5][4] = 'G';               // a second gem out of reach
  g.drainEvents();
  place(g, 'I', 1, -2, BOTTOM - 3);
  g.hardDrop();
  const ev = g.drainEvents().find(e => e.type === 'gem');
  eq(ev, { type: 'gem', cleared: 1, left: 1 });
  assert.notStrictEqual(g.outcome, 'win');
});

test('stages: 30 stages, three kinds, speed rises, deterministic layouts', () => {
  assert.strictEqual(C.STAGES.length, 30);
  const kinds = new Set(C.STAGES.map(s => s.type));
  eq([...kinds].sort(), ['dig', 'lines', 'timed']);
  for (let i = 1; i < C.STAGES.length; i++) assert(C.STAGES[i].speed >= C.STAGES[i - 1].speed);
  assert.strictEqual(C.STAGES[29].speed, 8);
  // Dig piles always leave room to play above them.
  for (const st of C.STAGES) if (st.type === 'dig') assert(st.rules.garbage.length <= 14, 'stage ' + st.n);
  const a = C.createGame({ mode: 'stage', stage: 10 }), b = C.createGame({ mode: 'stage', stage: 10 });
  eq(a.board, b.board); eq(a.queue, b.queue);
  for (const st of C.STAGES) {
    assert(st.par2 >= st.par3);
    if (st.rules.timeLimitMs) assert(st.par2 <= st.rules.timeLimitMs);
  }
});

test('stars: 3 at par, 2 within 1.5×, 1 otherwise, 0 if not won', () => {
  const st = C.STAGES[1];   // a dig stage (pieces)
  assert.strictEqual(st.metric, 'pieces');
  const r = (outcome, piecesPlaced) => C.starsFor(st, { outcome, piecesPlaced, elapsedMs: 0 });
  assert.strictEqual(r('win', st.par3), 3);
  assert.strictEqual(r('win', st.par3 + 1), 2);
  assert.strictEqual(r('win', st.par2), 2);
  assert.strictEqual(r('win', st.par2 + 1), 1);
  assert.strictEqual(r('lose', 1), 0);
});

test('daily: same date → same game; next day → different game', () => {
  const a = C.createGame({ mode: 'daily', date: '2026-11-04' });
  const b = C.createGame({ mode: 'daily', date: '2026-11-04' });
  const c = C.createGame({ mode: 'daily', date: '2026-11-05' });
  eq(a.queue, b.queue); eq(a.board, b.board);
  assert.notDeepStrictEqual(JSON.stringify([a.queue, a.board]), JSON.stringify([c.queue, c.board]));
  assert.strictEqual(a.rules.timeLimitMs, 180000);
});

// A second, gem-aware bot that can also use hold. A stage counts as winnable
// if either bot wins it (neither looks ahead, so a planning human does better).
function digBotMove(g) {
  let best = null, bs = Infinity;
  const types = [g.piece.type];
  if (g.canHold) types.push(g.holdType || g.queue[0]);
  types.forEach((type, ti) => {
    for (let rot = 0; rot < 4; rot++) for (let x = -3; x < 10; x++) {
      const y0 = HID - 1;
      if (g.collides(type, rot, x, y0)) continue;
      let y = y0; while (!g.collides(type, rot, x, y + 1)) y++;
      const b = g.board.map(r => r.slice());
      for (const [dx, dy] of SHAPES[type][rot]) b[y + dy][x + dx] = type;
      let gemsGone = 0; const kept = [];
      for (const r of b) { if (r.every(c => c)) gemsGone += r.filter(c => c === 'G').length; else kept.push(r); }
      let holes = 0, agg = 0, bump = 0, prev = -1, maxH = 0;
      for (let cx = 0; cx < 10; cx++) {
        let seen = false, h = 0;
        for (let cy = 0; cy < kept.length; cy++) {
          if (kept[cy][cx]) { if (!seen) h = kept.length - cy; seen = true; } else if (seen) holes++;
        }
        agg += h; maxH = Math.max(maxH, h); if (prev >= 0) bump += Math.abs(h - prev); prev = h;
      }
      const s = agg * 0.5 + holes * 2.5 + bump * 0.25 + Math.max(0, maxH - 14) * 6 - gemsGone * 30
              - (TOTAL_ROWS - kept.length) * 2;
      if (s < bs) { bs = s; best = { rot, x, hold: ti === 1 }; }
    }
  });
  return best;
}
function playDigBot(g, maxPieces = 600) {
  let guard = 0;
  while (g.state !== 'over' && g.piecesPlaced < maxPieces && guard++ < 200000) {
    if (g.state === 'clearing') { g.tick(CONFIG.TICK_MS); continue; }
    const m = digBotMove(g);
    if (!m) { g.hardDrop(); continue; }
    if (m.hold) g.hold();
    while (g.piece && g.piece.rot !== m.rot) { if (!g.tryRotate(1)) break; }
    while (g.piece && g.piece.x < m.x && g.tryMove(1, 0));
    while (g.piece && g.piece.x > m.x && g.tryMove(-1, 0));
    g.hardDrop();
  }
  return g;
}

test('bot: every stage can be won', () => {
  const rows = [];
  for (const st of C.STAGES) {
    let g = playBot(C.createGame({ mode: 'stage', stage: st.n }));
    if (g.outcome !== 'win') g = playDigBot(C.createGame({ mode: 'stage', stage: st.n }));
    assert.strictEqual(g.outcome, 'win', `stage ${st.n} (${st.type}) not won: ${g.gameOverReason}`);
    // Timed stages must be realistic for a person: the bot's piece count at a
    // relaxed 1.2 s per piece still fits inside the time limit.
    if (st.type === 'timed') assert(g.piecesPlaced * 1200 < st.rules.timeLimitMs, `stage ${st.n} too tight: ${g.piecesPlaced} pieces`);
    const v = st.metric === 'pieces' ? g.piecesPlaced : g.piecesPlaced;
    rows.push(`${st.n}:${st.type[0]} ${v}p` + (st.metric === 'pieces' ? `/par ${st.par3}` : ''));
  }
  console.log('      ' + rows.join('  '));
});

test('bot: Sprint, Ultra, Daily and Zen all run to a proper end', () => {
  const s = playBot(C.createGame({ mode: 'sprint' }));
  assert.strictEqual(s.outcome, 'win'); assert(s.lines >= 40);
  const z = playBot(C.createGame({ mode: 'zen' }), 300);
  assert.notStrictEqual(z.state, 'over');
  // Ultra/Daily: tick the clock out after some play.
  for (const mode of ['ultra', 'daily']) {
    const g = playBot(C.createGame({ mode, date: '2026-11-04' }), 60);
    if (g.state !== 'over') { g.elapsedMs = g.rules.timeLimitMs - 100; tickFor(g, 200, 50); }
    assert.strictEqual(g.outcome, 'finish', mode);
  }
});

test('end-of-game stats: clears are counted by size', () => {
  const g = newGame(); clearBoard(g);
  g.board[JUNK[1]][JUNK[0]] = 'X';
  for (const n of [1, 2, 4, 1]) {
    for (let i = 0; i < n; i++) fillRow(g, BOTTOM - i, [0]);
    place(g, 'I', 1, -2, BOTTOM - 3); g.hardDrop();
    tickFor(g, CONFIG.LINE_CLEAR_DELAY_MS + 5);
    for (let y = 0; y < TOTAL_ROWS; y++) g.board[y][0] = null;
  }
  eq(g.stats.clears, [0, 2, 1, 0, 1]);
  assert.strictEqual(g.stats.quads, 1);
  assert.strictEqual(g.stats.maxCombo, 3);
});

console.log('\nPhase 2 — modern scoring');

// T-slot at the bottom: rows B and B-1 are full except the slot, and an
// overhang at (3, B-2) makes the third corner. A T pointing down
// (rot 2, origin x=3, y=B-2) fills (3..5, B-1) and (4, B).
//   B-2: . . . X . . . . . .
//   B-1: X X X . . . X X X X     (lastRowGap leaves one more gap if asked)
//   B  : X X X X . X X X X X
function tSlot(g, { rows = 2, lastRowGap = null } = {}) {
  clearBoard(g); g.score = 0;
  fillRow(g, BOTTOM, [4]);
  fillRow(g, BOTTOM - 1, lastRowGap === null ? [3, 4, 5] : [3, 4, 5, lastRowGap]);
  if (rows < 2) fillRow(g, BOTTOM - 1, [3, 4, 5, 9]);   // B-1 can't clear
  g.board[BOTTOM - 2][3] = 'X';
  g.board[JUNK[1]][JUNK[0]] = 'X';                      // not a perfect clear
}
function lastClear(g) { return g.drainEvents().filter(e => e.type === 'clear' || e.type === 'tspin').pop(); }

test('scoring table: every row of spec section 8 (level 1)', () => {
  eq([1, 2, 3, 4].map(n => C.basePoints(n, null)), [100, 300, 500, 800]);
  eq([0, 1].map(n => C.basePoints(n, 'mini')), [100, 200]);
  eq([0, 1, 2, 3].map(n => C.basePoints(n, 'full')), [400, 800, 1200, 1600]);
  assert.strictEqual(C.B2B_MULTIPLIER, 1.5);
  assert.strictEqual(C.COMBO_POINTS, 50);
  eq(C.PERFECT_CLEAR_POINTS.slice(1), [800, 1200, 1800, 2000]);
  assert.strictEqual(C.PERFECT_CLEAR_B2B_QUAD, 3200);
});

test('difficult clears: Quads and line-clearing T-spins only', () => {
  assert(C.isDifficult(4, null));
  assert(C.isDifficult(1, 'mini') && C.isDifficult(1, 'full'));
  assert(!C.isDifficult(3, null) && !C.isDifficult(0, 'full'));
});

test('T-spin double through a real SRS rotation scores 1200', () => {
  const g = newGame(); tSlot(g);
  place(g, 'T', 3, 3, BOTTOM - 2);         // pointing left, already in the slot
  assert(g.tryRotate(-1), 'rotate into the slot');
  assert.strictEqual(g.piece.rot, 2);
  g.hardDrop();
  const e = lastClear(g);
  assert.strictEqual(e.lines, 2);
  assert.strictEqual(e.tspin, 'full');
  assert.strictEqual(e.name, 'T-SPIN DOUBLE');
  assert.strictEqual(g.score, 1200);
});

test('same slot filled by a move (no rotation) is a plain double', () => {
  const g = newGame(); tSlot(g);
  place(g, 'T', 2, 3, BOTTOM - 2);         // lastWasRotate = false
  g.hardDrop();
  const e = lastClear(g);
  assert.strictEqual(e.tspin, null);
  assert.strictEqual(g.score, 300);
});

test('T-spin single (full) scores 800 × level', () => {
  const g = newGame(); tSlot(g, { rows: 1 }); g.level = 3;
  place(g, 'T', 2, 3, BOTTOM - 2); g.piece.lastWasRotate = true; g.piece.lastKick = 0;
  g.hardDrop();
  const e = lastClear(g);
  assert.strictEqual(e.lines, 1); assert.strictEqual(e.tspin, 'full');
  assert.strictEqual(g.score, 800 * 3);
});

test('T-spin mini (no lines) = 100; last SRS kick upgrades it to a full 400', () => {
  for (const [kick, want, kind] of [[0, 100, 'mini'], [4, 400, 'full']]) {
    const g = newGame(); clearBoard(g); g.score = 0;
    g.board[BOTTOM - 1][3] = 'X';          // TL corner; floor makes BL + BR
    place(g, 'T', 0, 3, BOTTOM - 1); g.piece.lastWasRotate = true; g.piece.lastKick = kick;
    g.hardDrop();
    const e = lastClear(g);
    assert.strictEqual(e.type, 'tspin'); assert.strictEqual(e.tspin, kind);
    assert.strictEqual(g.score, want);
  }
});

test('a 180° rotation\'s last kick does not upgrade a mini', () => {
  const g = newGame(); clearBoard(g);
  g.board[BOTTOM - 1][3] = 'X';
  place(g, 'T', 0, 3, BOTTOM - 1); g.piece.lastWasRotate = true; g.piece.lastKick = 4; g.piece.lastRot180 = true;
  assert.strictEqual(g.tSpinType(g.piece), 'mini');
});

test('T-spin mini single scores 200', () => {
  const g = newGame(); clearBoard(g); g.score = 0;
  fillRow(g, BOTTOM, [3, 4, 5]);
  g.board[BOTTOM - 1][3] = 'X';
  g.board[JUNK[1]][JUNK[0]] = 'X';
  place(g, 'T', 0, 3, BOTTOM - 1); g.piece.lastWasRotate = true; g.piece.lastKick = 0;
  g.hardDrop();
  const e = lastClear(g);
  assert.strictEqual(e.tspin, 'mini'); assert.strictEqual(e.lines, 1);
  assert.strictEqual(g.score, 200);
});

test('only T pieces T-spin; two blocked corners is not enough', () => {
  const g = newGame(); clearBoard(g);
  place(g, 'T', 0, 3, BOTTOM - 1); g.piece.lastWasRotate = true;   // floor = 2 corners
  assert.strictEqual(g.tSpinType(g.piece), null);
  g.board[BOTTOM - 1][3] = 'X';
  place(g, 'L', 0, 3, BOTTOM - 1); g.piece.lastWasRotate = true;
  assert.strictEqual(g.tSpinType(g.piece), null);
});

test('back-to-back Quad scores 800 × 1.5 = 1200', () => {
  const g = newGame(); clearBoard(g); g.score = 0;
  g.b2b = true;                            // previous clear was difficult
  for (let i = 0; i < 4; i++) fillRow(g, BOTTOM - i, [0]);
  g.board[JUNK[1]][JUNK[0]] = 'X';
  place(g, 'I', 1, -2, BOTTOM - 3); g.hardDrop();
  const e = lastClear(g);
  assert(e.b2b); assert.strictEqual(g.score, 1200);
  assert.strictEqual(g.stats.b2bs, 1);
});

test('first Quad is not back-to-back but starts the chain', () => {
  const g = clearWithI(4);
  assert.strictEqual(lastClear(g).b2b, false);
  assert.strictEqual(g.b2b, true);
});

test('a plain single breaks back-to-back; a no-line T-spin and a no-line lock do not', () => {
  const g = newGame(); clearBoard(g); g.b2b = true;
  fillRow(g, BOTTOM, [0]); g.board[JUNK[1]][JUNK[0]] = 'X';
  place(g, 'I', 1, -2, BOTTOM - 3); g.hardDrop();
  assert.strictEqual(lastClear(g).b2b, false);
  assert.strictEqual(g.b2b, false, 'single ends the chain');
  const h = newGame(); clearBoard(h); h.b2b = true;
  h.board[BOTTOM - 1][3] = 'X';
  place(h, 'T', 0, 3, BOTTOM - 1); h.piece.lastWasRotate = true; h.hardDrop();
  assert.strictEqual(h.b2b, true, 'T-spin with no lines keeps B2B');
  place(h, 'O', 0, 7, BOTTOM - 1); h.hardDrop();
  assert.strictEqual(h.b2b, true, 'ordinary placement keeps B2B');
});

test('combo: +50 × combo × level on consecutive clears; a miss resets it', () => {
  const g = newGame(); clearBoard(g); g.score = 0; g.level = 2;
  g.board[JUNK[1]][JUNK[0]] = 'X';
  const single = () => {                    // one single clear with a vertical I
    fillRow(g, BOTTOM, [0]);
    place(g, 'I', 1, -2, BOTTOM - 3); g.hardDrop();
    tickFor(g, CONFIG.LINE_CLEAR_DELAY_MS + 5);
    for (let y = 0; y < TOTAL_ROWS; y++) g.board[y][0] = null;   // tidy column 0
    g.board[JUNK[1]][JUNK[0]] = 'X';
    return lastClear(g);
  };
  const before = () => g.score;
  let s = before(); let e = single(); assert.strictEqual(e.combo, 0); assert.strictEqual(g.score - s, 200);
  s = before(); e = single(); assert.strictEqual(e.combo, 1); assert.strictEqual(g.score - s, 200 + 100);
  s = before(); e = single(); assert.strictEqual(e.combo, 2); assert.strictEqual(g.score - s, 200 + 200);
  assert.strictEqual(e.name, 'SINGLE');
  assert.strictEqual(g.stats.maxCombo, 2);
  place(g, 'O', 0, 7, BOTTOM - 1); g.hardDrop();
  assert.strictEqual(g.combo, -1);
});

test('perfect clear single: 100 + 800', () => {
  const g = newGame(); clearBoard(g); g.score = 0;
  fillRow(g, BOTTOM, [0, 1, 2, 3]);
  place(g, 'I', 0, 0, BOTTOM - 1); g.hardDrop();
  const e = lastClear(g);
  assert(e.perfect); assert.strictEqual(g.score, 900);
  assert.strictEqual(g.stats.perfectClears, 1);
});

test('perfect clear Quad: 800 + 2000; back-to-back: 1200 + 3200', () => {
  const a = clearWithI(4, false);           // (score also includes hard-drop points)
  const ea = lastClear(a);
  assert(ea.perfect); assert.strictEqual(ea.points, 2800);
  const g = newGame(); clearBoard(g); g.score = 0; g.b2b = true;
  for (let i = 0; i < 4; i++) fillRow(g, BOTTOM - i, [0]);
  place(g, 'I', 1, -2, BOTTOM - 3); g.hardDrop();
  assert.strictEqual(g.score, 1200 + 3200);
});

test('perfect clear is not awarded when other blocks remain', () => {
  const g = clearWithI(2);
  assert.strictEqual(lastClear(g).perfect, false);
});

test('clear names', () => {
  assert.strictEqual(C.clearName(3, 'full'), 'T-SPIN TRIPLE');
  assert.strictEqual(C.clearName(0, 'mini'), 'MINI T-SPIN');
  assert.strictEqual(C.clearName(4, null), 'QUAD');
});

test('fuzz: scores stay whole numbers and B2B/combo state stays valid', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = newGame(seed); const r = C.mulberry32(seed * 31);
    const acts = ['left', 'right', 'cw', 'ccw', 'r180', 'hard', 'hold'];
    for (let i = 0; i < 400 && g.state !== 'over'; i++) {
      g.press(acts[Math.floor(r() * acts.length)]);
      tickFor(g, 30, CONFIG.TICK_MS);
      assert(Number.isInteger(g.score), 'score ' + g.score);
      assert(g.combo >= -1);
      assert.strictEqual(typeof g.b2b, 'boolean');
    }
  }
});

console.log('\nTouch moves (used by Stackfall)');

test('nudge moves exactly one cell, no auto-repeat, and stops at walls', () => {
  const g = newGame(); clearBoard(g); g.spawn('O');
  const x0 = g.piece.x;
  assert(g.nudge(-1)); assert.strictEqual(g.piece.x, x0 - 1);
  tickFor(g, 400, CONFIG.TICK_MS);
  assert.strictEqual(g.piece.x, x0 - 1);
  for (let i = 0; i < 20; i++) g.nudge(1);
  assert.strictEqual(Math.max(...cells(g).map(c => c[0])), 9);
  assert(!g.nudge(1));
});

test('softStep moves one row and scores 1; refuses on the floor', () => {
  const g = newGame(); clearBoard(g); g.score = 0;
  g.spawn('T');
  const y0 = g.piece.y;
  assert(g.softStep()); assert.strictEqual(g.piece.y, y0 + 1); assert.strictEqual(g.score, 1);
  place(g, 'T', 0, 3, BOTTOM - 1);
  assert(!g.softStep()); assert.strictEqual(g.score, 1);
});

test('nudge/softStep do nothing while paused or after game over', () => {
  const g = newGame(); clearBoard(g); g.spawn('T');
  const p = JSON.stringify(g.piece);
  g.paused = true;
  assert(!g.nudge(1)); assert(!g.softStep());
  g.paused = false; g.state = 'over';
  assert(!g.nudge(1)); assert(!g.softStep());
  assert.strictEqual(JSON.stringify(g.piece), p);
});

test('a nudge on the ground resets lock delay, like a key move', () => {
  const g = newGame(); clearBoard(g);
  place(g, 'T', 0, 3, BOTTOM - 1);
  tickFor(g, 400);
  assert(g.nudge(1));
  tickFor(g, 400);
  assert.strictEqual(g.piecesPlaced, 0, 'reset kept it alive');
  tickFor(g, 150);
  assert.strictEqual(g.piecesPlaced, 1);
});

console.log('\nZen practice speed');

test('Zen practice: a fixed speed (e.g. 3 s/row) replaces the level curve', () => {
  const g = C.createGame({ mode: 'zen', secondsPerRow: 3 }); clearBoard(g); g.spawn('T');
  assert.strictEqual(g.fallSecondsPerRow(), 3);
  const y0 = g.piece.y;
  tickFor(g, 2900, CONFIG.TICK_MS); assert.strictEqual(g.piece.y, y0);
  tickFor(g, 200, CONFIG.TICK_MS);  assert.strictEqual(g.piece.y, y0 + 1);
});

test('Zen practice: frozen (Infinity) never falls, but soft drop still works', () => {
  const g = C.createGame({ mode: 'zen', secondsPerRow: Infinity }); clearBoard(g); g.spawn('T');
  const y0 = g.piece.y;
  tickFor(g, 10000, CONFIG.TICK_MS); assert.strictEqual(g.piece.y, y0);
  g.press('soft'); tickFor(g, 200, CONFIG.TICK_MS);
  assert(g.piece.y > y0 + 2, 'soft drop moves while frozen');
});

test('Zen practice: speed can change mid-game; the fastest setting drops instantly', () => {
  const g = C.createGame({ mode: 'zen' }); clearBoard(g); g.spawn('T');
  assert.strictEqual(g.fallSecondsPerRow(), 1);                 // default: level 1
  g.setSecondsPerRow(0.0004);
  tickFor(g, CONFIG.TICK_MS, CONFIG.TICK_MS);
  assert.strictEqual(g.piece.y, g.ghostY(), 'one frame lands it');
  g.setSecondsPerRow(0); assert.strictEqual(g.fallSecondsPerRow(), 1);
});

test('other modes ignore the Zen speed setting', () => {
  const g = C.createGame({ mode: 'marathon', difficulty: 'hard', secondsPerRow: 9 });
  assert.strictEqual(g.fallSecondsPerRow(), 1);
});

console.log('\nPhase 4 — player settings');

test('player handling settings reach the game without changing mode rules', () => {
  const g = C.createGame({ mode: 'marathon', difficulty: 'easy' }, { config: { DAS_MS: 100, ARR_MS: 0, SOFT_DROP_FACTOR: 40 } });
  assert.strictEqual(g.cfg.DAS_MS, 100); assert.strictEqual(g.cfg.ARR_MS, 0); assert.strictEqual(g.cfg.SOFT_DROP_FACTOR, 40);
  assert.strictEqual(g.cfg.LOCK_DELAY_MS, 1000, 'Easy keeps its 1 s lock delay');
});

test('custom DAS/ARR: ARR 0 shifts all the way once DAS charges', () => {
  const g = C.createGame({ mode: 'zen' }, { config: { DAS_MS: 100, ARR_MS: 0 } }); clearBoard(g); g.spawn('O');
  const x0 = g.piece.x;
  g.press('left'); assert.strictEqual(g.piece.x, x0 - 1);
  tickFor(g, 90, 1); assert.strictEqual(g.piece.x, x0 - 1, 'not yet charged');
  tickFor(g, 20, 1); assert.strictEqual(Math.min(...cells(g).map(c => c[0])), 0, 'instant to the wall');
});

test('start level: Marathon can start at level 10 and levels up from there', () => {
  const g = C.createGame({ mode: 'marathon', difficulty: 'hard' }, { startLevel: 10 });
  assert.strictEqual(g.level, 10);
  assert(g.fallSecondsPerRow() < C.secondsPerRow(9));
  clearBoard(g); g.lines = 9;
  fillRow(g, BOTTOM, [0]); place(g, 'I', 1, -2, BOTTOM - 3); g.hardDrop();
  assert.strictEqual(g.level, 11);
});

test('createGame without settings behaves exactly as before', () => {
  const a = C.createGame({ mode: 'daily', date: '2026-11-15' }), b = C.createGame({ mode: 'daily', date: '2026-11-15' }, {});
  eq(a.board, b.board); eq(a.queue, b.queue);
  assert.strictEqual(a.cfg.DAS_MS, CONFIG.DAS_MS);
});

console.log('\nStackfall (Android edition)');

const sfHtml = fs.readFileSync(path.join(__dirname, '..', 'stackfall', 'index.html'), 'utf8');
const coreOf = h => { const m = h.match(/<script id="game-core">([\s\S]*?)<\/script>/); return m && m[1]; };

test('Stackfall uses an identical copy of the Prism Stack engine (so every test above covers it)', () => {
  const a = coreOf(sfHtml), b = coreOf(html);
  assert(a, 'Stackfall has no game-core script');
  assert(a === b, 'Stackfall engine differs from Prism Stack: copy index.html\'s game-core into stackfall/index.html');
});

test('both pages\' browser scripts parse (syntax check)', () => {
  for (const [name, h] of [['Prism Stack', html], ['Stackfall', sfHtml]]) {
    const scripts = [...h.matchAll(/<script(?![^>]*id="game-core")[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert(scripts.length >= 1, name);
    for (const s of scripts) new vm.Script(s, { filename: name });
  }
});

test('Stackfall menu offers every Prism Stack mode', () => {
  for (const m of ['marathon', 'sprint', 'ultra', 'daily', 'zen']) assert(sfHtml.includes(`data-m="${m}"`), m);
  assert(sfHtml.includes('data-act="stages"') && sfHtml.includes("data-act=\"diff\""));
  for (const d of Object.keys(C.DIFFICULTY)) assert(sfHtml.includes(`'${d}'`), d);
});

test('Stackfall makes no network requests (no external URLs in code)', () => {
  const code = sfHtml.replace(/<!--[\s\S]*?-->/g, '');
  assert(!/(src|href)\s*=\s*["']https?:/i.test(code), 'external src/href');
  assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(code), 'network API used');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
