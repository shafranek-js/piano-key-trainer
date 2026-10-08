# Daily Practice & Diagnostics Hardening — Stabilization Checkpoint C Report

**Scope:** stabilization-only alignment of Daily Practice, Diagnostics and the small storage
tail with the existing 11/11 learner roadmap and the accepted Checkpoint B persistence model.
No new curriculum milestone. Continues from the accepted
`piano-key-trainer-fsrs-persistence-integrity-rev2` (`c494c65`).

---

## Baseline

- Start point: `c494c65` (`fix(fsrs-persistence-rev2): …`), branch
  `stabilization/m3k-audit-remediation`. Node v24.14.0, npm 11.9.0.
- Baseline gate: `npm run verify` green — **586 tests / 36 files**; all six production smokes
  (scheduler-integrity, M3I, M3J, M3K, cold-test, persistence-integrity) green.
- All accepted behaviors (M3K timing policy ±140/±300 ms, Cold Test composition, one-attempt
  policy, FSRS parity, persistence identity/retry) remain the regression boundary.

## Canonical skill registry

- New `src/core/fsrs/skills.ts` is the single source of truth for all **19** FSRS skill families
  with `displayName` and `group` metadata: `FSRS_SKILLS`, `SKILL_REGISTRY`, `SKILL_NAMES`
  (moved out of `constants.ts`, which re-exports), `FSRS_SKILL_SET`, `isFsrsSkill`,
  `skillDisplayName`.
- Converged users: diagnostics validation (`diagnosticChecks.KNOWN_SKILLS`), backup/legacy
  validation (`backup.ts`), Cold Test queue families (`COLD_TEST_SKILLS = FSRS_SKILLS`), and UI
  skill names. Scheduler `bySkill` maps stay exhaustive by the `Record<Skill, …>` type.
- Diagnostic `displayName` uses the canonical registry.
- Backlog fix from Checkpoint B Rev2 was **not** needed for data loss; the duplicate-identity
  runtime `persistReviewEventAtomically` check remains id-based as designed.

**Registry completeness test** (`tests/unit/skillRegistry.test.ts`, 5 tests):

- exactly one registration per skill with non-empty display metadata and a valid group;
- Cold Test families are the registry, and a 19-family queue yields 19 valid ids;
- every registered skill produces no `unknownSkillIds` warning in diagnostics;
- a source scan over all `src/**/*.{ts,svelte}` proves **every literal `skill: '…'` /
  `skillType: '…'` in the codebase is registered** (future curriculum cannot silently create an
  unknown skill);
- every collectable curriculum producer (`harmonyCardNotes`, `CANONICAL_INVERSION_PRACTICE_ITEMS`,
  `TRIAD_TRANSFER_CYCLE`, `TRANSFER_CYCLE`, `chordRhythmCardNotes`) only emits registered skills.

## Diagnostics schema

- `DIAGNOSTICS_SCHEMA_VERSION` bumped **2 → 3**; exporter, validator and tests updated together.
- `DiagnosticMeta` now separates unambiguously:
  - `appVersion`, `buildVersion`;
  - `diagnosticsSchemaVersion` (JSON export shape);
  - `backupSchemaVersion` (canonical `BACKUP_SCHEMA_VERSION`, owned in `src/core/version.ts`);
  - `storageSchemaVersion` (**actual IndexedDB schema**, `DB_SCHEMA_VERSION` / `db.verno`).
- The old ambiguous `meta.schemaVersion` and fallback `storageVersion: 2` are gone; metadata is
  taken from the canonical database definition through the UI boundary.
- New semantic section `persistence`: store = `reviewLogEvents`, identity field =
  `reviewEventId`, storage schema version, total/generated/legacy-backfilled event counts, latency
  provenance counts (`measured` / `not_measured` / `legacy_unknown`), failed review commits,
  statistics write failures and the bounded recent commit diagnostics.
- Diagnostics no longer describes ReviewLog by `ts` identity.
- Markdown summary updated (roadmap + schema versions + persistence section).

## Roadmap diagnostics

- New `roadmap` section built from the **same canonical model as the Program UI**
  (`buildLearningRoadmap` over the real persisted phases and resolved advanced-module states):
  11 stages, completed count, current stage, per-stage status/label/summary.
- A completed profile reports `core: 6/6` and all advanced stages completed **from stored
  progress only** — status is never fabricated from the app version.
- `tests/unit/diagnosticsConsistency.test.ts` asserts exact stage ids and 11/11 completion.

## M3K diagnostics

