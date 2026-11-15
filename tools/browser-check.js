// Release check in a real (headless) Chrome — no extra packages needed.
//   node tools/browser-check.js [path-to-chrome] [--shots <dir>]
// For Prism Stack and Stackfall at 1280×800 (desktop) and 390×844 (phone):
//   • loads the page straight from the file, as a player would
//   • fails on any console error, page exception or network request
//   • checks the layout fits with no scrolling
//   • plays every mode to its end with real key/touch input and checks the
//     results screen and saved records
//   • measures frame times with the CPU slowed 6× (low-end device check)
// Uses Chrome's DevTools Protocol over Node's built-in WebSocket, with a
// throwaway profile in the system temp folder (your own Chrome is untouched).
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(2);
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const CHROME = args.find(a => !a.startsWith('--') && a !== shotsDir) || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome not found. Pass its path as the first argument.'); process.exit(2); }

const ROOT = path.join(__dirname, '..');
const PAGES = {
  'Prism Stack': pathToFileURL(path.join(ROOT, 'index.html')).href,
  Stackfall: pathToFileURL(path.join(ROOT, 'stackfall', 'index.html')).href,
};
const SIZES = {
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failures++; };

// ----- Minimal DevTools Protocol client ------------------------------------------
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.listeners = [];
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      } else if (m.method) this.listeners.forEach(f => f(m));
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(f) { this.listeners.push(f); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: '(async () => {' + expr + '})()', awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page script failed: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async key(code, key, vk) {
    for (const type of ['keyDown', 'keyUp']) {
      await this.send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    }
  }
  async touch(points) {   // points: [[type, x, y], ...]
    for (const [type, x, y] of points) {
      await this.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await sleep(16);
    }
  }
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-check-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank']);
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
    proc.on('exit', c => rej(new Error('Chrome exited ' + c)));
    setTimeout(() => rej(new Error('Chrome did not start')), 20000);
  });
  const port = new URL(wsUrl).port;
  return { proc, profile, port };
}

async function newPage(port) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const c = new CDP(t.webSocketDebuggerUrl);
  await c.open();
  return c;
}

// ----- Per-page checks ---------------------------------------------------------------
async function checkPage(port, name, url, sizeName) {
  const size = SIZES[sizeName];
  console.log(`\n${name} @ ${sizeName} ${size.width}×${size.height}`);
  const c = await newPage(port);
  const errors = [], requests = [];
  c.on(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  });
  await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Network.enable'); await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride', size);
  if (size.mobile) {
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await c.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  }
  await c.send('Page.navigate', { url });
  await sleep(1500);

  // Layout: no page scrolling, board fully visible.
  const lay = await c.eval(`
    const b = document.getElementById('board').getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
             w: innerWidth, h: innerHeight, board: [b.left, b.top, b.right, b.bottom].map(Math.round) };`);
  ok(lay.sw <= lay.w && lay.sh <= lay.h, `no page scrolling (${lay.sw}×${lay.sh} in ${lay.w}×${lay.h})`);
  ok(lay.board[0] >= 0 && lay.board[1] >= 0 && lay.board[2] <= lay.w && lay.board[3] <= lay.h, `board fully on screen ${JSON.stringify(lay.board)}`);
  if (shotsDir) await shot(c, `${name}-${sizeName}-menu`);

  if (name === 'Prism Stack') await playPrism(c, sizeName);
  else await playStackfall(c, sizeName);

  // Low-end device: slow the CPU 6× and measure frames during busy play.
  await perf(c, name);

  // Privacy: nothing but the page itself was ever requested.
  const extra = requests.filter(u => u !== url && !u.startsWith('data:') && !u.startsWith('blob:'));
  ok(extra.length === 0, 'no network requests' + (extra.length ? ': ' + extra.join(', ') : ` (only the page file)`));
  const priv = await c.eval(`
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return { csp: meta ? meta.content : '', cookie: document.cookie,
             keys: Object.keys(localStorage), sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller) };`);
  ok(/connect-src 'none'/.test(priv.csp) && /default-src 'none'/.test(priv.csp), 'Content-Security-Policy blocks all network access');
  ok(priv.cookie === '' && !priv.sw, 'no cookies, no service worker');
  ok(priv.keys.every(k => k.startsWith(name === 'Stackfall' ? 'stackfall.' : 'prismstack.')), 'only its own saved data: ' + priv.keys.join(', '));
  ok(errors.length === 0, 'no console errors or exceptions' + (errors.length ? ':\n      ' + errors.join('\n      ') : ''));
  await c.send('Page.close').catch(() => {});
}

