# Prism Stack — design spec (ad-free, offline falling-block puzzle game)
*Prompt v2 · built in phases · one `index.html`*

## 1. Goal
Build a complete falling-block puzzle game with modern guideline-style mechanics, delivered as ONE self-contained `index.html` that runs by double-clicking it, fully offline.

- Working title: **Prism Stack** (original name).
- Don't use any trademarked game name or logo, and don't copy any commercial game's artwork, music, sound effects or UI layout. Call a 4-line clear a "Quad" in the UI.
- Gameplay mechanics should match the modern standard as closely as possible. Conventional per-piece colour associations are fine.

## 2. Priorities (when trade-offs are needed)
1. Correct, responsive game feel (rotation, lock delay, DAS/ARR)
2. Zero network activity
3. Comfortable mobile play
4. Visual polish

## 3. Working method
- Build in the phases in section 13, one phase per request unless told otherwise.
- Every phase must leave the game loadable with no console errors, and must not break earlier phases.
- At the end of each phase: run the automated tests, deliver `index.html` as a downloadable file (not pasted into chat), and report what was done, test results, and known gaps.
- Keep a single "core" `<script id="game-core">` with no DOM access, so it can be loaded and tested headless in Node. All browser code (rendering, input, audio, storage) lives in a separate script.

## 4. Playfield and pieces
- 10 × 20 visible field plus 20 hidden buffer rows above it (40-row matrix).
- Seven tetrominoes (I, O, T, S, Z, J, L) defined in standard SRS bounding boxes.
- Spawn just above the visible field, flat side down, centred (3-wide pieces left of centre), then drop one row immediately if space allows.
- 7-bag randomizer.
- Next queue showing 5 pieces.
- Ghost piece (toggleable from Phase 4).

## 5. Rotation
- Full Super Rotation System (SRS): standard kick tables for J/L/S/T/Z and the separate I-piece table, clockwise and counter-clockwise. O does not kick.
- 180° rotation with a small, documented kick set.
- Record whether the last successful action was a rotation and which kick was used (needed for T-spins).

## 6. Movement and timing
- Fixed-timestep logic at 60 Hz, decoupled from rendering.
- DAS (default 170 ms) and ARR (default 50 ms; 0 = instant), handled in the game loop. Ignore OS key repeat (`event.repeat`). When both left and right are held, the most recent wins; releasing it hands control back to the other.
- DAS charge carries through line-clear delays and into the next piece.
- Soft drop at 20× gravity (never slower than gravity).
- Lock delay of 500 ms. A successful move or rotation while grounded resets it, up to 15 times per piece; the next grounded move locks immediately. The counter resets only when the piece reaches a new lowest row.
- Gravity follows the guideline curve: seconds per row = (0.8 − (level − 1) × 0.007)^(level − 1), capped at level 20. Level up every 10 lines.
- No entry delay; a short line-clear animation (about 200 ms) that never drops inputs.

## 7. Hold
- Usable once per piece until it locks. The swapped-in piece spawns at the spawn position in its default orientation. Hold box greys out while unavailable.

## 8. Scoring (guideline values, multiplied by level at the time of the clear)
| Action | Points |
|---|---|
| Single / Double / Triple / Quad | 100 / 300 / 500 / 800 |
| T-spin mini (no lines) / mini single | 100 / 200 |
| T-spin (no lines) / single / double / triple | 400 / 800 / 1200 / 1600 |
| Back-to-back (consecutive Quads or T-spin clears) | × 1.5 on that clear |
| Combo | 50 × combo count |
| Perfect clear: single / double / triple / Quad | 800 / 1200 / 1800 / 2000 (B2B Quad 3200) |
| Soft drop / hard drop | 1 / 2 per cell (not multiplied by level) |

- T-spin detection: last successful action was a rotation and 3 of the 4 corners around the T's centre are occupied (walls and floor count). Full vs mini uses the two front corners; the final SRS kick upgrades a mini to a full T-spin.
- Short action popups: "T-SPIN DOUBLE", "BACK-TO-BACK", "COMBO ×3", "PERFECT CLEAR".

## 9. Game over
- Block out: a new piece spawns overlapping existing blocks.
- Lock out: a piece locks entirely above the visible field.
- Clear game-over overlay with final score, lines, level, time, and whether it's a new best.

## 10. Controls
**Keyboard** (`event.code`):
| Action | Keys |
|---|---|
| Move left / right | ← / → |
| Soft drop | ↓ |
| Hard drop | Space |
| Rotate clockwise | ↑ or X |
| Rotate counter-clockwise | Z or Ctrl |
| Rotate 180° | A |
| Hold | C or Shift |
| Pause / resume | P or Esc |
| Restart | R (asks for confirmation mid-game) |
| Start / confirm | Enter |

- `preventDefault` on game keys so the page never scrolls; don't intercept Alt/Cmd browser shortcuts.
- Keys remappable in settings (Phase 4).
- Auto-pause when the tab is hidden or the window loses focus; release all held keys on pause.

