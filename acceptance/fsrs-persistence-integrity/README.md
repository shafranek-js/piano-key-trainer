# FSRS & Persistence Integrity (Checkpoint B) — acceptance evidence

Acceptance ID: `fsrs-persistence-integrity`.
Status: pending independent acceptance.
Scope: canonical FSRS-6 parity, latency provenance, stable ReviewLog identity with safe schema
migration, recoverable persistence retry, atomic legacy migrator. No new curriculum milestone.

## Evidence

Screenshots (produced by `npm run smoke:persistence-integrity` against a production preview with an
isolated Chrome profile, a synthetic profile, and a frozen clock for a shared synthetic timestamp):

1. `01-persistence-retry-banner.png` — injected first persistence failure: the scheduler stays on
   the answered question and shows «Не удалось сохранить ответ… Повторить сохранение».
2. `02-after-retry-advance.png` — after retry the banner is gone and the scheduler advanced to the
   next question.

Machine-readable evidence:

- `persistence-evidence.json` — same-millisecond review proof (2 events, 1 timestamp, 2 distinct
  `reviewEventId`s), failure → retry proof (same id reused, retryCount 1, scheduler blocked then
  resumed), reload consistency proof.
- `evidence.json` (`npm run evidence:fsrs-persistence`) — legacy DB before/after migration counts
  (7 → 7, timestamps/content preserved, ids backfilled, old table retired), latency exclusion proof
  (P30/P85 unchanged after 1000 synthetic 800/1200 events; untimed correct answer → Good),
  FSRS parity summary (pinned `py-fsrs` 6.3.2, vector/sequence counts, max deviation ≈ 1e-14).

Related gates: `npm run verify` (tsc 0, svelte-check 0/0, 577 tests / 35 files, production build)
and `smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j`, `smoke:m3k`, `smoke:cold-test` are green.

Details: `FSRS_PERSISTENCE_INTEGRITY_REPORT.md`.
