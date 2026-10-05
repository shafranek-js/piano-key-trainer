# Audit Remediation & M3K Stabilization — Checkpoint A Report

Status: **completed, pending independent acceptance**. M3K remains WIP.
Date: 2026-10-05.
Source audit: `CODE_AUDIT.md`. Product baseline: M3I accepted, M3J Rev1 accepted, Scheduler Integrity accepted.

---

## Baseline

Captured before any edit, per directive 4:

- `git rev-parse HEAD`: `005cd4e0339db74edb8cc20393d39d2f27d415c7`
- node `v24.14.0`, npm `11.11.1`
- working tree: 40 modified tracked files, 265 untracked files, many milestones (3A–3K) not under version control
- `npm ci`: **initially failed** with `EPERM` unlinking `node_modules/@esbuild/win32-x64/esbuild.exe`
  - root cause: an orphaned dev process started on 2026-10-01 (`start-dev.mjs`, PID 5544) kept an
    `esbuild.exe --service` (PID 38836) locked; the process tree was stopped and `npm ci` then succeeded
- gate baseline (expected red):

| Gate | Baseline |
|---|---|
| `npm run typecheck` | PASS |
| `npm run check:svelte` | **7 errors** (App.svelte:147/149/157/483/3248/3368, ChordRhythmStage.svelte:17) |
| `npm test` | **441 passed / 2 failed** (`learningRoadmap.test.ts`, 10 vs 11 stages) |
| `npm run build` | PASS |
| `npm run verify` | FAIL (svelte-check) |

Safety baseline: branch `stabilization/m3k-audit-remediation` created (history not rewritten), `.gitignore`
extended (coverage, `*.tsbuildinfo`, `diagnostics-*.json`, `piano-key-trainer-*.zip`, env files, browser
profiles), and the full working tree committed as `b2618b8` ("freeze M3K WIP baseline"). 298 files were
tracked; generated ZIPs, `dist`, `node_modules`, and temporary diagnostics are ignored. `acceptance/`
evidence was kept under version control instead of blanket-ignored.

---

## Audit findings reproduced

All P0/P1 findings were reproduced statically and, where relevant, by executing the failing gates and
the production browser smokes. Runtime-only reproductions were not possible for
Import-race / same-millisecond `ts` collision / MIDI unplug / audio partial failure; those remain
deferred (see below).

| Audit ID | Finding | Reproduced? |
|---|---|---|
| P0-1 | `verify` red: 7 svelte-check errors + 2 roadmap test failures | Yes (tool output) |
| P0-2 | M3K completion blocks `nextRound` forever, no module exit | Yes (code path + previously blocked UI) |
| P1-1 | Failed-assessment «Вернуться к учебным шагам» dead; `startRemediation` deadlock | Yes (unit + smoke path) |
| P1-2 | `pendingCorrective`/`scoredQuestionIds` not persisted → double-count after reload | Yes (unit + smoke reload) |
| P1-3 | Stored XSS via imported `card.note` into `{@html}` prompt | Yes (validator + prompt test) |
| P1-4 | Backup import destructive before validation, non-atomic, races review queue | Yes (code + new rollback test) |
| P1-5 | Import normalization drops `harmonySnapshot` / `chordRhythmSnapshot` | Yes (unit roundtrip) |
| P1-6/P1-7 | Delayed-check retry FSRS/reload divergence across modules | Yes (tests updated to canonical contract) |
| P1-8 | Roadmap keeps a stage "current" after all 11 complete | Yes (unit test) |
| P1-9 | Stabilization Rev1/Rev2 packaging scripts reference missing files | Yes (file checks) |
| P1-10 | M3K has no unit/smoke coverage | Yes (no test/smoke existed) |
| P2 | Module-state exclusivity/input-routing mismatch | Yes (unit + smoke) |
| P2 | Daily `chordRhythmPattern` collapsed to one strike | Yes (unit) |
| P2 | Rhythm clock/deadline teardown, metronome `stop()` leaves scheduled clicks | Yes (unit + code) |
| P2 | Keyboard/input regressions (activePage, repeat, Enter a11y, session-end) | Yes (code; smoke end-to-end) |
| P2 | Numeric settings/card sanitization, missing `card.stats` crash | Yes (unit) |
| P2 | No CI / repo hygiene / docs drift | Yes (inspection) |

---

## Product decisions applied

- M3K continues as WIP; learner roadmap = 11 stages, #11 «Ритм аккордов».
- Backup JSON is untrusted input: parse → schema validate → semantic normalize → atomic write.
- Canonical delayed-correction rule everywhere: first gradeable attempt → at most 1 FSRS mutation and
  1 ReviewLog; remediation retries after a graded failure → 0 additional mutations/logs.
