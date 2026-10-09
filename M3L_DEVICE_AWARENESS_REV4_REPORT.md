# M3L Rev4 — Selected-Port Disconnect & Calibration Event Isolation Report

## 1. Baseline and scope

- **Baseline:** M3L Rev3 on `stabilization/m3k-audit-remediation`.
- **Status:** Resolves the two remaining MIDI lifecycle blockers identified in physical acceptance:
  1. Selected MIDI port disconnect tracking (Fix 1).
  2. Calibration event isolation on callback completion (Fix 2).
  3. Plus component lifecycle cleanup (`cancelTwoHandRun` on page unmount, tab hidden, navigation away).
- All device-aware arrangements, port filtering, metronome, correction handling, FSRS, and persistence contracts remain strictly intact.

## 2. Fix 1 — Selected MIDI port disconnect

Tracks the actual connection state of the selected MIDI input port, not merely whether any global MIDI input remains attached.

### Implementation
- `MidiController` now tracks connected port IDs via `connectedPortIds: Set<string>`, exposed via `isPortConnected(portId)` and `getConnectedPortIds()`. Disconnecting any port immediately calls `clearPortHeldNotes(portId)`.
- `App.svelte` tracks `isSelectedMidiInputConnected` derived from `selectedMidiInput && selectedMidiInput.state === 'connected'`.
- `selectedMidiInput` strictly derives from `selectedMidiInputId` without silently falling back to another connected port.
- `refreshMidiInputs()` preserves `selectedMidiInputId`, preventing silent substitution of port B when port A disconnects.
- `twoHandRangeVerified` requires `isSelectedMidiInputConnected && isRangeVerified(...)`. If the selected port is disconnected, the status displays `Инструмент отключён: подключите инструмент или выберите другой в настройках` and physical grading is disabled.
- In `onStatusChange`, disconnect detection checks `(wasReady && !st.connected) || (wasSelectedConnected && !isNowSelectedConnected)`.
- If an active run is in progress:
  - Run stops immediately via `cancelTwoHandRun()`.
  - All pending beat and timeout timers are cleared.
  - Active notes for the disconnected port are cleared.
  - Status is set to interrupted with warning feedback: `Выбранный MIDI-инструмент отключён. Упражнение остановлено без оценки: подключите инструмент и начните заново.` (`feedbackTone: 'warn'`).
  - No failed trial, no FSRS mutation, and zero `ReviewLogEvent`s.
  - Port B (or any secondary device) cannot silently replace port A for grading.

### Test & Smoke Verification
- Unit test in `tests/unit/midiPortIsolation.test.ts`: `selected port disconnect cleans its held notes and notifies without touching other ports`.
- Production smoke scenario `M3L-11B` in `scripts/smokeM3l.mjs`: Connects ports A and B, selects and calibrates A, starts an active run, disconnects A while B remains connected; asserts run stops immediately, beat timers cancel, no failed trial or ReviewLog is recorded, and playing B produces zero attempt.

## 3. Fix 2 — Calibration event isolation

Ensures that calibration mode state is captured before notifying raw-note listeners, so that a callback disabling calibration on the rightmost key cannot cause that final Note On to leak into gameplay listeners.

### Implementation
- In `MidiController.ts`, `const wasCalibration = this.calibrationMode;` is captured **before** executing `rawNoteListeners`.
- Even when a raw-note callback sets `this.setCalibrationMode(false)`, the current Note On is treated as a calibration event:
  - Consumed from ordinary note delivery (zero scored Note On events, zero audio synth triggers).
  - Tracked in `calibrationVoiceKeys.add(voiceKey)`.
- On release of the rightmost key:
  - Even though `calibrationMode` is now `false`, `isCalibrationRelease = this.calibrationMode || this.calibrationVoiceKeys.has(voiceKey)` detects that the voice originated during calibration.
  - The matching Note Off is consumed: zero ordinary Note Off events dispatched, and the key is pruned from `calibrationVoiceKeys`.
- No leaked held notes, no audio voice leak, and no M3L attempt created.
- The next intentional Note On after calibration operates completely normally.

### Test & Smoke Verification
- Unit test in `tests/unit/midiPortIsolation.test.ts`: `final calibration Note On and matching Note Off are consumed even when raw callback disables calibration`.
- Scenario `M3L-12` in `scripts/smokeM3l.mjs` verifies calibration isolation in the end-to-end browser pipeline.

## 4. Lifecycle Cleanup

- Added `cancelTwoHandRun()` inside `onMount` return cleanup in `src/App.svelte` alongside `cancelChordRhythmRun`.
- Added `cancelTwoHandRun()` to `document.hidden` visibility handler.
- Added `cancelTwoHandRun()` when navigating away from the practice page (`activePage !== 'practice'`).

## 5. Verification Results

- **TypeScript check (`npm run typecheck`):** 0 errors.
- **Svelte check (`npm run check:svelte`):** 0 errors, 0 warnings.
- **Unit test suite (`npm test`):** **657/657 tests passed** across all 42 test files.
- **Production build (`npm run build`):** Clean build.
- **End-to-End M3L Smoke (`npm run smoke:m3l`):** **16/16 scenarios passed**:
  - `M3L-P0-A` wrong right-hand triad via MIDI then correct chord advances exactly once
  - `M3L-P0-B` on-screen wrong triad then correct chord and fresh correct first attempt
  - `M3L-01` four bars play continuously after one count-in
  - `M3L-02` independent phrase hides note hints and stays continuous
  - `M3L-03` complete 12 assessment trials through real MIDI pipeline
  - `M3L-04` wrong LH bass is classified as wrong bass, not missing left hand
  - `M3L-05` delayed extra note cannot receive false success
  - `M3L-06` MIDI disconnect cancels attempt without grading
  - `M3L-07` failed assessment returns to learning with history preserved
  - `M3L-08` remediation gate blocks Next after wrong item and maps failed trial positions
  - `M3L-09` shared metronome count-in 4-3-2-1, play cue and restart integrity
  - `M3L-10` device profile, calibration trace, compact range and input selection
  - `M3L-11` port isolation: only selected device feeds M3L
  - `M3L-11B` selected-port disconnect while second port connected stops run immediately without grade or fallback
  - `M3L-12` verified range required; C1–C3 support; stale reconfirmation and calibration isolation
  - `M3L-13` integrity: no duplicate events, exceptions or console errors
