# M3L Rev1 — Two-Hand Accompaniment: Assessment & MIDI Integrity Report

## 1. Baseline and scope

- Baseline: `0acb9b6` (M3L initial submission) on `stabilization/m3k-audit-remediation`; review verdict: HOLD with four acceptance blockers plus MIDI/tests gaps.
- This revision fixes the blockers and the two physical-test P0s (right-hand corrective deadlock, missing count-in/metronome), preserving all previously accepted features (Checkpoint C, FSRS persistence, Cold Test, M3K).
- Out of scope unchanged: new pedagogy beyond M3L, FSRS retuning, AudioEngine/MIDI redesign, `App.svelte` decomposition.

## 2. P0 — right-hand guided correction deadlock

- Root cause: `reduceTwoHandState` `selectKey` rejected input while `awaitingCorrective` was true, so a wrong guided chord left the learner unable to correct.
- Fix: selection is blocked only during an active timed run; corrective selection is allowed after a wrong guided attempt. `guidedResult` still advances exactly once per accepted correction and protected invariants (one index increment, no double grading) are unchanged.
- End-to-end regression (smoke M3L-P0-A/P0-B): wrong C-major triad played and released, then correct C4–E4–G4 captured, corrected, feedback flips to good, progression advances exactly once; repeated on the on-screen piano; a fresh correct first attempt also advances exactly once; guided corrections create no review-log entries (one-grade policy unchanged). Persisted `rightIndex` verified at 1 → 2 → 4.

## 3. P0 — shared metronome and count-in

- M3L now uses the existing `MetronomeClock` (`rhythmClock`) — no second metronome. The run scheduler schedules one bounded sequence per run; `clock.stop()` cancels pending timers/clicks on cancel, navigation, grade, completion and MIDI disconnect.
- At 60 BPM the count-in displays and audibly clicks `4 → 3 → 2 → 1`, one full beat each, followed by a distinct accented first playable beat and a visible `ИГРАЙТЕ!` cue. The beat indicator follows the shared clock and clears (no beat highlighted) when the run ends.
- Count-in input is ignored: notes before the playable window (accept window opens 300 ms before the first playable beat) never complete or grade the exercise and never contribute to timing. `twoHandPlayableAt` gates capture.
- Deterministic evidence: unit clock trace asserts click offsets/accent pattern (`[accent,·,·,·,accent,·,·,·]` at 1000 ms spacing) and count-in values `[4,3,2,1]`; production smoke records a real clock trace `[{count-in 4,3,2,1}, {playable beat 1, accented}]`, verifies zero evaluations during the count-in, a successful beat-1 performance, a late attempt rejected as `timing_failed`, and no duplicate evaluations/clicks after restart.

## 4. Reviewer blockers

1. **Failed assessment recovery** — `retryAssessment` on `phase=failed` returns to the simultaneous learning stage with reset progress, keeps the failed assessment history in the snapshot and cannot mark the module complete (`completeModule` still requires `passed`); when independent play is passed again, a fresh retry block (`blockKind=retry`, preserved `remediationUsed`) starts. Smoke M3L-07 verifies history preservation and absence of a completion record.
2. **Remediation integrity** — new state flag `remediationCorrected`: Next is rendered/enabled only after the current item's correct attempt; `advance` is blocked while `awaitingCorrective` or uncorrected; remediation positions map to the real failed trial indexes (`remediationTrialIndexes[remediationIndex]`, first item set on block failure). Smoke M3L-08 verifies Next hidden after wrong, visible after corrected, and index mapping (C → G/B → Am for failed trials 0/1/2).
3. **Continuous four-bar progression** — one count-in then four contiguous bars at 60 BPM with automatic `C → G/B → Am → F` changes; the active chord/beat follow the shared clock; no Start click between bars. Independent uses the same continuous structure. Unit test simulates the four-bar phrase; smoke plays a full phrase through MIDI and reaches independent.
4. **Independent-mode hints** — `App` passes `showHints={twoHandHintsVisible(state)}`; independent and assessment instructions/panels omit exact key lists while retaining chord symbols, hand roles and beat information; keyboard target highlights are hidden in those stages.
5. **MIDI capture correctness** — `classifyTwoHandCapture` keeps wrong bass notes (wrong note or wrong octave) as the bass candidate, keeps extra notes in the chord, and dedupes per note/per bar; a successful chord is finalized only after the accept+assembly window (+530 ms) so a delayed extra note cannot receive false success; held-note/duplicate protection preserved.
6. **MIDI disconnect** — `MidiController` now counts only `state === 'connected'` inputs; App reacts to a disconnect during a run with `inputInterrupted` (warn feedback, no grade, no review log) and cancels the clock.
7. **Acceptance tests** — 12 new unit tests (classification, remediation gating/mapping, failed recovery, continuous bars, play cue, metronome trace); production smoke rewritten to drive genuine synthetic MIDI Note On/Off through `MidiController`, including a full 12-trial assessment without a seeded pass snapshot.

## 5. Evidence map (required list)

| Required evidence | Where verified |
| --- | --- |
| failed assessment → return to learning works | smoke M3L-07 |
| wrong remediation → Next unavailable | smoke M3L-08 |
| correct remediation → Next available | smoke M3L-08 |
| four bars → one count-in, continuous beat timeline | smoke M3L-01/M3L-02, unit phrase test |
| independent mode → no explicit note hints | smoke M3L-02 |
| wrong LH bass → correct classification | smoke M3L-04, unit classification |
| delayed extra note → cannot receive false success | smoke M3L-05, unit classification |
| MIDI disconnect → safely cancelled/paused | smoke M3L-06 |
| 12 assessment trials → completed through real input pipeline | smoke M3L-03 |
| P0 right-hand correction (MIDI + screen + one-grade) | smoke M3L-P0-A/P0-B |
| count-in 4→3→2→1 + accented play cue + no early grading | smoke M3L-09, unit clock trace |

## 6. Verification

- `npm run verify`: typecheck clean, svelte-check 0/0, **632/632 tests**, production build clean.
- `smoke:m3l`: 12/12 scenarios; `smoke:m3k`, `smoke:cold-test`, `smoke:persistence-integrity`, `smoke:daily-practice`: green.
- Screenshots: `acceptance/m3l-rev1/screenshots/01-m3l-rev1-four-bar-continuous.png`, `02-m3l-rev1-independent-no-hints.png`, `03-m3l-rev1-assessment-midi.png`, `04-m3l-rev1-remediation-gate.png`.
- Evidence: `acceptance/m3l-rev1/evidence.json`, `acceptance/m3l-rev1/smoke-summary.json`.

## 7. Limits and manual re-test plan

- The metronome click is scheduled through `AudioEngine.playMetronomeClick`; audible verification on physical hardware remains with the user (the shared clock and click-scheduling logic are covered by tests and the trace).
- **Physical MIDI re-test required** (blockers were found on hardware): (1) Program → «Игра двумя руками», confirm MIDI status; (2) guided right hand: play a wrong triad, release, then the correct chord — correction must be accepted and advance once; (3) «Две руки вместе»: verify audible 4-3-2-1 count-in, accented first beat and `ИГРАЙТЕ!` cue; (4) four-bar stage: one count-in, four continuous bars; (5) independent/assessment without note hints; (6) disconnect the device mid-run — no grade; (7) reload mid-module and complete an assessment.

## 8. Clean extraction

Archive `piano-key-trainer-m3l-two-hand-accompaniment-rev1.zip` is built deterministically (double-build byte equality), contains only `acceptance/m3l-rev1`, no `node_modules`/`dist`/`.git`/profiles, and every `package.json` script reference resolves.
