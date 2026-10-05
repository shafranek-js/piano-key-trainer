# Milestone 3K Finalization — Physical MIDI, Chord Semantics & Interaction Clarity

Status: **completed, pending independent acceptance and physical-MIDI user test**. M3K remains WIP until accepted.
Date: 2026-10-05. Continues from the accepted Audit Remediation & M3K Stabilization — Checkpoint A.

**physical MIDI tested: no** — verified through **fake Web MIDI** (synthetic `MIDIMessageEvent`s on the
production input path). A physical device test is pending user acceptance.

---

## Baseline

- Accepted prerequisite: Audit Remediation & M3K Stabilization — Checkpoint A (branch
  `stabilization/m3k-audit-remediation`; report `AUDIT_STABILIZATION_A_REPORT.md`).
- Entry state: 475 tests / 27 files, `svelte-check` 0/0, `tsc` clean, production build clean,
  `smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j`, `smoke:m3k` green.
- M3K already had pedagogical stages, 12/8 bounded assessment, remediation, retry, persistence
  and Daily Practice integration; this checkpoint adds no new pedagogy.

## Physical-MIDI bug reproduction

Reported user scenario: stage «Смена на следующую „раз"», visible target **C**, learner plays
C major on physical MIDI exactly on beat 1 → UI «Аккорд: неверный / Время: Точно».

Reproduced in this checkpoint:

1. **Classifier reproduction (unit/static):** `App.svelte` called `classifyHarmonyChord([...keyIds], chordId)`
   from M3J. That classifier is deliberately exact-voicing: for target `C` only `C4–E4–G4` is
   `correct`; `C3–E3–G3` returns `wrong_inversion`, and a same-pitch-class different register
   returns `wrong_octave`.
2. **UI/grader target mismatch (production smoke trace):** the very first finalization smoke run
   failed with this recorded attempt trace on stage `changeOnBeatOne`:
   `"targetChord":"G/B" ... "rawMidiNotes":[48,52,55] ... "classificationOutcome":"wrong_chord"`,
   while the stage copy displayed `C` (the component resolved `C`, `App.svelte` resolved `G/B`).
   So the visible target and the graded target could diverge independently of register.

## Root cause

Two defects combined:

1. **Wrong semantic contract for M3K:** the rhythm module reused M3J's exact-voicing classifier,
   which enforces root position and hidden canonical register. For a plain symbol such as `C` the
   UI shows only chord identity, so other octaves and inversions must be accepted.
2. **No single source of truth for the target chord:** `App.svelte` and `ChordRhythmStage.svelte`
   each resolved the target independently; `changeOnBeatOne` diverged (`G/B` vs `C`).

M3J semantics were not weakened: `classifyHarmonyChord()` is untouched.

## M3K chord semantic contract

New M3K-specific evaluator `classifyRhythmChord(targetChordId, notes)` in
`src/core/learning/chordRhythm.ts`:

- **Plain chord symbol = chord identity.** `C`, `Am`, `F` accept the correct triad pitch classes in
  any octave and any inversion (`C3–E3–G3`, `C4–E4–G4`, `C5–E5–G5`, `E3–G3–C4`, `G3–C4–E4` → `correct`).
- **Slash chords stay bass-sensitive (octave-independent).** `G/B` requires pitch classes G–B–D **and**
  the lowest sounding note B (`B2–D3–G3`, `B3–D4–G4` → correct; `G3–B3–D4`, `D3–G3–B3` → `wrong_bass`).
- **No hidden register:** exact octave/register is never a musical failure unless the UI explicitly
  shows it (the M3K UI never does).
- **Structured diagnostics:** `outcome` (`correct`, `wrong_quality`, `wrong_bass`, `wrong_chord`,
  `incomplete_chord`, `extra_notes`), `chordCorrect`, `playedPitchClasses`, `playedBass`,
  `detectedQuality`, `detectedChordLabel`, `targetChordLabel`, `targetPitchClasses`,
  `targetBassRequirement`, `rejectionReason`.