**Touch** (Phase 3):
- Default gestures: drag sideways to move (one cell per finger step), tap to rotate clockwise, two-finger tap to rotate counter-clockwise, fast flick down to hard drop, slow drag down to soft drop, flick up to hold.
- Alternative on-screen buttons (left, right, rotate CW, rotate CCW, soft drop, hard drop, hold, pause), with press-and-hold using the same DAS/ARR.
- Pointer events, `touch-action: none` on the play area, no double-tap zoom, safe-area insets, controls clear of the playfield in portrait and landscape.
- Haptics via `navigator.vibrate` where supported (toggleable).

## 11. Audio, settings and storage
- Sound effects synthesised with the Web Audio API only. No audio files. Optional original background loop, off by default. Audio starts only after the first user interaction.
- Settings: DAS, ARR, soft-drop speed, ghost, next count (1–5), sound, music, haptics, touch layout, key bindings, start level (1–15).
- `localStorage` only for settings and high scores (top 10 per mode, with date). Wrap all access in try/catch; the game must work without storage.

## 12. Privacy (enforced, not just promised)
- In `<head>`, before any resource-bearing element, a Content-Security-Policy meta tag that blocks all network access:
  `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src data: blob:; connect-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'`
- A `data:` favicon so the browser never requests one.
- No ads, analytics, telemetry, tracking, fingerprinting, cookies, third-party code, external fonts/CSS/CDNs, or `fetch`/XHR/WebSocket/beacon calls. System font stack only. No network URLs anywhere in the file.

## 13. Phased plan
| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Foundation** | File skeleton, CSP and privacy lock-down, constants block, tetromino and SRS data, board model, 7-bag, collision, headless Node test harness | Data and collision tests pass; page loads with no errors and no network requests |
| **1 — Playable core** | Piece lifecycle, gravity curve, DAS/ARR, soft/hard drop, SRS + 180° rotation, lock delay with reset cap, line clears with delay, hold, next ×5, ghost, line-clear and drop scoring, levels, block-out/lock-out, pause and auto-pause, restart with confirm, keyboard input, canvas rendering, dark neon UI, overlays, best score | Desktop Marathon playable from start to game over; unit and fuzz tests pass |
| **1.5 — Modes ✅** | Main menu; Marathon in Easy / Normal / Hard (Hard = the original Phase 1 game; Normal ramps speed at ½ pace; Easy at ⅓ pace with 1 s lock delay); Stages mode with 20 stages mixing Lines, Timed and Dig (collect gems from a junk pile), 1–3 star ratings, unlocks, "STAGE CLEAR!" and final "YOU WIN!" screens with confetti; Sprint 40L, Ultra 2:00, Daily Challenge (date-seeded, offline), Zen (no game over, no speed-up); per-mode records saved locally; keyboard menu navigation | Every stage proven winnable by test bots; all modes reach a proper end in headless Chrome |
| **2 — Modern scoring** | T-spin detection (full/mini), back-to-back, combos, perfect clears, action popups | Scoring tests cover every row of the table in section 8 |
| **3 — Mobile and touch** | Gesture controls, button layout option, responsive polish, safe areas, haptics, orientation handling | Comfortable to play a full game on a phone in portrait |
| **4 — Audio, settings, storage** | Web Audio SFX and optional music, settings panel, key remapping, top-10 scores | Settings persist across reloads; game works with storage blocked |
| **5 — Polish** | (Mode select, Sprint, Ultra and records moved to 1.5.) Lock/level-up/clear animations, more end-of-game stats, extra stages | Each mode completes and records correctly |
| **6 — Hardening and release** | Full test pass, long fuzz runs, headless browser checks at 1280×800 and 390×844, low-end performance check, final privacy audit | No known bugs; zero network requests; final file delivered |

## 14. Rendering and code
- HTML5 canvas scaled for `devicePixelRatio`, with pre-rendered block sprites for performance.
- Dark theme, vibrant neon/gradient blocks, rounded panels, subtle glow, kept light enough for phones.
- Vanilla JavaScript in clearly commented sections: constants/tuning, tetromino and SRS data, randomizer, board, collision, movement, rotation, locking, line clearing, scoring, levels, hold, next queue, input, audio, rendering, UI/state management, storage.
- All tunable numbers in one constants block.

## 15. Verification (every phase)
1. Load the core script headless in Node and run automated tests: 7-bag fairness, SRS kicks including the I piece, line clears including non-adjacent rows, scoring, lock-delay reset cap, hold once per piece, block-out and lock-out, restart resetting state, pause freezing timers, DAS/ARR timing, plus a randomised fuzz run checking that pieces never leave the board or overlap blocks.
2. Scan the file for network URLs and network APIs.
3. If a headless browser is available, confirm zero console errors and zero network requests, and screenshot at desktop and phone sizes.
4. Fix anything found and re-run before delivering.