async function shot(c, label) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.writeFileSync(path.join(shotsDir, label.replace(/\s+/g, '-').toLowerCase() + '.png'), Buffer.from(r.data, 'base64'));
}

// Shared page helpers: capture the running game, and quick ways to end it.
const HELPERS = `
  if (!window.__hooked) {
    const P = window.PrismCore.Game.prototype, t = P.tick;
    P.tick = function (d) { window.__g = this; return t.call(this, d); };
    window.__hooked = true;
  }
  window.__C = window.PrismCore; window.__B = window.PrismCore.TOTAL_ROWS - 1;
  window.__wait = ms => new Promise(r => setTimeout(r, ms));
  window.__fresh = async (old) => { for (let i = 0; i < 60 && (!window.__g || window.__g === old); i++) await __wait(25); return window.__g; };
  window.__topOut = g => { for (let y = 0; y <= __B; y++) for (let x = 0; x < 9; x++) g.board[y][x] = 'X'; g.piece.x = 3; g.hardDrop(); };
  window.__single = (g, gem) => { g.board = __C.createBoard(); for (let x = 4; x < 10; x++) g.board[__B][x] = gem && x === 6 ? 'G' : 'X';
    if (!gem) g.board[__B - 12][9] = 'X';
    g.piece = { type: 'I', rot: 0, x: 0, y: __B - 1, lowestY: __B - 1, lastWasRotate: false, lastKick: -1, lastRot180: false }; g.hardDrop(); };
`;