- **One target resolver:** `resolveRhythmTargetChord(state)` is now the single source of truth used by
  both the stage component and the evaluator; it is bar-aware for the change exercise.

## P0 fix — `changeOnBeatOne` teaches a real C → G/B change

Stage 4 is no longer equivalent to `oneChordPerBar`; it is a deterministic **two-bar exercise over one
question**:

```text
| C       | G/B     |
| 1 2 3 4 | 1 2 3 4 |
```

- **State model:** `barIndex` (0 = C bar, 1 = G/B change bar) and bounded `barEvents` (per-bar chord,
  chord correctness, timing band, classification outcome, detected label). Both are persisted in
  `chordRhythmSnapshot` and validated by `normalizeChordRhythmSnapshot`, so a reload after bar 1
  resumes directly on the change bar (`isResumableChangeBar2`).
- **One run, one question:** bar 1 and bar 2 are scheduled inside a single 8-beat run
  (targets at beats 1 of bar 1 and bar 2); both bars share one `questionInstanceId`. The exercise
  resolves once: first chord wrong, second chord wrong, or a missed change downbeat fails the first
  attempt; corrective replay does not create another grade.
- **UI:** «Сейчас: C · Далее: G/B» before the change, bar counter «Такт 1 из 2» / «Такт 2 из 2» and
  the bar-2 cue «СМЕНА → G/B» exactly at the change downbeat; the visible target and the grading
  window are the same event.
- **Feedback per bar:** `Такт 1 · C: ✓ · Такт 2 · G/B: ✓ · Смена: Точно`; a root-position G on the
  change bar yields `Такт 2 · G/B: ✗ неверный бас · Смена: Точно`; a late correct change yields
  `Такт 2 · G/B: ✓ · Смена: Пропущена доля`.
- **Daily Practice:** the scheduled `chordChangeTiming` card uses the same two-bar reducer and the
  same single-commit gate (one `ReviewLogEvent`/FSRS mutation maximum; corrective replay 0).

## MIDI normalization

- Physical MIDI flows through the accepted `MidiController` + `MidiChordTracker` lifecycle:
  note-on with velocity > 0, note-off and velocity-0 note-on handling, per-device held-note set,
  exactly 3 unique held notes → evaluate once → locked → full release → re-arm.
- For M3K the raw MIDI note numbers are carried into classification and diagnostics:
  `rhythmMidiByKeyId` captures each note-on's real `midi` value, and the tracker callback maps the
  evaluated keys back to their raw MIDI numbers (`rawMidiNotes` in the trace). Screen-piano and MIDI
  use the same `classifyRhythmChord()` evaluator, so equal musical chords cannot be accepted by one
  channel and rejected by the other.
- Incomplete input (fewer than three notes) never creates a graded attempt; 4+ notes are `extra_notes`.

## Timing/input state machine

Explicit phases exposed as `data-rhythm-phase`
(`prepare → countIn → armed → late → evaluated / retry`, `rhythmRunPhase()`):

- **prepare:** primary action «Начать отсчёт». Pressing «Сыграть аккорд» here (or during count-in)
  shows «Сначала запустите отсчёт.» / «Приготовьтесь: отсчёт …» and **never** grades.
- **countIn:** visible `4 → 3 → 2 → 1`; input during count-in is ignored.
- **armed:** the single canonical target timestamp opens the grading window; the visible
  «ИГРАЙТЕ СЕЙЧАС» cue (`data-timing-window="open"`) is driven by the same `expectedOnset` used for
  classification, so visible active target = grading window.
- **late:** a soft miss at `+420 ms` keeps a bounded late-diagnostic window (`CHORD_RHYTHM_LATE_WINDOW_MS = 900 ms`).
  A late chord is diagnosed once (timing `missed`, real chord correctness preserved); if nothing is
  played, the cutoff records the missed attempt exactly once.
