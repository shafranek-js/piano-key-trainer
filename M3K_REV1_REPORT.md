# Piano Key Trainer — M3K Final Rev1

**Beginner Timing Tolerance + Hands-Free MIDI Start**

Status: **completed, pending independent review and physical-MIDI user test.**
Continues only from the `piano-key-trainer-milestone3k-final` candidate; all previously accepted M3K
decisions (chord recognition, C → G/B, persistence, assessment lifecycle, backup safety, scheduler)
are preserved.

**Physical MIDI tested: NO. Fake Web MIDI tested: YES.**

---

## Baseline

- Baseline candidate: `piano-key-trainer-milestone3k-final` (Rev0), 495 tests / 28 files, gates and all
  four smokes green.
- Rev1 changes are limited to: (1) hands-free MIDI count-in start, (2) beginner timing acceptance
  (±140 ms precise / ±300 ms accepted), (3) diagnostics + UI copy + smoke coverage for both.
- No new rhythm patterns, BPM levels, meters, adaptive difficulty, arpeggios, two-hand work, or FSRS
  retuning.

## MIDI Start Gesture

- In the timed M3K waiting state (`prepare`), **any** MIDI note-on is a transport gesture. No special
  note is used; C, F#4, A2, D5 and chords all behave identically.
- The gesture is never musical: 0 chord evaluations, 0 assessment attempts, 0 ReviewLogs,
  0 FSRS mutations, 0 correctness feedback. The UI switches to «Отпустите клавиши, чтобы начать
  отсчёт…».
- The countdown starts **only after all gesture keys are released** (held-note set reaches zero), so
  the start gesture can never leak into the first musical answer (stale-input regression covered by
  the smoke).
- After the countdown starts, MIDI returns to normal musical meaning; notes during count-in/armed/
  timing window/late never restart the countdown.
- Mouse/button flow is preserved as a secondary path («Начать отсчёт»); screen piano keeps its button.
  MIDI copy: «Нажмите любую клавишу на MIDI, чтобы начать отсчёт» + «или нажмите „Начать отсчёт"».

## Start/Release State Machine

```text
WAITING_FOR_START
  ↓ any MIDI note-on (single note or chord)
START_GESTURE_RECEIVED          — transport only, UI: «Отпустите клавиши…»
  ↓ all gesture keys released (heldNotes.size === 0)
COUNT_IN (4 → 3 → 2 → 1)        — exactly one countdown per press-release action
  ↓
ARMED (grading armed; visible window opens at onset − 300 ms)
  ↓
normal MIDI musical input
```

- Single trigger guard: one pending-gesture flag per waiting state; multiple note-ons, note-offs,
  velocity-0 note-ons, several devices/callbacks and held-note updates cannot create a second
  countdown. The smoke runs the gesture→release→countdown→successful-answer cycle **10 times**
  and asserts exactly one evaluation per gesture.

## Beginner Timing Policy

Two distinct concepts, both explicit in the model:

```text
timingBand: 'on_time' | 'early' | 'late' | 'too_early' | 'missed'
timingAccepted: boolean
```

| delta | band | result |
|---|---|---|
| < −300 ms | `too_early` | FAIL |
| −300 … −141 ms | `early` | ACCEPTED |
| −140 … +140 ms | `on_time` | ACCEPTED (precision target) |
| +141 … +300 ms | `late` | ACCEPTED |
| > +300 ms | `missed` | FAIL |

- ±140 ms stays the precision target and its label is «Точно».
- Accepted early/late are labelled «Немного рано — засчитано» / «Немного поздно — засчитано»;
  failures are «Слишком рано» / «Слишком поздно».
- Milliseconds never appear in normal UI; they remain diagnostics-only.
- The late diagnostic window is preserved: after +300 ms a chord is still diagnosed (correct chord +
  `missed` timing) but the attempt remains failed.
- Fixed policy only — no adaptive difficulty, tolerance shrinking, sliders or tempo scaling.

## Assessment Semantics

- Success = `chordCorrect === true AND timingAccepted === true`. Accepted early/late therefore count
  as successful first attempts and enter the assessment percentage as successes.
- No hidden failure is created in ReviewLog/FSRS when the UI says «засчитано»: the reducer and the
  Daily Practice commit both use `outcome.correct = chordCorrect && timingAccepted`.
- Chord and timing remain independent: a timing failure never flips chord correctness, and a chord
  failure never turns the timing result into `missed`.

## C → G/B Regression

- The two-bar exercise `| C | G/B |` is unchanged: bar 1 C, bar 2 G/B on the next downbeat, one
  `questionInstanceId`, one run, one resolution.
- Both bars use the same beginner timing policy; per-bar feedback now includes precision labels:
  `Такт 1 · C: ✓ · Точно · Такт 2 · G/B: ✓ · Немного поздно · Смена: ✓ засчитана`.
- A wrong-bass G bar keeps `Смена: ✓ засчитана` when its timing is accepted while the chord mark is
  `✗ неверный бас`; a change outside ±300 ms yields `Смена: ✗ Слишком поздно/рано`.
- The smoke drives the complete C → G/B without any mouse click (gesture start + fake MIDI bars).

## Daily Practice