- All 11 stages completed → `currentStageId === null`.
- M3K assessment/corrective state is learner state and must survive reload.
- Out of scope (deferred): FSRS algorithm retuning, MusicXML stabilization, audio failure-strategy
  redesign, `App.svelte` rewrite, new M3K pedagogy.

---

## Quality gate fixes

- `svelte-check` 7 → **0 errors / 0 warnings**:
  - removed unused imports/locals (`getRhythmAssessmentLength`, `RhythmAssessmentState`,
    `rhythmInputMethod`) and the unused `onToggleKey` prop;
  - fixed the real type error by typing `rhythmSnapshotFor()` as
    `NonNullable<LearningProgressRecord['chordRhythmSnapshot']>` and adding the new snapshot fields;
  - wired `returnFromChordRhythmFailure` into the failure lifecycle (was flagged unused).
- Roadmap tests updated to the product contract: **11 stages / 6 advanced modules**, plus a dedicated
  test that 11/11 completed yields `currentStageId === null` for every stage
  (`buildLearningRoadmap` fallback rewritten to "latest completed stage, unless everything is complete").
- `tests/unit/curriculum3c.test.ts`, `curriculum3d.test.ts`, `firstRunCf.test.ts` updated to the
  canonical one-grade policy (graded-failure marker) instead of the old divergent expectations.

---

## M3K lifecycle

- New pure helper `src/core/learning/moduleLifecycle.ts` (`resetAdvancedModuleStates`,
  `hasSingleActiveModule`): at most one advanced module state may be active.
- `clearActiveAdvancedModuleStates()` in `App.svelte` is used by every `handleStart*Module` handler
  (Bass/Grand Staff, Intervals, Triads, Inversions, Harmony, Chord Rhythm), so the visible module and
  the keyboard/MIDI routing module always match.
- New explicit exit `exitChordRhythmModule(destination)`: cancels the run, clears the module state,
  returns to Program or continues normal practice via `startLearningSession()` + `nextRound()`.
  `moduleComplete` now renders **«Продолжить тренировку»** and **«В программу»**.
- Failed transfer lifecycle fixed at the state-machine level, not the button:
  - a failed retry block is terminal (`phase: 'failed'`), so no 12 → 8 → 8 → … loop;
  - `startRhythmRemediation` no longer deadlocks (`canStartRhythmRemediation` + terminal `failed`);
  - `targetedRemediationStep()` maps the first failed trial to a pedagogically useful guided step
    (`pulse → oneChordPerBar`, `change → changeOnBeatOne`, `pattern → twoStrikes`), keeping the weak
    skill context;
  - the failed screen exposes «Вернуться к учебным шагам» and «В программу».
- `nextRound()` still pauses while a module is active, but completion/cancel now always releases the
  state, so no page reload is ever required.

## Persistence / reload

- `ChordRhythmModuleSnapshot` now persists `pendingCorrective` and `scoredQuestionIds`
  (`src/core/learning/types.ts`), and `rhythmSnapshotFor()` writes them.
- New runtime validator `normalizeChordRhythmSnapshot()` validates every field (stage/block/phase
  unions, finite non-negative counters, string arrays) and falls back safely for corrupt data instead
  of unsafe casts.
- `createChordRhythmModuleState()` restores the full corrective/assessment state, and `loadData()`
  re-enters an in-progress module after reload (`getChordRhythmModuleStatus` now reports
  `in_progress` from a session snapshot).
- `persistChordRhythmState()` applies the reduced state synchronously and serializes the IndexedDB
  write through one queue (accepted Harmony/Scheduler contract), with rollback on write failure.
- `submitQuestionAttempt()` no longer emits a `ReviewLogEvent` for a delayed-check remediation retry
  (`ineligible_non_first_attempt`), enforcing the one-log rule.

## Backup safety

- New `src/storage/backup.ts`:
  - `BACKUP_SCHEMA_VERSION = 1`; unknown future versions and wrong-app files are rejected with a clear
    message; legacy backups without a schema version are accepted and stamped as version 0;
  - strict validation/normalization of cards (skill/note allowlists, finite numerics, `stats` defaults),
    review logs (sorted, validated), cold tests, lesson progress, learning progress, and settings
    (ranges/enums/booleans, string length bounds);
  - hostile `card.note` values are dropped and reported in warnings; `{@html}` prompt fallbacks no
    longer interpolate raw note values (`getPatternIdentifyPrompt`, `App.svelte` prompt strings);
  - `applyBackupAtomically()` replaces all stores in one Dexie transaction after
    `reviewPersistenceQueue` drains; a failure at any step rolls back, leaving the old profile intact;
  - `normalizeBackupLearningProgress()` now preserves `harmonySnapshot` and `chordRhythmSnapshot`.
