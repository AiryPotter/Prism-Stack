// Long fuzz run: thousands of random games in every mode, checking that the
// rules engine never reaches an impossible state.
//   node tools/fuzz.js            (default: 150 games per mode)
//   node tools/fuzz.js 1000       (more games per mode)
// Exits with code 1 and prints the seed if anything goes wrong.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext(html.match(/<script id="game-core">([\s\S]*?)<\/script>/)[1], ctx);
const C = ctx.PrismCore;
const { CONFIG, TOTAL_ROWS, SHAPES } = C;

const GAMES = Number(process.argv[2]) || 150;
const MAX_TICKS = 13000;                      // ~3.6 min of game time (Ultra and Daily can time out)

// Half the games are played by a simple placement bot (with random noise), so
// line clears, wins and time-outs get exercised, not just quick top-outs.
function botTarget(g) {
  let best = null, bestScore = Infinity;
  const p = g.piece;
  for (let rot = 0; rot < 4; rot++) for (let x = -3; x < CONFIG.COLS; x++) {
    if (g.collides(p.type, rot, x, p.y)) continue;
    let y = p.y; while (!g.collides(p.type, rot, x, y + 1)) y++;
    const b = g.board.map(r => r.slice());
    for (const [dx, dy] of SHAPES[p.type][rot]) b[y + dy][x + dx] = p.type;
    let cleared = 0; const kept = [];
    for (const r of b) { if (r.every(c => c)) cleared++; else kept.push(r); }
    let holes = 0, agg = 0, bump = 0, prevH = -1;
    for (let cx = 0; cx < CONFIG.COLS; cx++) {
      let seen = false, h = 0;
      for (let cy = 0; cy < kept.length; cy++) {
        if (kept[cy][cx]) { if (!seen) h = kept.length - cy; seen = true; } else if (seen) holes++;
      }
      agg += h; if (prevH >= 0) bump += Math.abs(h - prevH); prevH = h;
    }
    const s = agg * 0.51 + holes * 3.6 + bump * 0.18 - cleared * 0.76;
    if (s < bestScore) { bestScore = s; best = { rot, x }; }
  }
  return best;
}
const CELL_OK = new Set([null, 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'X', 'G']);
const STATES = new Set(['playing', 'clearing', 'over']);
const ACTIONS = ['left', 'right', 'soft', 'hard', 'cw', 'ccw', 'r180', 'hold'];

const modes = [
  { mode: 'marathon', difficulty: 'easy' }, { mode: 'marathon', difficulty: 'normal' },
  { mode: 'marathon', difficulty: 'hard' }, { mode: 'sprint' }, { mode: 'ultra' },
  { mode: 'daily', date: '2026-11-15' }, { mode: 'zen' }, { mode: 'zen', secondsPerRow: Infinity },
  { mode: 'zen', secondsPerRow: 0.0004 },
];
for (const st of C.STAGES) modes.push({ mode: 'stage', stage: st.n });

function check(g, prev, where) {
  const fail = msg => { throw new Error(where + ': ' + msg); };
  if (!STATES.has(g.state)) fail('bad state ' + g.state);
  if (g.board.length !== TOTAL_ROWS) fail('board height ' + g.board.length);
  for (const row of g.board) {
    if (row.length !== CONFIG.COLS) fail('row width ' + row.length);
    for (const c of row) if (!CELL_OK.has(c)) fail('bad cell ' + c);
  }
  if (g.state === 'playing' && g.piece) {
    for (const [dx, dy] of SHAPES[g.piece.type][g.piece.rot]) {
      const x = g.piece.x + dx, y = g.piece.y + dy;
      if (x < 0 || x >= CONFIG.COLS || y < 0 || y >= TOTAL_ROWS) fail('piece out of bounds');
      if (g.board[y][x] !== null) fail('piece overlaps the stack');
    }
  }
  if (g.queue.length !== g.cfg.NEXT_COUNT) fail('queue length ' + g.queue.length);
  if (!Number.isInteger(g.score) || g.score < prev.score) fail('score went wrong: ' + prev.score + ' -> ' + g.score);
  if (g.lines < prev.lines) fail('lines went down');
  if (g.level < prev.level) fail('level went down');
  if (g.combo < -1) fail('combo ' + g.combo);
  if (g.rules.timeLimitMs && g.elapsedMs > g.rules.timeLimitMs) fail('clock ran past the limit');
  if (g.rules.noTopOut && g.state === 'over') fail('Zen ended');
  if (g.state === 'over' && !['lose', 'win', 'finish'].includes(g.outcome)) fail('bad outcome ' + g.outcome);
  const k = g.stats.clears;
  if (k[1] + 2 * k[2] + 3 * k[3] + 4 * k[4] !== g.lines) fail('clear counts do not add up to lines');
}

