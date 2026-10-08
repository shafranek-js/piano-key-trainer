# Milestone 3L — Two-Hand Accompaniment I — Implementation Report

## 1. Baseline and scope

- Baseline: `piano-key-trainer-daily-diagnostics-hardening-rev1` (Checkpoint C Rev1), branch `stabilization/m3k-audit-remediation`, HEAD `a8a549f`.
- Pre-work gate: 604/604 unit tests across 40 files, `tsc --noEmit` clean, `svelte-check` 0/0, production build clean, all seven pre-existing smokes green.
- Scope: left-hand bass + right-hand chord accompaniment in C major, 4/4, 60 BPM, progression C → G/B → Am → F (G/B bass = B2), guided stages through a bounded independent assessment; Daily Practice integration; Cold Test non-regression.
- Out of scope (unchanged): eighth notes, Alberti/syncopation, other time signatures, other keys, fingering, score following, MusicXML, AudioEngine/MIDI redesign, `App.svelte` refactor, FSRS retuning.

## 2. Note and register map

| Chord | LH bass | RH triad |
| --- | --- | --- |
| C | C3 | C4–E4–G4 |
| G/B | B2 | B3–D4–G4 |
| Am | A2 | A3–C4–E4 |
| F | F2 | F3–A3–C4 |

LH bass is the canonical Harmony `bassKeyId` transposed exactly one octave down (`twoHandVoicing`); RH triads are the accepted Harmony voicings verbatim. No other registers or voicings are accepted.

## 3. Stage model (`src/core/learning/twoHand.ts`)

`handOrientation → leftHand → rightHand → simultaneous → alternating → fourBar → independent → transferAssessment → transferResult / transferRemediation → moduleComplete`.

- leftHand/rightHand are guided (prompted) per chord; wrong answers set `awaitingCorrective` without progressing.
- simultaneous: bass + triad on beat 1; alternating: bass on beat 1, triad on beat 3 (targets `[0, 2]`).
- fourBar: four consecutive bars of changing chords; independent: same without detailed prompts (hand labels remain; `twoHandHintsVisible` hides note hints).
- Timing: M3K windows preserved (±140 ms on time / ±300 ms accepted, `twoHandTimingBand`); LH↔RH simultaneous sync window ±200 ms; RH assembly spread tolerance 200 ms.
- One `questionInstanceId` per trial; one FSRS grade per first attempt; corrective replay never creates a second grade.

## 4. MIDI and scoring policy

- Input: piano keys / MIDI note numbers resolved to exact key ids; canonical timestamp = MIDI note-on `ev.timestamp` in the browser (screen clicks use `performance.now()` at click).
- Held notes are not new attacks: MIDI note-on is deduplicated through `twoHandHeldKeyIds`, released on note-off; duplicate key-ons cannot double-count.
- Note-off clears held state; MIDI disconnect simply stops input (attempt can be cancelled/flushed without grading).
- Outcome taxonomy: `correct`, `wrong_bass`, `wrong_bass_octave`, `wrong_chord`, `incomplete_chord`, `extra_note`, `missing_left`, `missing_right`, `both_correct_poor_sync`, `timing_failed`, each with Russian feedback.
- Grading happens once per run; `gradeAttempt` is idempotent per attempt (flush guarded by `twoHandPending.graded`).

## 5. Assessment and remediation

- 12-trial deterministic plan covering both patterns and all four chords (`ASSESSMENT_PLAN`, `twoHandAssessmentTrial`).
- Pass threshold: ≥80% first-attempt accuracy (12 trials). First-attempt integrity is preserved after corrective replays (`trialHadWrong` is not reset by `startRun`).
- Failure opens bounded remediation: up to 3 focused items taken from the failed trial indexes; completing them starts a fresh 12-trial retry block (`blockKind: retry`).
- Terminal bound: a third failed retry block with `remediationUsed >= 3` reaches `phase: failed` and `transferResult` (module is not completed).
- Reload-safe: the entire assessment/remediation state is persisted in `twoHandSnapshot`.

## 6. FSRS, Daily Practice and persistence

