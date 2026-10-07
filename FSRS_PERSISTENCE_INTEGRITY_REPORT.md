# FSRS & Persistence Integrity — Stabilization Checkpoint B Report

**Scope:** stabilization-only work on the FSRS-6 layer and the ReviewLog/IndexedDB persistence
boundary. No new curriculum milestone. Continues from the accepted Cold Test Display Fix
(`74ee012`). M3L is not started; M3K semantics, Cold Test composition, one-attempt policy, the
learner roadmap and all accepted module behavior are unchanged.

**Follow-up (P0 backup identity fix):** a backup round-trip defect was found during independent
review and fixed in `FSRS_PERSISTENCE_INTEGRITY_REV1_REPORT.md`; the final delivery archive is
`piano-key-trainer-fsrs-persistence-integrity-rev1.zip`.

---

## Baseline

- Start point: `74ee012` (`fix(cold-test): displayed item number follows the rendered question`),
  branch `stabilization/m3k-audit-remediation`. Node **v24.14.0**, npm **11.11.1**.
- Baseline gate: `npm run verify` green — **544 tests / 30 files**, tsc 0, svelte-check 0/0,
  production build PASS; `smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j`, `smoke:m3k`,
  `smoke:cold-test` green.
- Historical data rule honored: no existing ReviewLog, card state, learning progress or timestamp
  is deleted or rewritten. All FSRS changes apply to future reviews only.

## Audit findings re-verified

From `CODE_AUDIT.md` (Checkpoint A classification preserved), the findings this checkpoint owns:

| ID (audit) | Finding | Status |
| --- | --- | --- |
| P2-FSRS-1 | Short-term branch chosen by `memoryState`, not elapsed time | **FIXED** |
| P2-FSRS-2 | P30/P85 polluted by non-FSRS rows and synthetic `responseMs: 1200/800` | **FIXED** |
| P2-FSRS-3 | `reviewLogs` primary key = `ts`; two events in one millisecond collide | **FIXED** |
| P2-FSRS-4 | `reviewPersistenceFailed` is sticky; one transient IndexedDB error blocks until reload | **FIXED** |
| P2-FSRS-5 | Fire-and-forget `db.coldTests.put` / `db.lessonProgress.put` without `catch` | **FIXED** |
| P2-FSRS-6 | Legacy migrator can partially write and repeat stale overwrites | **FIXED** |
| P2-FSRS-7 | `card.stats` absent guard (`curriculum.ts:45`, `queue.ts:128`) | CONFIRMED BUT DEFERRED (separate checkpoint) |
| P2-FSRS-8 | NaN settings/cards normalization (`clamp(NaN)`, `dueAt: NaN`) | CONFIRMED BUT DEFERRED (separate checkpoint) |

Checkpoint A findings (P0-1/P0-2 quality gate & M3K hang, P1-1…P1-10 lifecycle/XSS/backup/retry)
remain **fixed and accepted**; nothing in this checkpoint reopens them. The audit's other P2/P3
groups (UI/keyboard, audio/MIDI, MusicXML, App decomposition, Supabase, adaptive timing) are
**NOT REPRODUCED here by design** and stay separated exactly as the audit defined them (section 17
out-of-scope list).

Additionally found during this review (not in the original audit):

| Finding | Status |
| --- | --- |
| Stability update used the **post-update** difficulty (canonical uses pre-review D) | **FIXED** |
| Mean-reversion target used **clamped** `D0(Easy)` (canonical target is unclamped ≈ −4.7716) | **FIXED** |
| Intervals were **fractional days** (canonical rounds to whole days) | **FIXED** |
| Retrievability used fractional elapsed days (canonical uses whole floor days) | **FIXED** |
| Stability floor 0.01 vs canonical `STABILITY_MIN = 0.001` | **FIXED** |
| Backup/latency normalization coerced missing `responseMs` to `0` (an artificial "fast" sample) | **FIXED** |

## FSRS canonical reference