let total = 0, ends = { lose: 0, win: 0, finish: 0, running: 0 }, lines = 0, tspins = 0, pcs = 0;
const t0 = Date.now();
for (const m of modes) {
  for (let i = 0; i < GAMES; i++) {
    const seed = (i + 1) * 7919 + modes.indexOf(m) * 104729;
    const rnd = C.mulberry32(seed);
    const extra = { config: { DAS_MS: 50 + Math.floor(rnd() * 250), ARR_MS: Math.floor(rnd() * 6) * 20,
                              SOFT_DROP_FACTOR: [5, 10, 20, 40, 10000][Math.floor(rnd() * 5)] },
                    startLevel: m.mode === 'marathon' ? 1 + Math.floor(rnd() * 15) : 1 };
    const g = C.createGame(m, extra);
    g.rng = C.mulberry32(seed);   // not used after creation for seeded modes; harmless
    const where = JSON.stringify(m) + ' seed ' + seed;
    let prev = { score: g.score, lines: g.lines, level: g.level };
    const useBot = i % 2 === 0;
    let target = null, lastPiece = null, waitUntil = 0;
    const timed = g.rules.timeLimitMs > 0;   // timed modes: think like a person (0.3–1.2 s a piece)
    try {
      check(g, prev, where);
      for (let t = 0; t < MAX_TICKS && g.state !== 'over'; t++) {
        const r = rnd();
        if (useBot && g.state === 'playing' && g.piece) {
          if (g.piece !== lastPiece) { lastPiece = g.piece; target = botTarget(g); waitUntil = timed ? t + 18 + Math.floor(rnd() * 55) : t; }
          if (t < waitUntil) { /* thinking */ }
          else if (target && r < 0.97) {               // line up and drop in one frame (3% noise)
            for (let k = 0; k < 4 && g.piece && g.piece.rot !== target.rot; k++) g.tryRotate(1);
            while (g.piece && g.piece.x < target.x && g.nudge(1));
            while (g.piece && g.piece.x > target.x && g.nudge(-1));
            if (g.piece) g.hardDrop();
          } else if (r < 0.99) g.press(ACTIONS[Math.floor(rnd() * ACTIONS.length)]);
          else g.release(ACTIONS[Math.floor(rnd() * 3)]);
        } else if (useBot) {
          // clearing / waiting: nothing to do
        } else if (r < 0.25) g.press(ACTIONS[Math.floor(rnd() * ACTIONS.length)]);
        else if (r < 0.4) g.release(ACTIONS[Math.floor(rnd() * 3)]);
        else if (r < 0.45) g.nudge(rnd() < 0.5 ? -1 : 1);
        else if (r < 0.47) g.softStep();
        if (m.mode === 'zen' && rnd() < 0.002) g.setSecondsPerRow([Infinity, 5, 1, 0.1, 0.0004][Math.floor(rnd() * 5)]);
        if (rnd() < 0.003) { g.paused = true; g.tick(CONFIG.TICK_MS); g.paused = false; }
        g.tick(CONFIG.TICK_MS);
        g.drainEvents();
        check(g, prev, where + ' tick ' + t);
        prev = { score: g.score, lines: g.lines, level: g.level };
      }
    } catch (e) {
      console.error('FUZZ FAILURE in ' + where + '\n  ' + e.message);
      process.exit(1);
    }
    total++;
    ends[g.state === 'over' ? g.outcome : 'running']++;
    lines += g.lines; tspins += g.stats.tspins; pcs += g.stats.perfectClears;
  }
}
console.log(`${total} games across ${modes.length} modes/stages in ${((Date.now() - t0) / 1000).toFixed(1)} s — no rule violations.`);
console.log(`Endings: ${ends.lose} lost, ${ends.win} won, ${ends.finish} timed out, ${ends.running} still running at the cap.`);
console.log(`Totals: ${lines} lines, ${tspins} T-spins, ${pcs} perfect clears.`);