- `chordPulse`, `chordChangeTiming`, `chordRhythmPattern` use the same `classifyRhythmTiming`
  classifier and the identical two concepts, so `M3K lesson +220 ms = accepted` and
  `Daily Practice +220 ms = accepted`.
- No duplicate grading: one question instance resolves once, at most one ReviewLog and one FSRS
  mutation; corrective replay adds zero grades.

## Diagnostics

Bounded recent-attempt trace (`window.__m3kRecentAttempts`, last 5) extended with:

```text
startMethod: button | midi_gesture
startGestureFirstNote, startGestureStartedAt, startGestureReleasedAt
expectedOnset, actualOnset, timingDeltaMs, timingBand, timingAccepted
targetChord, detectedChordLabel, chordCorrect
countInStartedAt, countInFinishedAt, visualTargetShownAt, timingWindowStart, timingWindowEnd
```

`window.__m3kAttemptCount` provides a monotonic counter for smoke assertions; no unlimited raw MIDI
event stream is stored.

## Unit Tests

- **498 tests / 28 files passing** (+3 from Rev0's 495), 23 M3K semantic tests in
  `tests/unit/rhythmChordSemantics.test.ts`.
- New deterministic boundary coverage (no real sleeps) for every required edge:
  −301 fail, −300 accepted early, −141 accepted early, −140 accepted on_time, 0 ms accepted on_time,
  +140 accepted on_time, +141 accepted late, +300 accepted late, +301 fail.
- New chord × timing matrix: correct+exact, correct−250 (accepted early), correct+250 (accepted late),
  correct−350 (timing fail, chordCorrect true), correct+350 (timing fail, chordCorrect true),
  wrong+exact (chord fail, timing accepted), wrong+250 (chord fail, timing accepted).
- Two-bar exercise with accepted early bar 1 and accepted late bar 2 resolves as success with
  «Смена: ✓ засчитана».

## Production Smoke

`npm run smoke:m3k` (production preview, isolated Chrome profile, fake Web MIDI):

- MIDI gesture start with a single key; countdown waits for release; gesture creates 0 evaluations.
- Start with arbitrary notes F#4, A2, D5 (no special treatment for C).
- Start with the chord C4+E4+G4: registered only as transport; countdown starts once after full release.
- Exactly one countdown per gesture; a note during count-in does not restart it.
- Ten gesture→release→countdown→successful-answer cycles in `oneChordPerBar` (race/double-start guard).
- Complete C → G/B change with no mouse click, `startMethod = midi_gesture`.
- Timing acceptance via `__m3kPlayAt`: 0 ms → «Точно», −250 ms → «Немного рано — засчитано»,
  +250 ms → «Немного поздно — засчитана», +350 ms → «Слишком поздно» (failed).
- Preserved: pending corrective reload with 0 FSRS logs, module exclusivity, bounded remediation,
  terminal failed-retry exits, completion/exit into normal practice, 0 runtime exceptions,
  0 console errors.
- Screenshots: `01-midi-start-ready.png`, `02-accepted-early.png`, `03-accepted-late.png`.

## Physical MIDI Status

```text
Physical MIDI tested: NO
Fake Web MIDI tested: YES
```

The fake covers the production event path: note-on velocity > 0, note-off and velocity-0 note-off,
per-device held-note set, 3-note chord evaluation, full release/re-arm, and the new start gesture.
A real controller and real timing jitter remain for the user's physical acceptance. **M3K is not
marked finally accepted by this checkpoint.**

## Verification

```
npm run typecheck                     # 0 errors
npm run check:svelte                  # 0 errors, 0 warnings
npm test                              # 498/498 across 28 files
npm run build                         # PASS (PWA generated)
npm run verify                        # PASS
npm run smoke:scheduler-integrity     # PASS
npm run smoke:m3i                     # PASS
npm run smoke:m3j                     # PASS
npm run smoke:m3k                     # PASS (3 screenshots, 0 runtime/console errors)
npm run package:m3k-rev1              # deterministic ZIP + infrastructure self-check
```

## Clean Extraction

From a completely fresh directory containing only the ZIP contents:

```bash
npm ci
npm run verify
npm run smoke:scheduler-integrity
npm run smoke:m3j
npm run smoke:m3k
```

Result: **PASS** on 2026-10-05 from
`C:\Users\pavel\AppData\Local\Temp\opencode\m3k-rev1` (see `acceptance/m3k-rev1/README.md`).
The archive continues to include `.github/workflows/verify.yml`, `.gitignore`, `package.json`,
`package-lock.json`, and non-empty `src/`, `tests/`, `scripts/` trees (enforced by an explicit
builder self-check).

## Known Limitations

- Physical MIDI remains untested by the developer (fake Web MIDI only); final timing feel with a real
  controller is pending user acceptance.
- The acceptance window is a fixed beginner policy (±140/±300 ms) with no adaptive difficulty.
- The ±300 ms change-edge is enforced per chord event; the late diagnostic window (900 ms) diagnoses
  but never grades.
- Screen-piano timing uses the same classifier and window; the Rev1 smoke drives the MIDI path (screen
  flow is covered by shared reducer/classifier unit tests and explicit UI copy).
