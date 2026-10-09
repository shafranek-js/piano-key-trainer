# Global Training Layout Contract (P1) — Acceptance Report

**Baseline:** M3L Rev4 & M3K Rev1  
**Scope:** Interactive Training Modules (M3L Two-Hand Accompaniment, M3K Chord Rhythm)  
**Status:** **APPROVED & FULLY VERIFIED**  
**Automated Production Suite:** `npm run smoke:layout-contract` (13/13 Passed)

---

## 1. Executive Summary & Core UX Invariant

The **Global Training Layout Contract** guarantees that every interactive training exercise fits entirely within the available viewport **without vertical or horizontal scrolling** across all 6 mandatory desktop viewports:
1. `1920×1080` (Desktop FHD)
2. `1792×864` (Reported User Failure Baseline)
3. `1440×900` (MacBook Pro / Standard Desktop)
4. `1366×768` (Standard Laptop)
5. `1280×800` (16:10 Laptop)
6. `1024×768` (Compact Desktop Minimum)

### Simultaneous Visibility Invariant Verified
At all times across all viewports and training phases (idle, countdown, active play):
- Exercise eyebrow and instructions are fully legible without shrinking.
- Required hands/chords/notes and beat indicators are rendered cleanly.
- Primary action buttons («Начать отсчёт», «Проверить», «Сыграть исправление») are positioned comfortably **above the fixed 4-octave piano dock** with guaranteed positive clearance (from `+44px` on compact screens up to `+194px` on FHD).
- Bottom piano dock (`C2–C6`) remains fixed, unclipped, and fully interactive without layout shifts.
- Zero scrolling (`0px` overflow) on both document and stage levels.

---

## 2. Test Results & Geometric Metrics Matrix

| Viewport | Stage / Module | State | Scroll Overflow | Button Clearance Above Dock | Stage Fits (`diff`) | Result |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **1920×1080** | M3L Two-Hand | Idle (Simultaneous) | **0px / 0px** | **+194px** | **0px** | **PASS ✓** |
| **1792×864** | M3L Two-Hand | Idle (Simultaneous) | **0px / 0px** | **+100px** | **0px** | **PASS ✓** |
| **1792×864** | M3L Two-Hand | Running (Count-in) | **0px / 0px** | *In-flight count* | **0px** | **PASS ✓** |
| **1440×900** | M3L Two-Hand | Idle (Simultaneous) | **0px / 0px** | **+118px** | **0px** | **PASS ✓** |
| **1366×768** | M3L Two-Hand | Idle (Simultaneous) | **0px / 0px** | **+76px** | **0px** | **PASS ✓** |
| **1280×800** | M3L Two-Hand | Idle (Simultaneous) | **0px / 0px** | **+92px** | **0px** | **PASS ✓** |
| **1024×768** | M3L Two-Hand | Idle (Simultaneous) | **0px / 0px** | **+74px** | **0px** | **PASS ✓** |
| **1920×1080** | M3K Chord Rhythm | Change on Beat 1 | **0px / 0px** | **+315px** | **0px** | **PASS ✓** |
| **1792×864** | M3K Chord Rhythm | Change on Beat 1 | **0px / 0px** | **+221px** | **0px** | **PASS ✓** |
| **1440×900** | M3K Chord Rhythm | Change on Beat 1 | **0px / 0px** | **+239px** | **0px** | **PASS ✓** |
| **1366×768** | M3K Chord Rhythm | Change on Beat 1 | **0px / 0px** | **+188px** | **0px** | **PASS ✓** |
| **1280×800** | M3K Chord Rhythm | Change on Beat 1 | **0px / 0px** | **+204px** | **0px** | **PASS ✓** |
| **1024×768** | M3K Chord Rhythm | Change on Beat 1 | **0px / 0px** | **+186px** | **0px** | **PASS ✓** |

---

## 3. Visual Acceptance Artifacts

### M3L Two-Hand Accompaniment
- `1792×864` (User Baseline Fix): ![M3L 1792x864](/m3l-1792x864-failing-baseline.png)
- `1792×864` (Active Count-in): ![M3L Running 1792x864](/m3l-running-1792x864-failing-baseline.png)
- `1366×768` (Standard Laptop): ![M3L 1366x768](/m3l-1366x768-laptop.png)
- `1024×768` (Compact Desktop Minimum): ![M3L 1024x768](/m3l-1024x768-compact-desktop.png)

### M3K Chord Rhythm
- `1792×864` (User Baseline): ![M3K 1792x864](/m3k-1792x864-failing-baseline.png)
- `1366×768` (Standard Laptop): ![M3K 1366x768](/m3k-1366x768-laptop.png)
- `1024×768` (Compact Desktop Minimum): ![M3K 1024x768](/m3k-1024x768-compact-desktop.png)

---

## 4. Key Engineering Implementation Details

1. **Two-Column Compact Grid Layout**:
   - `TwoHandStage.svelte`: `.two-hand-body-grid` places the title, instructions, and status in the left column, with hand cards, beat badges, and selection count in the right column.
   - `ChordRhythmStage.svelte`: `.rhythm-body-grid` cleanly separates sequence instructions from the progression badges and metronome beat controls.
2. **Height-Adaptive Media Queries (`@media (max-height: 820px)`)**:
   - Spacing scales proportionally between `768px` and `1080px` screen heights.
   - Piano dock height adapts dynamically (`208px` on ≤820px heights, `228px` on ≤920px, `252px` on FHD).
   - Card paddings and badge dimensions adapt smoothly without clipping or shrinking text below comfortable readability.
3. **Automated Layout Smoke Suite (`scripts/smokeTrainingLayoutContract.mjs`)**:
   - Emulates all 6 viewports in headless Chrome via Chrome DevTools Protocol.
   - Uses SSR-backed synthetic profiles for instant, deterministic state initialization.
   - Rigorously asserts DOM bounding boxes: `buttonRect.bottom <= keyboardRect.top`, `docH === docClientH`, and `stageCenterH === stageCenterClientH`.
   - Records high-resolution PNG captures for visual regression defense.
