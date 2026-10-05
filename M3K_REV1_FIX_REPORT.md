# M3K Rev1 Acceptance Fix — Report

**Scope:** two acceptance blockers from the Rev1 review (A: PLAY NOW cue synchronization, B: accepted
early/late styling) plus blocker C from the same review round (twoStrikes two distinct MIDI attacks).
Continues from `piano-key-trainer-milestone3k-rev1`; beginner windows, MIDI start gesture, C → G/B
semantics and assessment policy are unchanged.

**Physical MIDI tested: NO — Fake Web MIDI tested: YES.**

---

## Baseline

- Candidate: `piano-key-trainer-milestone3k-rev1` (163 files, 498 tests, all gates/smokes green at
  packaging).
- Review findings reproduced in source:
  - **A (P0):** after the count-in, `armed` was shown immediately while the real ±300 ms acceptance
    window opened ~675 ms later — «ИГРАЙТЕ СЕЙЧАС» could appear ~975 ms before target onset.
  - **B (P1):** the timing result was styled `bad` for every band except `on_time`, so accepted
    «Немного поздно — засчитано» rendered red.
  - **C (P0):** `twoStrikes` copy said «держите один аккорд» while `MidiChordTracker` locks after the
    first 3-note chord and re-arms only after full release — holding literally cannot produce the
    second attack; the UI gave no release/re-strike guidance.

## Fix A — PLAY NOW synchronized with the real acceptance window

- The cue is now rendered **only** while `timingWindowOpen === true`
  (`data-play-now="visible"` ⇔ `data-timing-window="open"`).
- Between the count-in and the window the label is «Приготовьтесь…»; `ИГРАЙТЕ СЕЙЧАС` appears exactly
  at `target − 300 ms`.
- Canonical target timestamp is unchanged. New deterministic predicate
  `isWithinRhythmAcceptanceWindow(onset, at)` (inclusive ±300 ms) is the single boundary used by the
  classifier, the cue and the smoke; unit tests cover −301/−300/0/+300/+301.
- Diagnostics publish `window.__m3kTimingTarget = { onset, windowStart, windowEnd }` at grading-arm time
  and `window.__m3kTimingWindowOpenAt` at the actual window opening, so the smoke can assert the
  synchronization numerically.

## Fix B — accepted early/late no longer look like failures

- Timing styling is driven by `timingAccepted`, not by the band name:
  `on_time/early/late` + accepted → green (`good`); `too_early/missed` → red (`bad`).
- `data-timing-accepted="accepted|failed"` is exposed on the timing result for UI assertions.
- No text containing «— засчитано» can render with failure styling; screenshots 02/03 were regenerated
  with the corrected styling.

## Fix C — twoStrikes teaches and detects two distinct attacks

- Copy (MIDI): «Сыграйте аккорд C два раза: на доле 1 и ещё раз на доле 3. После первого удара
  отпустите клавиши и снова нажмите аккорд на доле 3.» Screen-piano copy asks to re-select the three
  keys and press «Сыграть аккорд» again.
- Explicit strike progress (`data-testid="rhythm-strike-progress"`): «Удар 1 из 2 · доля 1» →
  «Удар 2 из 2 · доля 3» → «✓ Удары 2 из 2».
- After strike 1 the note label shows «✓ Первый удар · Следующий удар: доля 3»; the second window
  shows «Удар 2 из 2 · ИГРАЙТЕ СЕЙЧАС».
- While any chord key is held after strike 1, the tracker remains locked; the UI then shows
  «Отпустите клавиши перед вторым ударом» (`data-release-required="true"`) and suppresses
  «ИГРАЙТЕ СЕЙЧАС» — no silent input lock. The prompt clears on full release and the tracker re-arms.
- Reducer feedback for the first accepted strike is explicit («✓ Первый удар…»); the completed
  exercise reports «✓ Оба удара приняты · <точность>».
- The whole pattern stays one question: one `questionInstanceId`, two required attacks, no new
  count-in, no intermediate ReviewLog/FSRS mutation; success requires chord+timing accepted on both
  strikes.