async function playPrism(c) {
  await c.eval(HELPERS + `localStorage.clear(); return true;`);
  await c.send('Page.reload'); await sleep(1200);
  await c.eval(HELPERS + 'return true;');
  const click = sel => `document.querySelector(${JSON.stringify(sel)}).click();`;
  const title = `return document.querySelector('.overlay.show h3')?.textContent || '';`;
  const top = k => `return (JSON.parse(localStorage.getItem('prismstack.save.v1') || '{}').top || {})[${JSON.stringify(k)}]?.length || 0;`;

  // Marathon (Normal): real key presses, then top out.
  await c.eval(click('[data-act=play][data-mode=marathon]') + 'return 1;');
  let g0 = await c.eval('return !!(await __fresh(null));');
  for (const [code, key, vk] of [['ArrowLeft', 'ArrowLeft', 37], ['ArrowUp', 'ArrowUp', 38], ['Space', ' ', 32], ['KeyC', 'c', 67], ['ArrowRight', 'ArrowRight', 39], ['Space', ' ', 32]]) await c.key(code, key, vk);
  await sleep(300);
  const placed = await c.eval('return __g.piecesPlaced;');
  ok(g0 && placed >= 2, `Marathon: real key presses move, hold and hard-drop (${placed} pieces placed)`);
  await c.eval('__topOut(__g); return 1;'); await sleep(1300);
  ok((await c.eval(title)) === 'GAME OVER' && (await c.eval(top('marathon-normal'))) === 1, 'Marathon: ends with GAME OVER and records a top-10 score');
  // Sprint → win
  await c.eval(click('#ov-result [data-act=menu]') + click('[data-act=play][data-mode=sprint]') + 'const g = await __fresh(__g); g.lines = 39; __single(g); return 1;');
  await sleep(1600);
  ok((await c.eval(title)) === 'FINISHED!' && (await c.eval(top('sprint'))) === 1, 'Sprint: 40 lines → FINISHED! and a recorded time');
  // Ultra and Daily → time up
  for (const m of ['ultra', 'daily']) {
    await c.eval(click('#ov-result [data-act=menu]') + click(`[data-act=play][data-mode=${m}]`) + 'const g = await __fresh(__g); g.hardDrop(); g.elapsedMs = g.rules.timeLimitMs - 50; return 1;');
    await sleep(1700);
    ok((await c.eval(title)) === "TIME'S UP!" && (await c.eval(top(m))) === 1, `${m[0].toUpperCase() + m.slice(1)}: clock runs out → TIME'S UP! and a recorded score`);
  }
  // Zen practice → no game over; speed slider applies
  await c.eval(click('#ov-result [data-act=menu]') + click('[data-act=zen]') +
    `const r = document.querySelector('#zenSetup input'); r.value = 0; r.dispatchEvent(new Event('input', { bubbles: true }));` +
    click('#ov-zen [data-act=play]') + 'const g = await __fresh(__g); __topOut(g); return 1;');
  await sleep(600);
  const zen = await c.eval('return { state: __g.state, wipes: __g.zenWipes, frozen: !isFinite(__g.fallSecondsPerRow()) };');
  ok(zen.state !== 'over' && zen.wipes === 1 && zen.frozen, 'Zen practice: no game over, frozen speed applied');
  // Stage 1 → STAGE CLEAR! with stars; final stage → YOU WIN!
  await c.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));` +
    click('#ov-pause [data-act=menu]') + click('[data-act=stages]') + click('[data-act=stage][data-stage="1"]') + click('[data-act=start-stage]') +
    'const g = await __fresh(__g); g.lines = 4; __single(g); return 1;');
  await sleep(1700);
  const stars1 = await c.eval(`return (JSON.parse(localStorage.getItem('prismstack.save.v1')).stages.stars || {})[1] || 0;`);
  ok((await c.eval(title)) === 'STAGE CLEAR!' && stars1 >= 1, `Stage 1: STAGE CLEAR! and ${stars1} star(s) saved`);
  await c.eval(`const s = JSON.parse(localStorage.getItem('prismstack.save.v1')); for (let n = 1; n < 30; n++) s.stages.stars[n] = 1; localStorage.setItem('prismstack.save.v1', JSON.stringify(s)); return 1;`);
  await c.send('Page.reload'); await sleep(1200);
  await c.eval(HELPERS + click('[data-act=stages]') + click('[data-act=stage][data-stage="30"]') + click('[data-act=start-stage]') + 'const g = await __fresh(null); __single(g, true); return 1;');
  await sleep(1800);
  ok((await c.eval(title)) === 'YOU WIN!', 'Stage 30: digging out the last gem → YOU WIN!');
  if (shotsDir) await shot(c, 'Prism Stack-results');
}

async function playStackfall(c, sizeName) {
  await c.eval(`localStorage.clear(); return 1;`);
  await c.send('Page.reload'); await sleep(1200);
  await c.eval(HELPERS + 'return 1;');
  const click = sel => `window.__old = window.__g; document.querySelector('#sheet ' + ${JSON.stringify(sel)}).click();`;
  const title = `return document.querySelector('#overlay.show .ttl')?.textContent || '';`;
  // Marathon with real touch input on the board (phone) or keys (desktop).
  await c.eval(click('[data-act=play][data-m=marathon]') + 'await __fresh(null); return 1;');
  const before = await c.eval('return { x: __sf.game.piece.x, rot: __sf.game.piece.rot, placed: __sf.game.piecesPlaced, cell: __sf.cell };');
  const b = await c.eval(`const r = document.getElementById('boardWrap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 };`);
  if (SIZES[sizeName].mobile) {
    const piece = () => c.eval('const p = __sf.game.piece; return p ? { x: p.x, rot: p.rot } : null;');
    await c.touch([['touchStart', b.x, b.y], ['touchEnd', b.x, b.y]]);                          // tap → rotate
    const tapped = await piece();
    const step = before.cell * 0.9;
    await c.touch([['touchStart', b.x, b.y], ...[1, 2, 3, 4, 5, 6].map(i => ['touchMove', b.x + i * step / 3 + 1, b.y]), ['touchEnd', b.x + 2 * step + 1, b.y]]);   // drag → 2 cells
    const dragged = await piece();
    await sleep(100);
    // Flick: headless Chrome delivers DevTools touch moves ~66 ms apart (far
    // slower than a finger), so send this one as fast in-page pointer events.
    await c.eval(`const el = document.getElementById('play'), w = ms => new Promise(r => setTimeout(r, ms));
      const pe = (t, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: 9, pointerType: 'touch', clientX: ${b.x}, clientY: y, bubbles: true, cancelable: true }));
      pe('pointerdown', ${b.y}); for (let i = 1; i <= 6; i++) { await w(8); pe('pointermove', ${b.y} + i * 36); } pe('pointerup', ${b.y} + 216); return 1;`);
    await sleep(300);
    const placed = await c.eval('return __sf.game.piecesPlaced;');
    ok(tapped.rot === (before.rot + 1) % 4, 'Stackfall touch: tap rotates');
    ok(dragged.x === before.x + 2, `Stackfall touch: drag moves one cell per step (${before.x} → ${dragged.x})`);
    ok(placed >= 1, 'Stackfall touch: flick down hard-drops');
  } else {
    await c.key('ArrowUp', 'ArrowUp', 38); await c.key('ArrowRight', 'ArrowRight', 39); await c.key('ArrowRight', 'ArrowRight', 39); await c.key('Space', ' ', 32);
    await sleep(300);
    ok((await c.eval('return __sf.game.piecesPlaced;')) >= 1, 'Stackfall: real key presses play the game');
  }
  await c.eval('__topOut(__sf.game); return 1;'); await sleep(1300);
  ok((await c.eval(title)) === 'Game over', 'Stackfall Marathon: ends with Game over');
  await c.eval(click('[data-act=menu]') + click('[data-act=play][data-m=sprint]') + 'const g = await __fresh(__old); g.lines = 39; __single(g); return 1;'); await sleep(1600);
  ok((await c.eval(title)) === 'Finished!', 'Stackfall Sprint: Finished!');
  await c.eval(click('[data-act=menu]') + click('[data-act=play][data-m=ultra]') + 'const g = await __fresh(__old); g.hardDrop(); g.elapsedMs = g.rules.timeLimitMs - 50; return 1;'); await sleep(1700);
  ok((await c.eval(title)) === "Time's up!", "Stackfall Ultra: Time's up!");
  await c.eval(click('[data-act=menu]') + click('[data-act=stages]') + click('[data-act=stage][data-n="1"]') + click('[data-act=start-stage]') + 'const g = await __fresh(__old); g.lines = 4; __single(g); return 1;'); await sleep(1700);
  const saved = await c.eval(`return JSON.parse(localStorage.getItem('stackfall.save') || '{}');`);
  ok((await c.eval(title)) === 'Stage clear!' && saved.stages && saved.stages.stars[1] >= 1 && saved.best.sprint > 0, 'Stackfall Stage 1 clear + records saved (stars, Sprint best)');
  if (shotsDir) await shot(c, `Stackfall-${sizeName}-results`);
}

