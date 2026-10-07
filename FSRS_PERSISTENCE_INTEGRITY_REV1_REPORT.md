# FSRS & Persistence Integrity — Rev1 Report (P0 backup identity preservation)

**Scope:** targeted fix for the single data-integrity blocker found in independent review of
`piano-key-trainer-fsrs-persistence-integrity.zip`: `normalizeBackupReviewLog()` unconditionally
replaced the identity with `backfillReviewEventId(ts)`, collapsing two legitimate same-millisecond
reviews into one primary key during backup import. Everything else from the Checkpoint B
(FSRS parity, latency provenance, schema v3→v4 migration, atomic persistence retry, migrator
safety) is preserved unchanged.

---

## Confirmed defect

```text
export:  event A (ts = T, reviewEventId = uuid-A)  → keeps uuid-A
         event B (ts = T, reviewEventId = uuid-B)  → keeps uuid-B

import:  both → legacy-T  → bulkPut(reviewLogEvents) overwrites one → 1 event survives
```

The report claimed identity backfill applied only to records *without* identity; the source applied
it to every record. Same-ms identity was covered for runtime persistence and old-DB migration but
not for the backup round-trip.

## Fix — validated identity preservation

`src/storage/backup.ts`:

- `isValidReviewEventId(value)` — untrusted-input contract: `string`, trimmed non-empty,
  ≤ 128 characters, `^[A-Za-z0-9][A-Za-z0-9._:#-]*$`.
- `resolveBackupReviewEventId(rawValue, ts)` — valid existing id → **preserved exactly** (trimmed);
  missing/malformed → deterministic `legacy-<ts>` fallback.
- Malformed ids are counted and surfaced as a bounded warning
  («Некорректные reviewEventId заменены детерминированными: N.») instead of being silently
  rewritten.
- Duplicate explicit ids inside one backup are never a silent overwrite:
  - exact duplicate records (same identity + same `ts`/`sessionId`/`cardId`) are skipped with a
    warning;
  - the same identity with different content is deterministically disambiguated
    (`<id>-dup2`, `<id>-dup3`, …) so every event survives, with a warning.

## Round-trip contract (required semantics)

```text
valid existing reviewEventId
→ preserve exactly

missing / malformed reviewEventId
→ deterministic legacy fallback (documented, warned)

duplicate explicit reviewEventId in one backup
→ no silent overwrite: exact duplicates skipped, conflicting content disambiguated
```

## Tests

`tests/unit/backupReviewIdentity.test.ts` (6 new tests):

- identity validator accept/reject matrix (empty, whitespace, spaces, hostile characters, > 128);
- malformed id → deterministic fallback + bounded warning;
- duplicate explicit id with different content → both survive, second id `dup-id-dup2`, warning;
- exact duplicate record → deduplicated with warning;
- **required round-trip**: two logs, same `ts`, different ids → `validateAndNormalizeBackup` →
  `applyBackupAtomically` → reload → **2 events, same original timestamp, 2 original
  `reviewEventId`s**, and identities stay stable across a further reopen;
- legacy records without identity through the full import → deterministic
  `legacy-1000` / `legacy-1000-dup2` fallback.

Full suite: **583 tests / 36 files passing** (577 + 6).

## Machine-readable evidence

`acceptance/fsrs-persistence-integrity/evidence.json` now includes:

```json
"backupRoundTripSameMs": {
  "before": 2,
  "after": 2,
  "beforeTimestamp": 1800000000000,
  "afterTimestamps": [1800000000000, 1800000000000],
  "beforeReviewEventIds": ["evidence-uuid-A", "evidence-uuid-B"],
  "afterReviewEventIds": ["evidence-uuid-A", "evidence-uuid-B"],
  "identitiesPreserved": true,
  "warnings": []
}
```

The acceptance README documents the round-trip proof in addition to the existing same-ms/failure
retry evidence.

## Verification

```
npm run typecheck                     # 0 errors
npm run check:svelte                  # 0 errors, 0 warnings
npm test                              # 583/583 across 36 files
npm run build                         # PASS
npm run verify                        # PASS
npm run evidence:fsrs-persistence     # regenerated with backupRoundTripSameMs
npm run smoke:scheduler-integrity     # PASS
npm run smoke:m3i                     # PASS
npm run smoke:m3j                     # PASS
npm run smoke:m3k                     # PASS
npm run smoke:cold-test               # PASS
npm run smoke:persistence-integrity   # PASS
npm run package:fsrs-persistence-integrity-rev1  # deterministic ZIP + self-check
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
`C:\Users\pavel\AppData\Local\Temp\opencode\fsrs-persistence-integrity-rev1` (file count printed by
the packaging script; `.github/workflows/verify.yml` present).

## Delivery

- `piano-key-trainer-fsrs-persistence-integrity-rev1.zip`
- `FSRS_PERSISTENCE_INTEGRITY_REV1_REPORT.md` (this file)

## Known limitations

- The pre-existing Checkpoint B limitations stand (canonical fuzzing disabled by policy,
  `legacy_unknown` latency excluded until 8 measured samples, documented Hard-on-step deviation,
  physical MIDI not re-tested here).
- A malformed explicit id is replaced by the deterministic fallback rather than failing the whole
  import; this is the documented policy and is surfaced as a warning.
