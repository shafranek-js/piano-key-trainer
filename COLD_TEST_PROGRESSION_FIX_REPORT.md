# Cold Test Progression Integrity Fix — Report

**Scope:** P0 fix — specialized Cold Test task families (the daily triad/harmony/rhythm handlers) did
not advance the 20-item Cold Test after a correct answer, and the session counters disagreed
(header showed one number, the task label another). Continues from the accepted M3K Rev1 Fix
(`dbffa01`); M3K, scheduler policy, FSRS algorithm, Cold Test composition (20 skills), and all
accepted module semantics are unchanged.

**Physical MIDI tested: NO — Fake Web MIDI tested: YES** (the Cold Test smoke uses screen input and
keyboard clicks; fake-MIDI coverage is inherited from the M3K/M3J smokes).

**Follow-up (P1 acceptance fix):** the displayed question number lifecycle was corrected in
`COLD_TEST_DISPLAY_FIX_REPORT.md`; the final delivery archive is
`piano-key-trainer-cold-test-display-fix.zip`.

---

## Baseline

- Candidate: accepted M3K Rev1 Fix working tree — 508 tests / 29 files, `verify` + 4 smokes green.
- Reported reproduction: in a Cold Test, item 8/20 was a `triadBuild` F# major question; answering it
  correctly produced correct feedback, but the queue did not advance to 9/20. The header could show
  7/20 or 8/20 while the task label showed a different value, and «Следующее →» did not move on.

## Root Cause

Two independent defects:

1. **Only the generic path advanced the queue.** `handleAnswerSubmit` (find, identify,
   patternIdentify, notationToKey, soundToKey, notationBassToKey, intervalBuild, intervalIdentify,
   triadIdentify, …) incremented `coldIndex`. The specialized daily handlers — `handleDailyChordSubmit`
   (`triadBuild`, `triadInversionBuild`, `chordSymbolRead`), `handleDailyHarmonyAnswer`,
   `handleDailyHarmonySubmitChord`, `finishDailyHarmonyReview` and `commitDailyRhythmOutcome`
   (`chordPulse`, `chordChangeTiming`, `chordRhythmPattern`) — never did. After a correct specialized
   answer the item stayed on screen forever.
2. **Completion state was not propagated.** The specialized evaluators return
   `updatedState.isCompleted/isLocked`, but the handlers did not copy those fields into the App round
   state, so `TaskStage` never showed «Следующее →» and auto-advance could not run even manually.
3. **Counter drift.** The session header derived from `coldIndex` (completed items) while the task
   eyebrow used `coldIndex + 1` (current item), so the two labels could differ by one at the same
   moment.

## Architecture — one completion contract

- **`src/core/learning/coldTest.ts` (new, pure).** `COLD_TEST_SKILLS` (19 canonical families),
  `coldTestTotalTrials`, `coldTestItemNumber`, `isColdTestComplete`, and
  `resolveColdTestCompletion({ queueLength, index, completedItemKey, itemKey })`.
  The completed-item key is the question identity (`currentQuestionInstanceId`), which makes the
  contract idempotent: a repeated callback returns `claimed: false`; a missing key never advances;
  the index can never overflow 20. `src/core/scheduler/queue.ts` now cycles `COLD_TEST_SKILLS`
  filtered by the families actually present in the card pool, so the queue and the contract cannot
  drift apart.
- **`src/App.svelte` — `completeColdTestItem(reason)`** is the single terminal path for every Cold
  Test family. It claims once per question, sets `coldIndex = nextIndex`, `coldCompletedItemKey`, and
  `isCompleted = isLocked = true`, then pushes a bounded diagnostic trace
  (`window.__coldTrace`, last 40 entries: item index/number, card, task type, question id,
  claimed, reason, next index).
- Every cold branch now routes through it: the generic `handleAnswerSubmit` branch, the
  `triadBuild/triadInversionBuild/chordSymbolRead` branch, `handleDailyHarmonyAnswer`,
  `handleDailyHarmonySubmitChord` (a wrong chord fails the single attempt immediately),
  `finishDailyHarmonyReview`, and `commitDailyRhythmOutcome`. `handleDontKnow` has a defensive cold
  branch; the button itself stays hidden in Cold Test (`showDontKnow={currentKind !== 'cold'}`).