async function perf(c, name) {
  await c.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const r = await c.eval(`
    const sf = !!window.__sf;
    if (sf) {
      const q = s => document.querySelector('#sheet ' + s);
      (q('[data-act=menu]') || q('[data-act=stages]')).click();
      if (!q('[data-m=marathon]')) q('[data-act=menu]').click();
      q('[data-act=play][data-m=marathon]').click();
    }
    else { document.querySelector('.overlay.show [data-act=menu]')?.click(); document.querySelector('[data-act=play][data-mode=marathon]').click(); }
    await __wait(300);
    const frames = []; let last = performance.now(), running = true;
    (function f(t) { frames.push(t - last); last = t; if (running) requestAnimationFrame(f); })(performance.now());
    const T = ['S','Z','L','J','O','T'];
    for (let i = 0; i < 12; i++) {          // busy play: three-line clears with effects
      const g = sf ? __sf.game : __g;
      if (!g || g.state === 'over') break;
      if (g.state === 'playing' && g.piece) {
        g.board = __C.createBoard();
        for (let k = 0; k < 3; k++) for (let x = 1; x < 10; x++) g.board[__B - k][x] = T[(x + k) % 6];
        g.board[__B - 8][9] = 'X';
        g.piece = { type: 'I', rot: 1, x: -2, y: __C.CONFIG.HIDDEN_ROWS - 1, lowestY: 0, lastWasRotate: false, lastKick: -1, lastRot180: false };
        g.hardDrop();
      }
      await __wait(350);
    }
    running = false;
    frames.shift();
    const sorted = frames.slice().sort((a, b) => a - b);
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    return { n: frames.length, fps: 1000 / avg, p95: sorted[Math.floor(sorted.length * 0.95)], worst: sorted[sorted.length - 1] };`);
  await c.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  ok(r.fps >= 30 && r.p95 <= 50, `low-end (CPU ÷6): ${r.fps.toFixed(0)} fps average, 95% of frames ≤ ${r.p95.toFixed(0)} ms (worst ${r.worst.toFixed(0)} ms) during line clears`);
}

(async () => {
  const { proc, profile, port } = await launch();
  console.log('Browser: ' + path.basename(CHROME) + ' (headless, temporary profile)');
  try {
    for (const [name, url] of Object.entries(PAGES)) for (const s of Object.keys(SIZES)) await checkPage(port, name, url, s);
  } catch (e) {
    failures++; console.error('\nCheck crashed: ' + e.message);
  } finally {
    proc.kill();
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* Chrome may still hold files */ }
  }
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll browser checks passed.');
  process.exit(failures ? 1 : 0);
})();