- **Full Regression Smoke Suite:**
  - `npm run smoke:daily-practice`: PASS (70 tasks, 17 skills)
  - `npm run smoke:scheduler-integrity`: PASS (0 warnings, 0 console errors)
  - `npm run smoke:persistence-integrity`: PASS (clean)
  - `npm run smoke:cold-test`: PASS (clean)
  - `npm run smoke:m3k`: PASS (clean)

## 6. Deliverables & Acceptance Artifacts

- **Archive:** `piano-key-trainer-m3l-two-hand-accompaniment-rev4.zip`
- **Machine-readable evidence:**
  - `acceptance/m3l-rev4/evidence.json`
  - `acceptance/m3l-rev4/smoke-summary.json`
- **Screenshots:**
  - `acceptance/m3l-rev4/screenshots/01-m3l-rev4-device-range.png`
  - `acceptance/m3l-rev4/screenshots/02-m3l-rev4-compact-four-bars.png`
  - `acceptance/m3l-rev4/screenshots/03-m3l-rev4-assessment-midi.png`
  - `acceptance/m3l-rev4/screenshots/04-m3l-rev4-remediation-gate.png`

## 7. Global Training Layout Contract & Test-Hook Isolation

1. **Session Strip Long-Title Wrapping**:
   - Removed forced `white-space: nowrap`, `overflow: hidden`, and `text-overflow: ellipsis` on `.session-strip .session-meta b`.
   - Desktop session title styles set to `white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: normal !important; overflow-wrap: break-word !important;`.
   - Desktop workspace layout row 1 is flexible: `grid-template-rows: auto minmax(0, 1fr) var(--keyboard-dock-height, 220px) !important;`.
   - Long session titles remain fully readable without scrolling or truncation at 1024, 1280, 1440, and 1792 px.
2. **Build-Time Gating & Total Production Test-Hook Isolation**:
   - `window.__m3lDebug` and its activator `window.__enableM3lDebug` are gated at compile time via `__ENABLE_TEST_HOOKS__`.
   - In normal production builds (`npm run build`), `__ENABLE_TEST_HOOKS__` is set to `false` via Vite `define`. Dead-code elimination (DCE) completely purges all references to `__m3lDebug` and `__enableM3lDebug` from the production bundle (0 occurrences verified by static bundle scan).
   - User-controlled URL parameters (`?testHooks`, `?test`) and console flags cannot bypass this restriction or activate debug mutation in production builds.
   - For automated layout tests requiring state switching, an explicitly configured test build (`npm run build:test` / `vite build --mode test`) outputs to `dist-test/` with `__ENABLE_TEST_HOOKS__: true`.
   - `scripts/smokeTrainingLayoutContract.mjs` executes a two-phase check: Phase 1 verifies static bundle hygiene and runtime browser isolation with `?testHooks=1&test=1` in headless Chrome, while Phase 2 runs all 70 layout contract checks against the isolated test build.
   - Unit tests in `tests/unit/testHookIsolation.test.ts` verify the compile-time gating contract.

## 8. Deliverables & Acceptance Artifacts (Lean ZIP Packaging)

Complies with the permanent project rule for **Lean ZIP Packaging**:

### 8.1. Main Source Archive: `piano-key-trainer-m3l-two-hand-accompaniment-rev4.zip`
- **Archive Size:** 2,549,233 bytes (**2.43 MB**)
- **Total Files:** 232 files (source, tests, scripts, documentation, reports, machine-readable JSON)
- **Machine-Readable Evidence:**
  - `acceptance/m3l-rev4/smoke-summary.json`
  - `acceptance/layout-contract/layout-contract-summary.json`
- **Representative Screenshots:** 4 essential screenshots (1,437,919 bytes / **1.37 MB** uncompressed):
  - `acceptance/m3l-rev4/screenshots/01-m3l-rev4-device-range.png` (Device profile, verified range, C1–C3 support)
  - `acceptance/m3l-rev4/screenshots/05-m3l-hands-free-initial.png` (Hands-free MIDI start release cue & 4-beat countdown)
  - `acceptance/layout-contract/screenshots/m3l-1792x864-failing-baseline.png` (M3L layout on user-reported failing viewport 1792×864, zero scroll)
  - `acceptance/layout-contract/screenshots/m3l-1024x768-compact-desktop.png` (M3L layout on compact desktop minimum 1024×768)

### 8.2. Companion Visual Evidence Archive: `acceptance-screenshots.zip`
- **Archive Size:** 13,537,783 bytes (**12.91 MB**)
- **Screenshot Count:** 44 screenshots
- **Uncompressed Screenshot Size:** 13,726,092 bytes (**13.09 MB**)
- **Coverage:** Complete visual captures across M3L Rev4 (9 screenshots) and Global Training Layout Contract across all 6 viewports and training stages (35 screenshots).
- **Historical Cleanliness:** Excludes historical screenshots from prior revisions.

### 8.3. Packaging Commands
```bash
npm run package:m3l-rev4
npm run package:acceptance-screenshots
```