- The specialized handlers copy `isCompleted/isLocked` from `evaluation.updatedState`
  (`evaluateDailyChordAttempt`, `evaluateDailyInversionAttempt` mark cold items completed and
  locked on the single attempt, correct or wrong), and `nextRound` uses
  `isColdTestComplete(coldIndex, coldQueue.length)` before re-activating a card.

## Supported Task Types

All 19 `COLD_TEST_SKILLS` are covered by the shared contract. The queue contains a family only if
the card pool has cards for it, so a sparse synthetic profile (or a real profile without advanced
cards) gets a queue cycling exactly the available families. The production smoke proves the
supported families end-to-end by seeding eight families in canonical cycle order — `find`,
`identify`, `patternIdentify`, `notationToKey`, `soundToKey`, `notationBassToKey`, `intervalBuild`,
`triadBuild` — and completing a full 20/20 run.

## Counter Semantics

- Header (SessionStrip) and task eyebrow both show **the question currently on screen**:
  `Cold Test · (active + 1)/20`, clamped to 20. The progress bar and the session detail
  (`выполнено X из 20 · точность …`) show the completed count.
- The completion pointer advances immediately on completion, but the displayed number changes only
  when the next question is actually activated. While item 8 feedback is visible the labels stay
  8/20 with `выполнено 8 из 20`; after «Следующее →» the labels become 9/20. This display contract
  was corrected in `COLD_TEST_DISPLAY_FIX_REPORT.md` (the first revision of this checkpoint had the
  displayed number follow the completion pointer, advancing one question early during feedback).
- The Cold Test remains exactly 20 items — completing the 20th finishes the session and never
  renders a 21st question.

## Idempotency and End of Test

- A duplicate completion callback (double click, duplicated MIDI event, delayed async handler) for
  the same question identity is ignored (`claimed: false`, no trace of a second increment), so items
  cannot be skipped.
- With `autoAdvanceDelaySeconds = 0` the smoke exercises the manual «Следующее →» button only; the
  default 3 s auto-advance path is untouched. Both rely on the same `isCompleted` flag that
  `completeColdTestItem` now guarantees.
- On item 20, `nextRound` sees `isColdTestComplete` and calls `finishLearningSession('cold_complete')`;
  the persisted `coldTests` record contains 20 items.

## Code Changes

- `src/core/learning/coldTest.ts` — new central pure contract.
- `src/core/learning/index.ts` — exports the contract.
- `src/core/scheduler/queue.ts` — `buildColdQueue` uses `COLD_TEST_SKILLS`.
- `src/App.svelte` — imports, state (`coldCompletedItemKey`, `ColdTraceEntry`, `coldTrace`,
  `coldItemNumber`), `pushColdTrace`, `completeColdTestItem`, cold branches in every handler,
  counter labels, session reset, `nextRound` completion check.
- `tests/unit/coldTestProgression.test.ts` — new (28 tests).
- `scripts/smokeColdTest.mjs`, `package.json` (`smoke:cold-test`, `package:cold-test-fix`) — new.
- `acceptance/cold-test-progression/` — README + 3 screenshots.
- `scripts/buildColdTestProgressionArchive.mjs`, `COLD_TEST_PROGRESSION_FIX_REPORT.md` — evidence and
  packaging.

## Tests

**536 tests / 30 files passing** (+28 new; no existing semantics changed).

`tests/unit/coldTestProgression.test.ts`:

- table-driven contract matrix over **every** `COLD_TEST_SKILLS` family: first claim advances
  index 7 → 8, a duplicate callback for the same question does not advance;
- queue-builder coverage: with one card per family the 20-item queue contains all seeded families;
- negatives: missing question key never advances; five duplicate callbacks move the index exactly
  once; item 20 completes once and a 21st claim is rejected (no overflow); a corrective replay
  (same question identity) is not a new item;
- counter semantics: 0→1, 7→8, 19→20, 20→20, short-queue clamping;
- state propagation: `evaluateDailyChordAttempt` and `evaluateDailyInversionAttempt` with
  `kind: 'cold'` return `updatedState.isCompleted = true` and `isLocked = true` on the single
  attempt (correct and wrong for the chord evaluator).

## Production Smoke

`npm run smoke:cold-test` (production preview, isolated Chrome profile, synthetic profile with eight
seed families, `autoAdvanceDelaySeconds = 0`, screen input only):