- **evaluated/retry:** results and corrective requirements, with no duplicate grading.
- **Timing trace** per attempt (bounded 5, `window.__m3kRecentAttempts`): `rawMidiNotes`,
  `normalizedKeyIds`, `pitchClasses`, `bassPitchClass`, `targetChord`, `targetPitchClasses`,
  `targetBassRequirement`, `expectedOnset`, `actualOnset`, `timingDeltaMs`, `timingBand`,
  `classificationOutcome`, `chordCorrect`, `detectedChordLabel`, `countInStartedAt`,
  `countInFinishedAt`, `visualTargetShownAt`, `timingWindowStart`, `timingWindowEnd`.
- Timing thresholds are unchanged (`on_time ±140 ms`, `missed > 420 ms`). Observation (not changed):
  ±140 ms is demanding for absolute beginners; documented here for a future pedagogy review.

## User-facing feedback

Every timed M3K screen now states the target chord, when to play, whether notes are prepared in
advance, and whether MIDI needs a button:

- MIDI connected: «MIDI подключён: играйте аккорд C точно на целевой доле — кнопка „Сыграть аккорд"
  не нужна.»
- Screen piano: «выберите 3 клавиши заранее, запустите отсчёт и нажмите „Сыграть аккорд" на целевой доле.»
- Result model keeps pitch and timing independent and displays both:
  `Сыграно: C minor` / `Ожидалось: C` / `Аккорд: ✗ не та терция` / `Время: Точно`;
  correct chord with a missed beat shows `Аккорд: ✓` + `Время: Пропущена доля`.
  Timing failure never rewrites chord correctness into a generic error.

## Daily Practice

- Scheduled `chordPulse`, `chordChangeTiming`, `chordRhythmPattern` cards use the same
  octave-independent `classifyRhythmChord()` contract (no register-sensitive regression path).
- The `chordChangeTiming` card runs the same two-bar C → G/B exercise as the module stage.
- A question resolves once: the two-bar change and two-strike patterns only commit after the whole
  exercise; the first graded attempt produces at most one `ReviewLogEvent` and one FSRS mutation, and
  corrective replay produces zero additional grading. `questionInstanceId` and
  `claimFirstAnswerCommit` are preserved.
- Module assessment remains FSRS-neutral (transfer mode); Daily Practice is the graded path.

## Regression preservation

Checkpoint A invariants re-verified and unchanged:

- module exclusivity and visible-module/input-routing match;
- explicit module completion/exit and terminal failed-retry exits (`Вернуться к учебным шагам`,
  `В программу`);
- reload-safe `pendingCorrective`/`scoredQuestionIds`;
- canonical one-grade delayed-check policy across curriculum modules;
- backup transaction safety (validation before write, atomic import, rollback);
- rhythm timer/clock teardown, visibility handling, cancellable metronome clicks;
- scheduler persistence ordering (persist before next scheduler decision).

## Tests

- **495 tests / 28 files passing** (`npm test`), including 20 M3K semantic tests in
  `tests/unit/rhythmChordSemantics.test.ts`: plain chords across octaves, inversions, `Am`/`F`,
  slash `G/B` bass acceptance/rejection, `wrong_quality` diagnostics, incomplete/extra notes,
  no hidden register, labels/trace, the late-diagnostic window invariants, and the two-bar change
  model (`changeOnBeatOne` ≠ `oneChordPerBar`, canonical C → G/B transition, success, `wrong_bass`
  at exact timing, chord correctness surviving a missed change downbeat, reload/resume from bar 2,
  and no intermediate completion).
- Existing tests were not rewritten to hide regressions; the only earlier test updates were the
  canonical one-grade/roadmap updates already accepted in Checkpoint A.

## Production smoke

`npm run smoke:m3k` (production preview, isolated Chrome profile, fake Web MIDI, synthetic stages 1–10):

- **Two-bar change exercise** on `changeOnBeatOne`, repeated with two voicing pairs
  (`C3–E3–G3 → B3–D4–G4` and `C4–E4–G4 → B2–D3–G3`): count-in, bar 1 C on beat 1, release, bar 2
  G/B exactly on the next downbeat → `Такт 1 · C: ✓`, `Такт 2 · G/B: ✓`, `Смена: Точно`; both bars
  share one `questionInstanceId` and the raw MIDI notes are asserted per transition.