- `loadData()` self-heals legacy/imported cards missing `stats` via `normalizeBackupCard`.
- The ProgressView legacy import path was removed in favor of the single canonical import/export.

## Trial / FSRS correction policy

- `trialPolicy` now owns the canonical markers/helpers:
  - `DELAYED_RETRY_CONTEXT = 'pending:delayedRetry'`;
  - `GRADED_FAILURE_CONTEXT = 'pending:gradedFailure'` (set only when the failed first attempt
    actually graded FSRS `Again`);
  - `hasPendingDelayedRetry()` / `isDelayedCheckFirstAttempt()`.
- White-key (`curriculumFlow`), 3D (`curriculum3d`), and First-Run (`firstRunCf`) delayed-check retries
  after a graded failure pass `firstAttempt: false`, so they cannot mutate FSRS or emit logs; the
  pedagogical transition (corrective requirement / retention) still applies via the module wrappers.
- `Don't know` remediation stays hint-only: it persists remediation state but no graded-failure marker,
  so the eventual unhinted H0 attempt is still the first gradeable attempt (no lost grading).
- First-Run failed anchors keep remediation pending, are not promoted to `mixReady`, resume corrective
  remediation after reload, and reach retention only after the corrective + intervening recall + fresh
  H0 retry sequence.

## Input lifecycle

- Global keyboard handler now:
  - handles `Escape` before the session-active guard (settings/summary still close);
  - ignores `event.repeat` so a held key never fires a second semantic action;
  - lets focused interactive controls keep native Enter/Space activation;
  - requires `activePage === 'practice'` and an active session before any module handling.
- `dispatchIntervalAction` / `dispatchTriadAction` / `dispatchInversionAction` require an active
  session; rhythm handlers (`toggleRhythmKey`, `submitRhythmChord`, `startChordRhythmRun`,
  `commitDailyRhythmOutcome`, completion/exit) are session-guarded too.
- Daily rhythm cards carry `dailySkill`, so `chordRhythmPattern` requires both strikes (beats 1 and 3)
  instead of collapsing to one.

## Timer / metronome teardown

- `cancelChordRhythmRun()` bumps a generation counter; `startChordRhythmRun()` captures it and aborts
  after `await ensureContext()` if a newer cancel/start happened (no late runs after navigation).
- Rhythm clock and deadline timer are cancelled on module exit, page change (`$effect`), tab hide
  (`visibilitychange`), and component unmount.
- `MetronomeClock.stop()` now cancels already-scheduled clicks: `AudioEngine.playMetronomeClick()`
  returns a cancel handle (gain ramp-down + oscillator stop/disconnect), the clock tracks all handles
  and invokes them on `stop()`; `isRunning` stays `false` for an empty sequence.

## Tests

Current: **475/475 passing across 27 test files** (`npm test`), `tsc --noEmit` clean,
`svelte-check` 0 errors / 0 warnings.

New coverage (31 tests):

- `tests/unit/chordRhythm.test.ts` (14): assessment lengths, 80% threshold, max-3 remediation,
  fresh retry, terminal failed retry, one-record-per-question invariant, corrective no-rescore,
  targeted remediation mapping, daily strike count, reducer stage progression and completion,
  snapshot roundtrip with `pendingCorrective`/`scoredQuestionIds`, corrupt-snapshot fallbacks,
  module status, card gating, and the critical one-grade regression (graded failure → reloaded
  corrective retry → no second log/mutation).
- `tests/unit/backupSafety.test.ts` (9): invalid/wrong-app/unsupported-version rejection, legacy
  acceptance, hostile-note dropping, numeric normalization and `stats` defaults, settings sanitization,
  prompt fallback safety, snapshot roundtrip, atomic success + mid-import rollback
  (`fake-indexeddb`).
- `tests/unit/moduleLifecycle.test.ts` (3) and `tests/unit/metronomeClock.test.ts` (4): module
  exclusivity/case-insensitivity; count-in/accent, empty sequence, stop cancellation, stale-callback
  generation guard.
- Updated `learningRoadmap`, `curriculum3c`, `curriculum3d`, `firstRunCf` tests for the 11-stage
  contract and canonical one-grade policy.

Known test gaps (deferred): no component-level tests for `App.svelte`; keyboard `event.repeat` is
covered by code inspection plus the smoke's continued end-to-end flows rather than a dedicated
runtime assertion.

## Runtime smokes