- starts the Cold Test from the session summary «Cold Test · 20» action;
- for **each** of the 20 items asserts `header === task label === Cold Test · N/20` at activation
  (with `выполнено N−1 из 20`) and that the next button is absent until completion; after completion
  the same N/20 stays visible with `выполнено N из 20` until the next question is activated;
- **item 8 reproduction:** `triadBuild` at the canonical `F#3` root (the seed's `reps = 3` selects
  the same deterministic rotation as the report). Asserts the prompt names F#3, detail says
  `выполнено 7 из 20`, screenshot 01; builds F#3 + A#3 + C#4, presses «Проверить аккорд», then
  asserts correct feedback «Верно! F#3 мажор.», the displayed number still 8/20 with
  `выполнено 8 из 20`, unchanged question identity, `Следующее →` without a countdown, and the trace
  entry `completedIndex 8, activeItemIndex 7, nextIndex 8, claimed`, screenshot 02; clicking
  «Следующее →» changes the question identity and shows item 9/20 with `выполнено 8 из 20`,
  screenshot 03;
- items 1–20 complete exactly once; completing item 20 opens the session-complete stage, persists a
  `coldTests` record with `n = 20`, and never renders a 21st item;
- 0 runtime exceptions, 0 console errors. The corrected screenshots live under
  `acceptance/cold-test-display-fix/screenshots/` (`COLD_TEST_DISPLAY_FIX_REPORT.md`); the
  `acceptance/cold-test-progression/` files are the superseded first-revision evidence.

Screenshots (display fix): `01-item-8-before-answer.png`,
`02-item-8-feedback-still-8-of-20.png`, `03-item-9-after-next.png`.

## Regression

- `smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j`, `smoke:m3k` — PASS (M3K remote rev1 flows
  unchanged; accepted screenshots regenerated by their own runs).
- `npm run verify` — tsc 0, svelte-check 0/0, 536 tests, production build PASS.
- M3K previously accepted by the user (Physical MIDI PASS) is not touched by this fix.

## Verification

```
npm run typecheck                     # 0 errors
npm run check:svelte                  # 0 errors, 0 warnings
npm test                              # 536/536 across 30 files
npm run build                         # PASS (PWA generated)
npm run verify                        # PASS
npm run smoke:scheduler-integrity     # PASS
npm run smoke:m3i                     # PASS
npm run smoke:m3j                     # PASS
npm run smoke:m3k                     # PASS (3 screenshots, 0 runtime/console errors)
npm run smoke:cold-test               # PASS (3 screenshots, 0 runtime/console errors)
npm run package:cold-test-fix         # deterministic ZIP + infrastructure self-check
```

> Note: this machine currently cold-starts the production preview in ~47 s; the
> `smoke:scheduler-integrity` readiness loop (18 s) needs a warm cache. After one manual preview
> start all smokes pass without changes. No product code is involved in this timing.

## Clean Extraction

From a completely fresh directory containing only the ZIP contents:

```bash
npm ci
npm run verify
npm run smoke:scheduler-integrity
npm run smoke:m3j
npm run smoke:m3k
npm run smoke:cold-test
```

Result: **PASS** on 2026-10-06 from
`C:\Users\pavel\AppData\Local\Temp\opencode\cold-test-fix` (171 files; `.github/workflows/verify.yml`
present): `npm ci` clean, `verify` 536/536, and `smoke:scheduler-integrity`, `smoke:m3j`, `smoke:m3k`,
`smoke:cold-test` all green. The archive includes `.github/workflows/verify.yml`, `.gitignore`,
`package.json`, `package-lock.json` and non-empty `src/`, `tests/`, `scripts/` trees enforced by the
builder self-check.

## Known Limitations

- Cold Test remains **one attempt per item** by design (wrong answers complete the item and advance);
  the fix does not change that policy. Corrective flows exist only in the daily (non-cold) handlers.
- The smoke drives the specialized families through the screen keyboard and answer buttons; a
  physical-MIDI Cold Test run was not separately performed (the Cold Test-specific MIDI nuance is
  inherited from the accepted M3K input layer).
- The smoke seeds eight of the 19 families; the remaining families share the same code path and are
  covered by the contract matrix in unit tests rather than end-to-end.