- Reference implementation: **`py-fsrs` v6.3.2**, tag `v6.3.2`, commit
  `9446cb06605c597a063aeee49f7d188d42e34dc2`
  (https://github.com/open-spaced-repetition/py-fsrs).
- One-off generator (not a dependency): `scripts/reference/generateFsrsCanonicalVectors.py`;
  it installs `fsrs==6.3.2` into a temporary `--target` directory and is never invoked by the app,
  the build or CI. Python/py-fsrs are **not** production dependencies.
- Golden fixture: `tests/fixtures/fsrsCanonicalVectors.json` (formula vectors, sequences, pinned
  reference metadata).
- Canonical settings used for parity: `desired_retention = 0.9`, `maximum_interval = 120`,
  `learning_steps = (45 s)`, `relearning_steps = (45 s)`, `enable_fuzzing = False` (the app
  schedules deterministically), default 21 FSRS-6 parameters.

## FSRS parity matrix

`tests/unit/fsrsParity.test.ts` (12 tests) compares against the pinned canonical outputs:

- initial stability/difficulty for New → **Again / Hard / Good / Easy**;
- next difficulty (mean reversion, incl. the negative unclamped target);
- recall / forget / short-term stability formulas;
- retrievability at elapsed 0 / 0.5 / 1 / 1.9 / 10 days;
- whole-day interval rounding (0.5, 1, 2.3, 10, 100, 1000 stability);
- full sequences: `new_trajectory` (New→Hard→Easy→Again→relearning→Good), `same_day_review`
  (elapsed < 1 day), `overdue_relearning` (elapsed ≥ 1 day), `new_again_hard_good_easy`,
  `multiple_sequential_reviews` (8 sequential reviews) — comparing **difficulty, stability,
  scheduled interval, due offset and state transition** per step.

Results: every formula and sequence step matches within float noise (**max deviation ≈ 1e-14**;
machine-readable in `acceptance/fsrs-persistence-integrity/evidence.json → fsrsParity`). The only
documented deviation is `Hard` on a 45 s step card (canonical keeps the learning step at 67.5 s;
this app has a single relearning step and schedules the next whole day) — asserted explicitly and
listed in Policy decisions.

## Policy decisions (finding → current → canonical → difference → impact → change → migration)

| Finding | Current (before) | Canonical (`py-fsrs` 6.3.2) | Numerical difference | User impact | Change in checkpoint | Migration required |
| --- | --- | --- | --- | --- | --- | --- |
| Same-day branch | `memoryState === 'relearning'` → short-term always; Review same-day → long-term | Branch on **elapsed whole days < 1** (floor) in Learning/Review/Relearning | S differs for same-day Review (e.g. 2.0091 vs 1.9836 after 15 d Again path) and for overdue relearning (2.4329 vs 2.4384) | Same-day reviews gain correct short-term stability; overdue relearning uses recall/forget | **YES** (future reviews) | NO |
| Difficulty feed into S | S computed with post-update D | S computed with **pre-review** D, then D updates | Up to ~1.5 stability after Hard | Slightly different future intervals | **YES** (future reviews) | NO |
| Mean-reversion target | `clamp(D0(Easy)) = 1` | unclamped `D0(Easy) ≈ −4.7716` | ΔD ≈ 0.0058 per review | Negligible drift toward canonical | **YES** (future reviews) | NO |
| Interval rounding | fractional days (e.g. 2.34 d) | `round()` to whole days, min 1, max cap | ≤ 0.5 day per schedule | Whole-day due dates; no history rewrite | **YES** (future reviews) | NO |
| Retrievability elapsed | fractional days | `timedelta.days` (floor) | Same-day R = 1 exactly; 1.9 d → 1 day | Small S changes on same-day reviews | **YES** (future reviews) | NO |
| Stability floor | 0.01 | `STABILITY_MIN = 0.001` | None with default weights (all S ≫ 0.01) | None observable | **YES** (exactness) | NO |
| Interval fuzzing | deterministic | canonical default fuzzes ±5–15% | n/a by policy | Deterministic schedules are required for this trainer and its tests | **NO — current behavior intentional** | NO |
| Learning steps (Hard) | Hard on a 45 s step → Review + 1 day | Hard keeps the learning step (67.5 s with one 45 s step) | ≥ 1 day vs 67.5 s | Keeps this app's single-step pedagogy | **NO — current behavior intentional** | NO |
| New/Again state label | `relearning` | canonical `Learning` step 0 | None externally (due = 45 s both) | None | **NO — naming/mapping only** | NO |
| Latency→grade policy | app-specific P30/P85 bands | canonical grades are inputs | n/a | Unchanged, but inputs are now sanitized | **NO — policy unchanged** | NO |

No mass reschedule: existing `dueAt`, `stability`, `difficulty` and historical `scheduledDays`
values are untouched; corrections apply from the next review of each card.

## Latency grading cleanup

- `ReviewLogEvent.responseMs` is now `number | null`; `responseTimingSource` is
  `measured | not_measured | legacy_unknown` (`src/core/fsrs/responseTiming.ts`,
  `src/core/fsrs/types.ts`).
- All synthetic module transitions stopped fabricating time: `intervals.ts`, `triads.ts`,
  `bassGrandStaff.ts` (1200/800), `firstRunCf.ts` (800), `curriculumFlow.ts` (800),
  `curriculum3d.ts` (650) now record `null` → `not_measured`. Real screen/MIDI interactions
  continue to record measured `performance.now()` deltas.
- `latencyStats` / `determineGrade` use **only** `measured` finite samples ≥ 0; an untimed correct
  answer grades as `Good` (3) without Hard/Easy. Legacy rows (no provenance) are
  `legacy_unknown` and excluded — the adaptive thresholds safely re-calibrate from new measured
  samples (documented impact: after import/migration, Hard/Easy bands idle until 8 measured samples
  exist, which is the pre-existing safe default).
- Diagnostics report `measuredSamples`, `excludedNotMeasured`, `excludedLegacyUnknown`, P30, P85
  (`DiagnosticsView`, `latencyDiagnosticsSummary`).
- Proof: 1000 synthetic 800/1200 events leave the quantiles of 8 measured responses bit-identical
  (`tests/unit/latencyProvenance.test.ts`; `evidence.json → latencyExclusion`).
- Backup/legacy normalization preserves absent timing as `null` + `legacy_unknown` instead of
  coercing `0` (`normalizeBackupReviewLog`).

## ReviewLog identity and schema migration

- New primary key `reviewEventId` (stable, generated before persistence, reused on retry);
  `ts` remains a regular indexed chronology field.
- Migration is copy-style (Dexie cannot change a primary key in place): **v3** creates
  `reviewLogEvents` (`reviewEventId, ts, sessionId, cardId, kind, skill`) and copies every legacy
  row with `legacy-<ts>` identity + `legacy_unknown` provenance; **v4** retires the old
  `reviewLogs` table. `src/storage/reviewMigrations.ts`.
- Preserved: every log, timestamps, card ids, session ids, question context, grades, chronology.
- Idempotency: reload after upgrade does not rerun destructively; the migrator skips ids that
  already exist (`tests/unit/reviewIdentity.test.ts`: 5-log legacy DB → 5 rows, content-equivalent,
  second open unchanged).
- Two reviews sharing a millisecond persist independently (distinct ids) — unit test + production
  smoke with a frozen clock.
- Backup import **preserves a valid existing `reviewEventId`** (validated as untrusted input:
  string, trimmed, ≤128 chars, safe character set) so same-millisecond events keep distinct
  identities across export → import. Missing or malformed ids fall back to `legacy-<ts>` with a
  bounded warning. Duplicate explicit ids never silently overwrite: exact duplicates are skipped
  with a warning, and an id reused with different content is deterministically disambiguated
  (`-dup2`, `-dup3`, …) so both events survive. Round-trip proof:
  `tests/unit/backupReviewIdentity.test.ts` and `evidence.json → backupRoundTripSameMs`
  (before = 2, after = 2, identitiesPreserved = true).

## Persistence failure / retry lifecycle

- Atomic boundary unchanged and enforced in one IndexedDB transaction: card mutation + review
  event (`src/storage/reviewStore.ts`).
- A failed commit is recorded (bounded) in `failedReviewCommits` and blocks `nextRound`
  (`blocked_persistence_failure`); the failed question stays on screen and the scheduler does not
  advance.
- A dedicated banner (`data-testid="persistence-error-banner"`) with «Повторить сохранение»
  (`persistence-retry-btn`) retries **persistence, not the answer**: the same `reviewEventId`,
  snapshot card and event are reused; on success exactly one card transition + one ReviewLog
  exist, the failure state clears and the deferred `nextRound` resumes.
- One user answer still yields max 1 ReviewLog / max 1 FSRS mutation. If recovery is impossible,
  the UI keeps an explicit persistence error and never silently continues with a lost review.
- Diagnostics distinguish answer duplicate rejection (`duplicate_rejected`) from persistence retry
  (`retry_succeeded`/`retry_failed` + `retryCount`, same `reviewEventId`).

## Migrator safety

- `parseLegacyState` performs the pure validate/transform step; all IndexedDB writes happen in
  **one** transaction; success is verified (re-read of imported review ids) before the
  `piano-trainer-dexie-migrated` flag is set.
- No partial overwrite (rollback on mid-transaction failure), no stale settings overwrite
  (legacy settings only fill an empty profile), no false "migration complete".
- Failpoint tests (`tests/unit/migratorSafety.test.ts`): corrupt payload (nothing written, flag
  unset), injected transaction failure (rollback, retry succeeds), mid-transaction DataError after
  earlier writes (all rolled back), second startup after success (no re-run).

## Diagnostics

Bounded `persistenceDiagnostics` (max 20) with `reviewEventId`, `questionInstanceId`, `cardId`,
`commitAttempt`, `commitStatus`, `errorClass`, `retryCount`, `persistedAt`; bounded
`storageWriteFailures` for Cold Test/lesson statistics; latency provenance summary. Surfaced in
Diagnostics → «Persistence и latency диагностика» and via `window.__persistenceDiagnostics` /
`window.__storageWriteFailures`. No browser/storage internals or user content are included.

## Tests

**577 tests / 35 files passing** (baseline 544/30). No existing test was weakened; `learning.test.ts`
was extended for schema v3/v4.

New/updated:
- `tests/unit/fsrsParity.test.ts` (12) — canonical parity matrix;
- `tests/unit/latencyProvenance.test.ts` (7) — measured-only quantiles, 1000-synthetic proof,
  null timing, diagnostics summary;
- `tests/unit/reviewIdentity.test.ts` (7) — identity, same-ms persistence, atomic failure/retry,
  v2→v4 migration preservation + idempotency;
- `tests/unit/migratorSafety.test.ts` (4) — failpoints/retry/second-start;
- `tests/unit/statisticsWrites.test.ts` (3) — Cold Test/lesson write failure handling;
- `tests/unit/learning.test.ts` — v3/v4 schema assertions.

## Production smoke

`npm run smoke:persistence-integrity` (production preview, isolated Chrome profile, synthetic
profile, frozen `Date.now` for a synthetic shared timestamp):

1. two reviews share one timestamp → both persist with **different** `reviewEventId`s;
2. injected first persistence failure → scheduler does **not** advance; banner + retry UI visible;
3. retry → same `reviewEventId`, exactly one event/card transition, scheduler resumes;
4. reload → two events, distinct ids, card transitions consistent.

Evidence: `acceptance/fsrs-persistence-integrity/screenshots/01-persistence-retry-banner.png`,
`02-after-retry-advance.png`, machine-readable
`acceptance/fsrs-persistence-integrity/persistence-evidence.json`; plus
`acceptance/fsrs-persistence-integrity/evidence.json` (migration counts, latency exclusion proof,
parity summary) generated by `npm run evidence:fsrs-persistence`.

## Regression

```
npm run typecheck                     # 0 errors
npm run check:svelte                  # 0 errors, 0 warnings
npm test                              # 577/577 across 35 files
npm run build                         # PASS (PWA generated)
npm run verify                        # PASS
npm run smoke:scheduler-integrity     # PASS
npm run smoke:m3i                     # PASS
npm run smoke:m3j                     # PASS
npm run smoke:m3k                     # PASS
npm run smoke:cold-test               # PASS
npm run smoke:persistence-integrity   # PASS (2 screenshots, 0 runtime/console errors)
npm run evidence:fsrs-persistence     # machine-readable evidence regenerated
```

Schema notes for test infrastructure: all smoke scripts that seeded the legacy `reviewLogs` store
were updated to `reviewLogEvents` (test-only files; no product behavior involved).

> Environment note: this machine intermittently cold-starts the production preview slower than the
> smoke readiness windows; a one-time manual preview warm-up makes all smokes pass unchanged. No
> product code is involved.

## Docs sync

`README.md`, `Piano_Key_Trainer_Roadmap.md` and `Piano_Key_Trainer_Developer_Handoff.md` now state:
11/11 learner stages complete, M3K accepted (Physical MIDI PASS), Cold Test Progression + Display
accepted, next product work = stabilization before M3L, and the current FSRS/persistence layer
(schema v4, `reviewEventId`, latency provenance, recoverable retry). Historical milestone and
stabilization reports were not edited.

## Known limitations

- Physical MIDI was not re-tested in this checkpoint; the input layer is unchanged and its M3K
  acceptance stands.
- Canonical fuzzing is intentionally disabled; parity comparisons run with fuzzing off.
- `legacy_unknown` latency rows are excluded from P30/P85 by policy, so adaptive Hard/Easy bands
  resume only after 8 new measured samples per skill (safe default `Good` meanwhile).
- The documented Hard-on-step deviation (app single relearning step) is intentional; a full
  learning-steps scheduler is out of scope.
- `card.stats`/NaN guards (audit P2-FSRS-7/8) remain deferred to their own checkpoints.
- The persistence smoke freezes `Date.now` to manufacture the same-ms case; production timestamps
  remain real.

## Clean extraction

From a completely fresh directory containing only the ZIP contents:

```bash
npm ci
npm run verify
npm run smoke:scheduler-integrity
npm run smoke:cold-test
npm run smoke:persistence-integrity
```

Result: **PASS** on 2026-10-07 from
`C:\Users\pavel\AppData\Local\Temp\opencode\fsrs-persistence-integrity` (191 files; `.github/workflows/verify.yml`
present): `npm ci` clean, `verify` 577/577, and `smoke:scheduler-integrity`, `smoke:cold-test`,
`smoke:persistence-integrity`, `smoke:m3i`, `smoke:m3j`, `smoke:m3k` all green.
