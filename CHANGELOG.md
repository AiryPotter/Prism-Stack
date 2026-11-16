# Changelog

## v1.0.1 — fixes from an independent code audit

### Prism Stack
- **Music no longer keeps playing in a background tab.** Switching tabs paused the game, but the music only stopped on the next screen redraw, which browsers skip for hidden tabs.
- **Rebinding a key can't leave an action with no key.** Taking a key from another action now swaps the two actions' keys.
- **Page zoom works again**, for anyone who needs larger text.
- **Calm mode, and your system's "reduce motion" setting, now cover every animation.** That includes the winning-title shimmer, star pops, menu fades, the blinking key prompt and twinkling gems. Turning on "reduce motion" while the game is open now takes effect straight away.
- **Better screen-reader support:**
  - menus are announced as dialogs
  - settings switches and key buttons say what they control
  - the board, hold and next areas have names
  - pausing, level-ups and results are announced
- **The board is drawn crisply at 125% and 150% display scaling.** Before, a strip of the board could be left blank, or the bottom row clipped.
- **Smaller fixes:**
  - "Reset all" applies calm mode immediately.
  - The pause hint shows your actual pause key.
  - Enter on a settings slider no longer closes Settings.
  - Duplicate slider IDs are gone.
  - Audio resumes after an iOS interruption.

### Stackfall
- **A tap on the Next or stats cards no longer rotates the piece.** A second finger no longer hijacks a swipe already in progress.
- **The system "reduce motion" setting is respected:** no shake, and messages fade instead of bouncing.
- **Better screen-reader support:**
  - menus are announced as dialogs, and the game behind them is disabled while they're open
  - toggles report on/off
  - sound preview buttons are named
  - pausing and results are announced
- **Smaller fixes:**
  - The long-press block now covers only the game area, not the menus.
  - Audio resumes after an iOS interruption.

### Checks
- 14 new regression checks in `tools/browser-check.js`, one or more for each fix above.

## v1.0 — first full release

Two free, ad-free, offline falling-block puzzle games, each a single HTML file:
**Prism Stack** (PC, keyboard) and **Stackfall** (phones, touch). They share one rules engine.

### Game modes (both games)
- Marathon in Easy, Normal and Hard
- 30 Stages with Lines, Timed and Dig goals, 1–3 star ratings and unlocks, ending in "YOU WIN!"
- Sprint (40 lines), Ultra (2 minutes) and a Daily Challenge (the same puzzle on both games each day)
- Zen practice: no game over, with a fall-speed slider from frozen to instant that you can change mid-game

### Scoring
Guideline scoring with T-spins (full and mini), back-to-back ×1.5, combos and perfect clears.

### Prism Stack (PC)
- Synthesized sound effects and an optional original music loop. No audio files.
- Settings: DAS, ARR, soft-drop speed, start level, next pieces shown, ghost piece, volumes and key remapping
- Top 10 scores per mode, with dates
- Animations: lock flash, hard-drop streaks, line-clear sweep and shards, level-up glow and game-over sweep. A calm mode follows your system's reduced-motion setting.
- End-of-game stats: pieces per second, clears by size, T-spins, best combo, back-to-backs and perfect clears

### Stackfall (phones)
- Swipe, tap and flick controls, plus on-screen buttons
- Level sounds (you can use your own clips), vibration, full screen, keep-screen-awake, and the Android back button pauses

### Quality and privacy (Phase 6)
- 89 unit tests, including bots that prove all 30 stages are winnable
- Long fuzz run: 5,850 games across every mode and stage with zero rule violations (341,271 lines cleared)
- Headless Chrome checks at 1280×800 and 390×844 on both games:
  - every mode plays to its proper end and saves its records
  - no console errors
  - no page scrolling
  - about 47–54 fps with the CPU slowed 6×
- Privacy audit:
  - zero network requests in a real browser
  - the same strict Content-Security-Policy on both pages. This was added to Stackfall during the audit.
  - no cookies or service workers, and only each game's own saved data
  - no camera, microphone, location or notification access