All four production smokes pass with an isolated Chrome profile and synthetic progress:

- `npm run smoke:scheduler-integrity` — 0 runtime exceptions / 0 console errors.
- `npm run smoke:m3i` — accepted baseline still green.
- `npm run smoke:m3j` — accepted baseline still green, 6 screenshots unchanged.
- `npm run smoke:m3k` (new) — enters #11 from Program, verifies module exclusivity, runs a wrong first
  assessment attempt, reloads into the persisted corrective state, completes the corrective replay
  with 0 FSRS review logs, reaches a failed 12-trial result, runs focused remediation into a fresh
  8-trial retry, restores a terminal failed retry with working return-to-learning + Program exit,
  completes a passed assessment (persisted retention records + cards), exits into normal practice
  without reload, and reports 0 runtime exceptions / 0 console errors. 4 screenshots:
  `01-program-chord-rhythm-current.png`, `02-failed-assessment-remediation.png`,
  `03-failed-retry-exit.png`, `04-module-complete-continue.png`.

## CI / repository hygiene

- Added `.github/workflows/verify.yml`: `npm ci` + `npm run verify` on push and pull request
  (browser smokes remain mandatory locally, not in CI).
- `.gitignore`: added coverage, `*.tsbuildinfo`, `diagnostics-*.json`, generated
  `piano-key-trainer-*.zip`, env patterns, browser-profile directories.
- `acceptance/audit-stabilization-a/` added as evidence (README + 4 screenshots).
- Every previously untracked source/test/script/doc file is now under version control on
  `stabilization/m3k-audit-remediation`; generated artifacts stay untracked.
- Legacy Stabilization Rev1/Rev2 packaging scripts are marked `LEGACY` and excluded from the current
  release workflow; current packaging scripts reference only existing files.
- Docs updated: `README.md` (M3K WIP module + commands), `Piano_Key_Trainer_Roadmap.md`
  (11 stages, M3K WIP checkpoint, scope freeze), `Piano_Key_Trainer_Developer_Handoff.md`
  (M3J accepted, section 3.17 stabilization summary). Historical milestone reports were **not**
  edited.
- `npm run package:audit-stabilization-a` builds `piano-key-trainer-audit-stabilization-a.zip`
  from an explicit allowlist with deterministic double-build byte-identity and package-script
  coverage checks.

## Deferred audit findings

Explicitly out of scope for this checkpoint (recorded, not fixed):

- **FSRS algorithm deviations** (short-term branch keyed on `memoryState`, initial-stability floor,
  mean reversion, fractional intervals) — separate FSRS Policy Review.
- **Latency grading contamination** (`responseMs` 1200/800 in module logs, quantiles over non-FSRS
  events) — FSRS Policy Review.
- **Storage hardening** (`reviewLogs` primary key = `ts`, sticky `reviewPersistenceFailed`,
  fire-and-forget cold-test/lesson writes, migrator flag ordering) — follow-up stabilization.
- **MusicXML / repertoire** (`.mxl` limits, 512-note truncation, entity double-escape, OSMD cleanup,
  `REPERTOIRE` mutation, BPM duplication) — separate checkpoint.
- **Audio/MIDI failure strategies** (partial sample failure silences the instrument, MIDI unplug
  stuck notes) — separate checkpoint; only metronome teardown was in scope.
- **`App.svelte` decomposition**, dead Supabase module, legacy ProgressView backup-format migration,
  remaining test-quality cleanups, and `acceptance/` LFS policy.
- Stabilization Rev1/Rev2 historical archives were not regenerated; the scripts are legacy-marked.

## Verification

```
npm run typecheck                     # 0 errors
npm run check:svelte                  # 0 errors, 0 warnings
npm test                              # 475/475 across 27 files
npm run build                         # PASS (PWA generated)
npm run verify                        # PASS
npm run smoke:scheduler-integrity     # PASS
npm run smoke:m3i                     # PASS
npm run smoke:m3j                     # PASS
npm run smoke:m3k                     # PASS (4 screenshots)
npm run package:audit-stabilization-a # deterministic ZIP + allowlist checks
```

Clean-extraction validation (fresh folder, no files outside the archive):

```
extract piano-key-trainer-audit-stabilization-a.zip   # 158 files
npm ci                                               # PASS
npm run verify                                       # PASS
npm run smoke:scheduler-integrity                    # PASS
npm run smoke:m3j                                    # PASS
npm run smoke:m3k                                    # PASS (4 screenshots)
```

Executed on 2026-10-05 from
`C:\Users\pavel\AppData\Local\Temp\opencode\audit-stab-a` with no repository files outside the ZIP.
**STOP: pending independent acceptance.**
