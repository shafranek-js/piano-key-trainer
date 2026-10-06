# Cold Test Displayed Item Integrity Fix — acceptance evidence

Acceptance ID: `cold-test-display-fix`.
Status: pending user acceptance.
Scope: the displayed `Cold Test · N/20` number describes the question actually rendered on screen
(and stays there while its feedback is visible); the completion pointer advances independently.
Supersedes the counter behavior documented in `acceptance/cold-test-progression/`.

## Evidence

Screenshots (produced by `npm run smoke:cold-test` against a production preview with an isolated
Chrome profile, synthetic profile with eight seed families, screen input, and verified
`autoAdvanceDelaySeconds = 0` — manual «Следующее →» only):

1. `01-item-8-before-answer.png` — item 8/20 before the answer: `triadBuild` F# major at the
   canonical `F#3` root; header and task label 8/20, `выполнено 7 из 20`.
2. `02-item-8-feedback-still-8-of-20.png` — **critical evidence**: after the correct
   F#3 + A#3 + C#4 submission the feedback «✓ Верно! F#3 мажор.» is visible together with
   `Cold Test · 8/20` in both the header and the task eyebrow, `выполнено 8 из 20`, and
   «Следующее → (Пробел)» (no auto-advance countdown).
3. `03-item-9-after-next.png` — after «Следующее →» a different question (item 9/20) is displayed
   with `выполнено 8 из 20`.

The same smoke verifies:

- every item: activation shows `N/20` with `выполнено N−1 из 20`; completion keeps `N/20` with
  `выполнено N из 20` until the next question is actually activated (items 1, 19 and 20 included,
  never 21/20);
- question identity (`window.__coldActiveQuestionId`) is unchanged while feedback is visible and
  changes only together with the displayed number after «Следующее →»;
- the Cold Test trace records `completedIndex 8 / activeItemIndex 7 / nextIndex 8 / claimed` for
  item 8, making the valid `completed = 8, active = 7` feedback state explicit;
- the full 20/20 run completes exactly once, persists `coldTests` with `n = 20`, 0 runtime
  exceptions, 0 console errors.

Related gates: `npm run verify` (tsc 0, svelte-check 0/0, 544 tests / 30 files, production build)
and `smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j`, `smoke:m3k` are green.

Details: `COLD_TEST_DISPLAY_FIX_REPORT.md`.