- Skills registered: `twoHandBass`, `twoHandTogether`, `twoHandAlternating` (canonical registry now 22; group `twohand`); item ids `bass-sequence`, `together-sequence`, `alternating-sequence` with display/short names.
- Cold Test remains the curated 19-family list (`COLD_TEST_SKILLS` decoupled from the registry); M3L skills never enter the Cold Test queue.
- Daily Practice cards: gated by `twoHandCardGateSatisfied` (module retention or per-skill retention record); eligible only after module gates; one-grade contract reused from the canonical daily runner.
- Persistence: `advanced-two-hand:session` with `twoHandSnapshot` (normalized on load via `normalizeTwoHandSnapshot`), `advanced-two-hand:complete` retention record on module completion; backup/restore round-trips both; curriculum roadmap stage 12 `two_hand` becomes available after Chord Rhythm and completion propagates into Diagnostics (schema v3 snapshot + module row).

## 7. Unit tests

`tests/unit/twoHandAccompaniment.test.ts` — 16 tests: voicing table (including G/B bass B2), evaluator outcomes (sync window boundary, wrong octave, extra/incomplete/wrong chord, missing hands, late timing), M3K timing bands, full stage machine, assessment plan coverage, pass/fail/remediation/terminal bound, snapshot round-trip and status/status gates, registry + Cold Test decoupling, 12th roadmap stage. Suite total: **620/620 across 40 files**.

## 8. Production smoke

`npm run smoke:m3l` — 8 scenarios in an isolated Chrome profile with a deterministic synthetic profile:

1. Module unlock from the roadmap, orientation stage, MIDI notice.
2. Guided left hand across all four voicings (asserts G/B bass B2), guided right hand.
3. Simultaneous run, one persisted `twoHandSnapshot` attempt.
4. Reload resumes the alternating stage from the persisted snapshot.
5. Bass on beat 1 / chord on beat 3 inside the accepted windows.
6. Assessment failure → bounded remediation → retry block, no duplicate review event identities.
7. Passed assessment → module completion retention record → completed roadmap stage.
8. Zero runtime exceptions, zero duplicate review events, no console errors.

Screenshots (4, exact names): `acceptance/m3l/screenshots/01-m3l-hand-orientation.png`, `02-m3l-simultaneous-play.png`, `03-m3l-bass-beat1-chord-beat3.png`, `04-m3l-assessment.png`. Evidence: `acceptance/m3l/evidence.json` and `acceptance/m3l/smoke-summary.json`.

## 9. Regression status

`npm run verify` clean (620/620 tests, svelte-check 0/0, build OK) and `smoke:m3k`, `smoke:cold-test`, `smoke:persistence-integrity`, `smoke:daily-practice` (now asserts the 12-stage roadmap with 11 completed and `two_hand` available) all green after the change.

## 10. Simulation limits and manual MIDI plan

- **Physical MIDI: NOT TESTED.** All automated evidence uses screenshots/simulated input.
- Manual plan for user acceptance: (1) connect a MIDI piano, open Program → “Игра двумя руками”, confirm MIDI status; (2) guided LH/RH on all four chords; (3) simultaneous run — play both hands together; (4) alternating run — bass on 1, chord on 3; (5) intentionally delay the RH to confirm the sync feedback; (6) play through the 12-trial assessment and confirm remediation/retry bounds; (7) reload mid-module and confirm resumption; (8) confirm Daily Practice shows the three M3L task families only after completion.

## 11. Known limitations

- Sync/timing windows are fixed beginner values; no per-user adaptation.
- The assessment demo path in the smoke uses seeded snapshots for the late-trial states to keep runtime bounded; the unit tests cover the full 12/12 and 3×fail flows.
- No eighth-note, tempo or key variety (deliberate scope freeze).

## 12. Clean extraction

The archive is built twice and must be byte-identical (deterministic ZIP), contains no `node_modules`/`dist`/`.git`/profiles, includes only `acceptance/m3l`, and every `package.json` script reference is present. Extraction audit: `piano-key-trainer-m3l-two-hand-accompaniment.zip`.