- `curriculum.advancedModules.chordRhythm` added for Milestone 3K:
  `status`, `available`, active step, assessment phase/block, `trialsCompleted`, `accuracy` from
  the persisted `ChordRhythmModuleSnapshot`, plus the module's relevant FSRS cards
  (`chordPulse:*`, `chordChangeTiming:*`, `chordRhythmPattern:*`) with lifecycle classification
  and Daily Practice eligibility.
- DiagnosticsView renders the M3K row (assessment, accuracy, FSRS card states).
- Status/availability comparisons now cover all six advanced modules including M3K.

## Daily Practice coverage

- New deterministic fixture `tests/fixtures/dailyPracticeProfile.ts`: all 11 learner stages
  completed with realistic contexts (regions/identify evidence), every FSRS family present and
  due, advanced families most overdue so selection is deterministic without touching production
  scheduler policy.
- The smoke was built on the fixture and uncovered and fixed a **real product defect**:
  `ChordRhythmStage.svelte` wrapped the interactive stage (target chord, beat indicator, PLAY NOW
  label, key selection, «Сыграть аккорд», actions) inside the module-only branch, so Daily
  Practice rhythm tasks rendered no input UI. The common stage now renders for `dailySkill` too,
  with result/module-complete steps still excluded (`showInteractiveStage`).
- A second latent issue was fixed in the smoke hook so the chart target mirrors the UI for
  non-change daily rhythm tasks.

## Daily Practice long-run smoke

`npm run smoke:daily-practice` (production preview, isolated Chrome profile):

- **Phase A — advanced coverage:** seeds only the six advanced families as due; completes
  `harmonyFunctionIdentify`, `harmonyNextChord`, `harmonyProgressionPlay`, `chordPulse`,
  `chordChangeTiming`, `chordRhythmPattern` (screen piano, canonical accepted timing).
- **Phase B — long run:** reseeds the full profile (keeping persisted review logs) and runs until
  **70 completed tasks across 17 skills / 2 sessions** (requirement: ≥ 40 tasks or 2 sessions —
  variant used: both) covering every major family group: key/note, notation, sound, interval,
  triad, inversion/chord symbol, harmony, rhythm.
- Asserts: no duplicate activation of the same `questionInstanceId`; ≤ 1 ReviewLog per task; no
  duplicate `reviewEventId`; scheduler advances only after successful persistence (activation
  wait is gated on the commit); no dead ends or impossible input states.
- Session timing semantics unchanged: rhythm tasks are submitted inside the accepted ±300 ms
  window with the ±140 ms precision band untouched.

## One-grade regression

Inside the mixed run, a scheduled `find` task is answered **wrong first**, then corrected:

```
wrong first attempt  → exactly 1 ReviewLog, card reps +1
corrective success   → 0 extra ReviewLogs, 0 extra FSRS mutations (reps unchanged)
```

Evidence: `evidence.oneGradeInvariant = { reviewLogsAfterWrong: 1, reviewLogsAfterCorrective: 0,
fsrsRepsDelta: 1 }`. The canonical policy is verified identically for core and advanced families
by the same central handlers.

## SessionStrip responsive fix

- Canonical priority enforced: session **title** first, then progress, then secondary metadata.
- The title wraps instead of ellipsizing (`white-space: normal`, `overflow-wrap: anywhere`,
  no text-overflow clipping); the full label stays available via the `title` attribute.
- The practice grid row grows with the strip (`grid-template-rows: auto …`) instead of the former
  fixed 48/54 px clipping; secondary metadata may wrap or hide at compact heights, the title never
  does.
- Production smoke asserts at **1440 and 1024**: `scrollWidth <= clientWidth + 1` (no clipping),
  no trailing ellipsis, and stable title text; screenshots `01-session-strip-1440.png`,
  `02-session-strip-1024.png` (1280 uses the same wrap/relayout rules).
- No TopNav or global visual redesign.

## card.stats normalization

- New canonical guard `src/core/fsrs/cardState.ts` (`ensureCardStats`, `EMPTY_CARD_STATS`):
  creates missing `stats` and repairs non-finite/negative/fractional counters in place.
- Used at the previously unguarded call sites (`curriculum.curriculumCardReady`,
  `queue.choosePractice`, `reviewLog.ensureCardStats` moved to the canonical helper), so a
  legacy/imported card without `stats` cannot throw, break the queue or curriculum evaluation.
- All DB/backup loads already pass `normalizeBackupCard` (which shares the zero-default shape).

## NaN / Infinity normalization