- **Root-position G on the change bar:** `wrong_bass` with `Смена: Точно`
  (`Такт 2 · G/B: ✗ неверный бас`).
- **Correct G/B after the missed change threshold:** `Такт 2 · G/B: ✓` with
  `Смена: Пропущена доля` (chord correctness survives timing failure).
- Preserved: exclusivity, screen-piano corrective reload with 0 FSRS logs, remediation into fresh
  retry, terminal failed retry exits, completion persistence, exit into normal practice,
  0 runtime exceptions, 0 console errors.
- Evidence: `acceptance/m3k-final/screenshots/01-pre-count-in.png` (Сейчас C / Далее G/B),
  `02-play-now.png` (bar 1 target), `03-correct-change-on-time.png` (per-bar success + Точная смена),
  `04-wrong-bass-on-time.png` (неверный бас при точной смене), `05-module-complete.png`.

## Packaging / CI workflow

- `npm run package:m3k-final` builds `piano-key-trainer-milestone3k-final.zip` from an explicit
  allowlist (source, tests, all scripts, docs, reports, `.github/`, `acceptance/m3k-final/`),
  with deterministic double-build byte-identity and package-script coverage checks.
- **Checkpoint A gap fixed:** `.github/workflows/verify.yml` is now walked into the archive, and the
  builder has an explicit infrastructure self-check that requires
  `.github/workflows/verify.yml`, `.gitignore`, `package.json`, `package-lock.json`, and non-empty
  `src/`, `tests/`, `scripts/` trees — independent of package-script discovery.
- Legacy Stabilization Rev1/Rev2 scripts remain marked legacy and are excluded from the current
  release workflow (but harmless inside the archive).

## Known limitations

- **Physical MIDI tested: no.** Fake Web MIDI covers the event path (note-on/note-off/velocity-0,
  3-note lock, release/re-arm, two-bar change); a real controller and real timing jitter need the
  manual user test.
- The screen-piano two-bar change is covered by the shared reducer/evaluator unit tests and the
  explicit UI plan/copy; the production smoke drives the change exercise through fake MIDI only.
- Timing thresholds were intentionally not retuned; the ±140 ms on-time window is documented as a
  possible future pedagogy observation.
- The late-diagnostic window is a fixed 900 ms and is diagnostic only; M3K remains a 60 BPM 4/4
  block-chord rhythm module with no new patterns, meters, eighth notes, two-hand mode or FSRS changes.
- Daily Practice full-cycle coaching was verified through unit-level semantics and the smoke's
  post-completion practice entry; a dedicated long-form Daily Practice smoke remains future work.

## Verification

```
npm run typecheck                     # 0 errors
npm run check:svelte                  # 0 errors, 0 warnings
npm test                              # 495/495 across 28 files
npm run build                         # PASS (PWA generated)
npm run verify                        # PASS
npm run smoke:scheduler-integrity     # PASS
npm run smoke:m3i                     # PASS
npm run smoke:m3j                     # PASS
npm run smoke:m3k                     # PASS (5 screenshots, 0 runtime/console errors)
npm run package:m3k-final             # deterministic ZIP + infrastructure self-check
```

Clean-extraction validation (fresh folder, only files from the ZIP):

```
extract piano-key-trainer-milestone3k-final.zip
npm ci
npm run verify
npm run smoke:scheduler-integrity
npm run smoke:m3j
npm run smoke:m3k
```

Result: **PASS** on 2026-10-05 from `C:\Users\pavel\AppData\Local\Temp\opencode\m3k-final`
(163 files extracted; `.github/workflows/verify.yml` present): `npm ci` ✔, `npm run verify` ✔,
`smoke:scheduler-integrity` ✔, `smoke:m3j` ✔, `smoke:m3k` ✔ (5 screenshots), no project files
outside the ZIP. **STOP: pending independent acceptance and physical-MIDI user test.**
