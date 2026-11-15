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
| **Prism Stack** | [`index.html`](index.html) | PC / keyboard | Marathon (Easy / Normal / Hard), 20-stage campaign with star ratings, Sprint, Ultra, Daily Challenge, Zen |
| **Stackfall** | [`stackfall/index.html`](stackfall/index.html) | Android / touch | Swipe and tap controls, combos and back-to-back bonuses, vibration, full-screen, screen wake-lock |

These are two separate codebases that share the same idea. Prism Stack is the main game, and Stackfall is the phone-first version.

## Prism Stack features
- 10 × 20 field with a hidden 20-row buffer, 7-bag randomizer, 5-piece next queue, ghost piece and hold
- Full SRS rotation with wall kicks (CW, CCW and 180°)
- Tunable DAS (170 ms) and ARR (50 ms), soft drop and hard drop, 500 ms lock delay with 15 resets
- Guideline gravity curve, level up every 10 lines
- **Modes:** Marathon (3 difficulties), **Stages** (20 levels: Lines, Timed and Dig goals, 1–3 stars), **Sprint** (40 lines), **Ultra** (2-minute score attack), **Daily Challenge** (same puzzle for everyone each day, fully offline) and **Zen** (no game over)

### Controls (keyboard)
| Key | Action |
|---|---|
| ← → | Move |
| ↓ | Soft drop |
| Space | Hard drop |
| ↑ / X | Rotate clockwise |
| Z / Ctrl | Rotate counter-clockwise |

The in-game **Controls** screen lists hold, 180° rotate and pause.

## Stackfall controls (touch)
- Drag left/right to move · tap to rotate
- Drag down to soft drop · flick down to hard drop
- Swipe up, or tap the Hold box, to hold
- On-screen buttons do the same things. Android's back button pauses the game.

## Privacy
- **No ads, analytics, trackers, cookies or accounts.**
- **No network requests.** Prism Stack enforces this with a strict Content-Security-Policy (`connect-src 'none'`).
- Only your best scores and settings are saved, in your browser's `localStorage`. They never leave your device.

## Development

No build step and no dependencies. Edit the HTML file and refresh the browser.

**Architecture (Prism Stack):** game logic lives in `<script id="game-core">` with no DOM access. Rendering, input and storage are in a separate script, so the core can be tested headless in Node.

**Run the tests** (needs [Node.js](https://nodejs.org) 18+):
```bash
node tests/core.test.js
```
They cover rotation and kicks, the bag, lock delay, gravity, scoring, 300 random fuzz games, and a bot that proves all 20 stages are winnable.

The full design spec and phased roadmap are in [`docs/design-spec.md`](docs/design-spec.md).

## Roadmap
- [x] Phase 0–1: foundation and playable core
- [x] Modes: difficulties, Stages, Sprint, Ultra, Daily, Zen
- [ ] Phase 2: T-spins, back-to-back, combos, perfect clears
- [ ] Phase 3: touch controls in Prism Stack (merging in Stackfall's touch layer)
- [ ] Phase 4: sound, settings, key remapping, top-10 scores
- [ ] Phase 5: animations and polish
- [ ] Phase 6: final hardening and privacy audit

## Contributing
Issues and pull requests are welcome. Please keep the two core rules:
1. **Zero network activity.** No CDNs, web fonts, analytics or external assets.
2. **Original branding.** Don't use trademarked game names, logos, art, music or UI copied from commercial games.

## License
[MIT](LICENSE). Use it, change it, share it.

*Not affiliated with or endorsed by The Tetris Company. "Tetris" is a trademark of its respective owner.*
