# FSRS & Persistence Integrity — Rev2 Report (duplicate identity content comparison)

**Scope:** the last narrow data-integrity defect from independent review of Rev1: the dedupe check
for duplicate explicit `reviewEventId`s compared only `ts` / `sessionId` / `cardId`, so two records
with the same identity and the same timestamp/session/card but **different semantic content**
(e.g. `grade: Good` vs `grade: Again`, or a different `responseMs`/`answer`) were wrongly treated
as exact duplicates and one of them was silently dropped. All Rev1 behavior (identity preservation
and same-millisecond round-trip) is unchanged.

---

## Confirmed defect

```text
reviewEventId = same-id
ts            = same
sessionId     = same
cardId        = same
record A: grade = Good
record B: grade = Again
→ Rev1 code declared B an "exact duplicate" and deleted it
```

The Rev1 report already promised the stronger contract — *same identity with different content →
disambiguate so every event survives* — but the implementation did not compare the full payload.

## Fix — full semantic equivalence

`src/storage/backup.ts`:

- New pure helper `areReviewLogEventsEquivalent(left, right)` compares **every persisted
  `ReviewLogEvent` field**: `reviewEventId`, `ts`, `sessionId`, `cardId`, `note`, `skill`, `kind`,
  `grade`, `gradeName`, `firstCorrect`, `answer`, `answerKeyId`, `attempts`, `completionAttempts`,
  `hintUsed`, `responseMs`, `responseTimingSource`, `elapsedDays`, `retrievabilityBefore`,
  `stabilityBefore`, `stabilityAfter`, `difficultyBefore`, `difficultyAfter`, `scheduledDays`,
  `earlyPractice`, `correctedAt`, `trialMode`, `hintLevel`, `contextId`, `schedulerReason`,
  `gradeableByFsrs`. (The app's `ReviewLogEvent` has no `questionInstanceId` field; question
  identity lives in scheduler diagnostics, so there is nothing else to compare.)
- The validation dedupe pass now uses `areReviewLogEventsEquivalent(existing, log)`:
  - same identity + fully identical normalized payload → skipped with a duplicate warning;
  - same identity + **any** semantic difference → preserved, second id becomes `<id>-dup2`
    (then `-dup3`, …), with a warning.

## Tests

`tests/unit/backupReviewIdentity.test.ts` extended (9 tests total in the file):

- same id + same ts/session/card, `grade` Good vs Again → **2 events**, ids
  `['grade-conflict', 'grade-conflict-dup2']`, warning;
- the same conflict survives the full `validateAndNormalizeBackup` → `applyBackupAtomically` →
  reload path: 2 stored events, distinct ids, grades `[1, 3]`, stable after a second reopen;
- only `responseMs` differs (500 vs 1500) → 2 events, distinct ids, both times preserved;
- only `answer` differs (C vs D) → 2 events, distinct ids, both answers preserved;
- the genuinely identical record test is kept: fully equivalent normalized records → 1 event,
  duplicate warning.

Full suite: **586 tests / 36 files passing** (583 + 3).

## Machine-readable evidence

`acceptance/fsrs-persistence-integrity/evidence.json` now includes:

```json
"duplicateIdentityHandling": {
  "identicalPayload": { "input": 2, "normalized": 1, "deduplicated": true,
    "warning": "Пропущено дубликатов записей истории: 1." },
  "conflictingPayloadSameIdAndTimestamp": {
    "input": 2, "normalized": 2, "ids": ["evidence-dup-id", "evidence-dup-id-dup2"],
    "grades": [3, 1], "preserved": true,
    "warning": "Обнаружены повторяющиеся reviewEventId с разным содержимым: исправлено 1." }
}
```

`backupRoundTripSameMs` (before = 2, after = 2, identitiesPreserved = true) is unchanged and
re-verified.

## Verification

```
npm run verify                        # 586/586 across 36 files, svelte-check 0/0, build PASS
npm run evidence:fsrs-persistence     # regenerated with duplicateIdentityHandling
npm run smoke:scheduler-integrity     # PASS
npm run smoke:cold-test               # PASS
npm run smoke:persistence-integrity   # PASS
npm run smoke:m3i / smoke:m3j / smoke:m3k  # PASS
npm run package:fsrs-persistence-integrity-rev2  # deterministic ZIP + self-check
```

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
`C:\Users\pavel\AppData\Local\Temp\opencode\fsrs-persistence-integrity-rev2`.

## Delivery

- `piano-key-trainer-fsrs-persistence-integrity-rev2.zip`
- `FSRS_PERSISTENCE_INTEGRITY_REV2_REPORT.md` (this file)

## Known limitations

- No change to the pre-existing Checkpoint B limitations (canonical fuzzing disabled by policy,
  `legacy_unknown` latency excluded until 8 measured samples, documented Hard-on-step deviation,
  physical MIDI not re-tested here).
- Malformed or missing identities still fall back to the deterministic `legacy-<ts>` policy with a
  bounded warning; genuine duplicate payloads remain deduplicated by design.