- Untrusted/legacy numerics are finite-checked before clamp/comparison/date conversion:
  `dueAt`, `lastReviewAt`, `firstSeenAt`, `reps`, `lapses`, `stability`, `difficulty`,
  `scheduledDays`, `elapsedDays`, `responseMs`, and numeric settings.
- Settings load in `App.loadData()` now runs through `normalizeBackupSettings` for both IndexedDB
  and localStorage patches (finite check + range clamp), closing the `clamp(NaN)=NaN` path.
- Diagnostics guards every exported numeric (`due`, `stability`, `difficulty`, `responseTimeMs`)
  and asserts no `NaN`/`Infinity` tokens in the JSON.
- **Canonical invalid-date behavior:** an invalid/missing `dueAt` normalizes to `0`, which in this
  domain means **unscheduled/new** — every due/overdue predicate requires `dueAt > 0`, so an
  invalid date can never be misread as "overdue". No valid historical value is rewritten.

## Tests

**604 tests / 39 files passing** (baseline 586/36; +18 tests, +3 files). No existing test was
weakened.

- `tests/unit/skillRegistry.test.ts` (5) — registry completeness incl. source scan and producers;
- `tests/unit/legacyDataSafety.test.ts` (7) — missing `stats`, NaN/Infinity fields, garbage
  settings, diagnostics JSON safety, valid-history preservation;
- `tests/unit/diagnosticsConsistency.test.ts` (6) — complete profile: no false warnings, 11/11
  roadmap, M3K snapshot, real storage schema, persistence/latency counts, JSON safety;
- `tests/unit/diagnosticsExport.test.ts` — updated to schema v3 + new meta/sections.

## Production smoke

- `smoke:daily-practice` — PASS: 70 tasks, 17 skills, all six advanced families, one-grade
  invariant, no duplicates, clean diagnostics snapshot; 3 screenshots.
- Machine-readable evidence `acceptance/checkpoint-c/evidence.json`: task/skill counts, max streak
  (2 skills / 1 card), review log count and duplicates (0), unique question instances, one-grade
  proof, advanced families covered, `diagnosticsSchemaVersion = 3`, `storageVersion = 4`,
  `knownSkillsCount = 19`, `unknownSkills = []`, `roadmapStages = 11`, `completedStages = 11`,
  latency provenance (40 measured), `invalidNumericCount = 0`, diagnostics
  `totalSessions = 2` with populated tasks/diversity.
- Scheduler-integrity smoke output (`diagnostics-after-scheduler-fix.json`) is regenerated by its
  own run; the smoke's diagnostics-schema assertion was updated to v3 (test infrastructure only).

## Regression

```
npm run typecheck                     # 0 errors
npm run check:svelte                  # 0 errors, 0 warnings
npm test                              # 604/604 across 39 files
npm run build                         # PASS (PWA generated)
npm run verify                        # PASS
npm run smoke:scheduler-integrity     # PASS
npm run smoke:m3i                     # PASS
npm run smoke:m3j                     # PASS
npm run smoke:m3k                     # PASS
npm run smoke:cold-test               # PASS
npm run smoke:persistence-integrity   # PASS
npm run smoke:daily-practice          # PASS (3 screenshots, 0 runtime/console errors)
```

## Clean extraction

From a completely fresh directory containing only the ZIP contents:

```bash
npm ci
npm run verify
npm run smoke:persistence-integrity
npm run smoke:daily-practice
```

Result: **PASS** on 2026-10-08 from
`C:\Users\pavel\AppData\Local\Temp\opencode\daily-diagnostics-hardening` (205 files;
`.github/workflows/verify.yml` present): `npm ci` clean, `verify` 604/604, and
`smoke:persistence-integrity`, `smoke:daily-practice`, `smoke:scheduler-integrity`,
`smoke:cold-test` all green (all ZIP smoke scripts are runnable without repository-external files).

## Known limitations

- At the 1440 compact practice layout the secondary strip detail (`выполнено X из Y`) may be
  hidden by the compact grid; the primary session title is always fully readable and the detail
  remains in the SessionSummary/diagnostics.
- The long-run smoke uses a deterministic synthetic fixture; production scheduler policy is
  untouched, and family frequency is not treated as a KPI (only pathological repetition is
  guarded by the existing diversity checks).
- Physical MIDI was not re-tested in this checkpoint; the input layer is unchanged and its M3K
  acceptance stands.
- Diagnostic checks intentionally keep real warnings (e.g. curriculum normalization notes) when the
  profile truly contains them; the clean synthetic profile asserts an empty warning set.
