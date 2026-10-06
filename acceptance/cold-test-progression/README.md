# Cold Test Progression Fix — acceptance evidence

Acceptance ID: `cold-test-progression`.
Status: pending user acceptance.
Scope: every Cold Test task family advances the 20-item queue exactly once after its terminal
outcome, with consistent counters and a working «Следующее →»; the reported item 8/20 `triadBuild`
F# major case is covered end-to-end.

## Evidence

Screenshots (produced by `npm run smoke:cold-test` against a production preview with an isolated
Chrome profile, synthetic profile with eight seed families, screen input, and
`autoAdvanceDelaySeconds = 0` so only the manual next button is used):

1. `01-cold-test-specialized-item.png` — Cold Test item 8/20: `triadBuild` F# major at the canonical
   `F#3` root, header and task label both 8/20 («выполнено 7 из 20»).
2. `02-correct-specialized-feedback.png` — correct F#3 + A#3 + C#4 submission: «Верно! F#3 мажор.»,
   both counters advanced to 9/20, detail «выполнено 8 из 20».
3. `03-next-cold-test-item.png` — after «Следующее →» item 9/20 with a different question.

The same smoke verifies:

- for all 20 items: the session header and the task label agree (`Cold Test · N/20`) and the next
  button only exists after completion;
- items 1–20 complete exactly once each (no duplicate claim, no skipped item, no overflow);
- completing item 20 opens the session-complete stage and persists `coldTests` with `n = 20`;
- the durable trace (`window.__coldTrace`) reports `itemIndex 7 → nextIndex 8, claimed` for item 8;
- 0 runtime exceptions and 0 console errors.

Related gates: `npm run verify` (tsc 0, svelte-check 0/0, 536 tests / 30 files, production build)
and `smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j`, `smoke:m3k` are green.

Details: `COLD_TEST_PROGRESSION_FIX_REPORT.md`.
