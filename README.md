# Prism Stack

A free, ad-free, tracking-free falling-block puzzle game. Each game is a single HTML file that runs offline in any modern browser, with nothing to install.

### ▶ Play now
- **PC (keyboard): https://airypotter.github.io/Prism-Stack/**
- **Phone (touch): https://airypotter.github.io/Prism-Stack/stackfall/**

Or download the repo and double-click `index.html`.

---

## What's here

| Game | File | Best on | Highlights |
|---|---|---|---|
| **Prism Stack** | [`index.html`](index.html) | PC / keyboard | Marathon (Easy / Normal / Hard), 30-stage campaign with star ratings, Sprint, Ultra, Daily Challenge, Zen practice (speed slider), sound and music, settings, key remapping, top-10 scores |
| **Stackfall** | [`stackfall/index.html`](stackfall/index.html) | Android / touch | **All the same modes as Prism Stack** (Marathon Easy/Normal/Hard, 30 Stages, Sprint, Ultra, Daily) plus **Zen practice** with a fall-speed slider from frozen to instant, swipe and tap controls, level sounds, vibration, full-screen, screen wake-lock |

These are two separate apps with their own look, controls and screens. They share one rules engine: Stackfall contains an exact copy of Prism Stack's `game-core` script, so every mode plays by identical rules (the Daily Challenge is even the same puzzle on both). The tests fail if the two copies ever drift apart. To change the rules, edit `index.html` first, then run `node tools/sync-engine.js` to copy the engine into Stackfall.

## Prism Stack features
- 10 × 20 field with a hidden 20-row buffer, 7-bag randomizer, 5-piece next queue, ghost piece and hold
- Full SRS rotation with wall kicks (CW, CCW and 180°)
- Tunable DAS (170 ms) and ARR (50 ms), soft drop and hard drop, 500 ms lock delay with 15 resets
- Guideline gravity curve, level up every 10 lines
- **Modern scoring:** T-spins (full and mini, 3-corner rule), back-to-back ×1.5, combos and perfect clears, with on-screen callouts like "T-SPIN DOUBLE!", "BACK-TO-BACK" and "COMBO ×3"
- **Modes:** Marathon (3 difficulties), **Stages** (30 levels: Lines, Timed and Dig goals, 1–3 stars), **Sprint** (40 lines), **Ultra** (2-minute score attack), **Daily Challenge** (same puzzle for everyone each day, fully offline) and **Zen practice** (no game over, with a fall-speed slider from frozen to instant that you can change mid-game)
- **Sound:** synthesized sound effects for every move, clear and T-spin, plus an optional original music loop (off by default). No audio files; nothing downloads.
- **Settings:** DAS, ARR, soft-drop speed, Marathon start level (1–15), next pieces shown (1–5), ghost piece, sound and music volume, and **key remapping**
- **Top scores:** a top 10 for each Marathon difficulty, Sprint, Ultra and the Daily Challenge, with dates
- **Animations:** pieces flash as they lock, hard drops leave a streak, cleared lines sweep away in coloured shards, the board glows on level-up and greys out at game over. **Calm mode** (in Settings, and automatic if your system asks for reduced motion) tones it all down.
- **End-of-game stats:** pieces per second, singles / doubles / triples / Quads, T-spins, best combo, back-to-backs and perfect clears

### Controls (keyboard)
| Key | Action |
|---|---|
| ← → | Move |
| ↓ | Soft drop |
| Space | Hard drop |
| ↑ / X | Rotate clockwise |
| Z / Ctrl | Rotate counter-clockwise |

Defaults also include A (rotate 180°), C / Shift (hold) and P / Esc (pause). Every key except Esc, Enter and R can be changed in **Settings → Keys**.

## Stackfall controls (touch)
- Drag left/right to move · tap to rotate
- Drag down to soft drop · flick down to hard drop
- Swipe up, or tap the Hold box, to hold
- On-screen buttons do the same things. Android's back button pauses the game.

## Privacy
- **No ads, analytics, trackers, cookies or accounts.**
- **No network requests.** Both games enforce this with the same strict Content-Security-Policy (`default-src 'none'`, `connect-src 'none'`), and the release check confirms zero requests in a real browser.
- Only your scores and settings are saved, in your browser's `localStorage`. They never leave your device. If the browser blocks saving, the game still works with default settings.
- Stackfall can also keep sound clips you choose for its level sounds, stored on your phone only (IndexedDB). It uses vibration, full screen and keep-screen-awake only while you play. Neither game asks for your camera, microphone, location or notifications.

## Development

No build step and no dependencies. Edit the HTML file and refresh the browser.

**Architecture (Prism Stack):** game logic lives in `<script id="game-core">` with no DOM access. Rendering, input and storage are in a separate script, so the core can be tested headless in Node.

**Run the tests** (needs [Node.js](https://nodejs.org) 18+):
```bash
node tests/core.test.js
```
They cover rotation and kicks, the bag, lock delay, gravity, every row of the scoring table (including T-spins, back-to-back, combos and perfect clears), random fuzz games, and a bot that proves all 30 stages are winnable.

**Release checks** (Phase 6):
```bash
node tools/fuzz.js 150          # ~5,850 random + bot games in every mode; checks the rules never break
node tools/browser-check.js     # real headless Chrome at 1280×800 and 390×844: every mode, zero network requests, no errors, low-end CPU
```
`browser-check.js` drives Chrome through its DevTools Protocol with Node's built-in WebSocket, so there's nothing to install. It uses a throwaway profile. Pass Chrome's path as the first argument if it isn't found automatically.

**Shared engine:** after changing the rules in `index.html`, run `node tools/sync-engine.js` to copy them into Stackfall. The tests fail if the two copies differ.

The full design spec and phased roadmap are in [`docs/design-spec.md`](docs/design-spec.md).

## Roadmap
- [x] Phase 0–1: foundation and playable core
- [x] Modes: difficulties, Stages, Sprint, Ultra, Daily, Zen
- [x] Phase 2: T-spins, back-to-back, combos, perfect clears
- [x] Phone play: Stackfall has every Prism Stack mode with touch controls
- [ ] Phase 3: touch controls inside Prism Stack itself (on hold)
- [x] Phase 4: sound and music, settings, key remapping, top-10 scores, Zen practice speed
- [x] Phase 5: animations (lock flash, hard-drop streaks, line-clear sweep and shards, level-up glow, game-over sweep), calm mode, more end-of-game stats, Stages 21–30
- [x] Phase 6: long fuzz runs, headless browser checks (desktop and phone), low-end performance check, privacy audit — **v1.0**

## Contributing
Issues and pull requests are welcome. Please keep the two core rules:
1. **Zero network activity.** No CDNs, web fonts, analytics or external assets.
2. **Original branding.** Don't use trademarked game names, logos, art, music or UI copied from commercial games.

## License
[MIT](LICENSE). Use it, change it, share it.

*Not affiliated with or endorsed by The Tetris Company. "Tetris" is a trademark of its respective owner.*
