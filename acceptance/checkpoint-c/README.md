# Daily Practice & Diagnostics Hardening (Checkpoint C) — acceptance evidence

Acceptance ID: `checkpoint-c`.
Status: pending independent acceptance.
Scope: canonical skill registry, diagnostics schema v3 (real storage version, 11-stage roadmap,
M3K snapshot, persistence/latency provenance), heterogeneous deterministic Daily Practice smoke
with the one-grade invariant, SessionStrip title priority, and `card.stats` / NaN normalization.
No new curriculum milestone.

## Evidence

Machine-readable `evidence.json` (written by `npm run smoke:daily-practice`):

- `dailyPracticeTaskCount: 70` (2 sessions: advanced-coverage phase + long run; ≥ 40 required),
  `uniqueSkills: 17`, `uniqueQuestionInstances: 40+`, `duplicateReviewCount: 0`;
- `advancedFamiliesCovered`: all six Harmony/M3K families;
- `oneGradeInvariant`: wrong first attempt = 1 ReviewLog, corrective = 0 extra logs / 0 extra FSRS
  mutations;
- `diagnosticsSchemaVersion: 3`, `storageVersion: 4`, `knownSkillsCount: 19`,
  `unknownSkills: []`, `roadmapStages: 11`, `completedStages: 11`, `invalidNumericCount: 0`,
  latency provenance `measured: 40`, diagnostics `totalSessions: 2`.

Screenshots (production preview, isolated Chrome profile):

1. `01-session-strip-1440.png` — full session title at 1440 (no ellipsis/clipping).
2. `02-session-strip-1024.png` — full session title at 1024 with relocated progress.
3. `03-diagnostics-clean.png` — Diagnostics page after the run: 11/11 roadmap, M3K module,
   IndexedDB schema v4, `reviewLogEvents`/`reviewEventId`, zero unknown skills.

Related gates: `npm run verify` (tsc 0, svelte-check 0/0, 604 tests / 39 files, production build)
and `smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j`, `smoke:m3k`, `smoke:cold-test`,
`smoke:persistence-integrity` are green.

Details: `DAILY_DIAGNOSTICS_HARDENING_REPORT.md`.