## Tests

**506 tests / 29 files passing** (+8 vs Rev1's 498; no existing semantics changed).

- `tests/unit/rhythmChordSemantics.test.ts`:
  - acceptance-window predicate boundaries (−301/−300/0/+300/+301) and their exact match with
    `classifyRhythmTiming(...).timingAccepted`;
  - twoStrikes: strike 1 accepted → waits for release + second strike; same chord on strike 2 →
    success; accepted-late second strike → success; +301 ms second strike → failure; wrong chord on
    strike 2 → chord failure.
- `tests/unit/midiChordTracker.test.ts` (new): tracker locks after three held notes, ignores extra
  held notes, stays locked on partial release, re-arms only after full release, and evaluates the same
  chord again after re-arm (the physical two-attack flow at the input layer).

## Production Smoke

`npm run smoke:m3k` additions:

- **Cue synchronization:** after the count-in the cue is hidden while `data-timing-window="closed"`;
  an immediate chord there is `too_early` and the cue never appears; at the boundary the cue becomes
  visible exactly with `timingWindowOpen` and `__m3kTimingWindowOpenAt` matches `onset − 300 ms`
  (tolerance 80 ms); a chord at the open boundary is `on_time`/accepted.
- **Styling:** −250 ms and +250 ms assert `data-timing-accepted="accepted"` with no `bad` class;
  +350 ms asserts `failed` with `bad`.
- **twoStrikes physical flow:** gesture start → release → count-in; beat 1 C4–E4–G4 note-on → strike 1,
  full note-off; beat 3 C4–E4–G4 note-on → strike 2; asserts exactly two evaluations, one
  `questionInstanceId`, «Оба удара приняты», and 0 ReviewLogs.
- **Held-chord recovery:** holding after strike 1 shows the release prompt and hides PLAY NOW; full
  release clears the flag and the run recovers.
- Preserved: gesture starts (single/non-C/chord), 10× race loop, mouse-free C → G/B, corrective
  reload, exclusivity, remediation/retry exits, completion, 0 runtime/console errors.
- Screenshots (3, regenerated): `01-midi-start-ready.png`, `02-accepted-early.png`,
  `03-accepted-late.png`.

## Physical MIDI Status

```text
Physical MIDI tested: NO
Fake Web MIDI tested: YES
```

The tracker lifecycle (lock → partial release stays locked → full release re-arms → second evaluation)
is now covered by unit tests and the fake-MIDI smoke; a real controller test remains for the user.

## Verification

```
npm run typecheck                     # 0 errors
npm run check:svelte                  # 0 errors, 0 warnings
npm test                              # 506/506 across 29 files
npm run build                         # PASS (PWA generated)
npm run verify                        # PASS
npm run smoke:scheduler-integrity     # PASS
npm run smoke:m3i                     # PASS
npm run smoke:m3j                     # PASS
npm run smoke:m3k                     # PASS (3 screenshots, 0 runtime/console errors)
npm run package:m3k-rev1-fix          # deterministic ZIP + infrastructure self-check
```

## Clean Extraction

From a completely fresh directory containing only the ZIP contents:

```bash
npm ci
npm run verify
npm run smoke:scheduler-integrity
npm run smoke:m3j
npm run smoke:m3k
```

Result: **PASS** on 2026-10-05 from
`C:\Users\pavel\AppData\Local\Temp\opencode\m3k-rev1-fix`. The archive continues to include
`.github/workflows/verify.yml`, `.gitignore`, `package.json`, `package-lock.json` and non-empty
`src/`, `tests/`, `scripts/` trees (explicit builder self-check).

## Known Limitations

- Physical MIDI remains untested by the developer; final feel with a real controller is pending user
  acceptance. M3K is not marked finally accepted by this fix.
- The beginner timing policy stays fixed (±140/±300 ms); no adaptive difficulty.
- If the learner holds the chord through the entire second window, the exercise correctly fails on
  timing while the UI keeps asking for the release; the release prompt is guidance, not an input
  channel.
