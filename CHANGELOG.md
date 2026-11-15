# Changelog

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
