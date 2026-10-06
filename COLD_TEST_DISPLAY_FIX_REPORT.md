# Cold Test Displayed Item Integrity Fix — Report

**Scope:** P1 acceptance blocker — the displayed `Cold Test · N/20` number advanced to the next item
as soon as the current item was completed, while the feedback of the old item was still on screen.
This fix makes the displayed number describe the question the user is actually looking at.
**Cold Test queue pointer and displayed active item are now separate concepts.**

Continues from `piano-key-trainer-cold-test-progression-fix`. The central completion contract, queue
composition, idempotency, specialized handlers, one-attempt policy, 20-item limit, `coldTests.n = 20`
and all accepted M3K/scheduler behavior are unchanged.

---

## Confirmed Defect

```text
Cold Test · 8/20
question 8 displayed
↓ user answers
question 8 feedback remains on screen, but header/task eyebrow became Cold Test · 9/20
↓ only after Следующее
question 9 is actually displayed (labels were already one question ahead)
```

Root cause: `coldIndex` served two incompatible roles. `coldItemNumber` was derived from the
completion pointer (`coldIndex + 1`) and `completeColdTestItem()` advanced `coldIndex` immediately on
completion, so the visible number changed during feedback.

## Fix — Explicit Navigation Model

`src/core/learning/coldTest.ts` now exposes a pure navigation state:

```ts
interface ColdTestNavigation {
  completedIndex: number;        // progression pointer / completed count
  activeItemIndex: number | null; // question actually rendered (null before first activation)
}
```

- `activateColdTestItem(navigation, queueLength)` — **the only** transition that changes
  `activeItemIndex`; it is called when `activateTask()` actually renders a Cold Test question;
- `coldTestActiveItemNumber(navigation, queueLength)` — 1-based number of the rendered question
  (0 before the first activation);
- `resolveColdTestItemCompletion(navigation, input)` — completion advances `completedIndex` exactly
  once (idempotent via the existing question-identity contract) and leaves `activeItemIndex`
  untouched.

`src/App.svelte`:

- `coldIndex` remains the completion pointer: it still drives persistence, queue selection
  (`coldQueue[coldIndex]`), the completion check, the progress bar and «выполнено X из 20»;
- new state `activeColdItemIndex` is set in `activateTask()` (kind `cold` only) via
  `activateColdTestItem`; `completeColdTestItem()` never touches it;
- both the SessionStrip header and the TaskStage eyebrow derive from
  `coldTestActiveItemNumber({ completedIndex: coldIndex, activeItemIndex: activeColdItemIndex })`,
  so they always agree and always describe the rendered question;
- diagnostics: `window.__coldActiveQuestionId` exposes the active question identity, and each
  `window.__coldTrace` entry now records
  `completedIndex`, `activeItemIndex`, `activeItemNumber`, `nextIndex`, `claimed`, `reason`,
  `questionInstanceId`, `cardId`, `taskType` — making states such as
  `completedIndex = 8, activeItemIndex = 7` explicitly valid during feedback.

No numbering logic was added to individual handlers; the active item identity belongs to Cold Test
navigation only.

## Required Lifecycle (item 8, verified)

```text
activate item 8      activeColdItemIndex = 7, coldIndex = 7   → Cold Test · 8/20, выполнено 7 из 20
correct answer       coldIndex = 8, activeItemIndex stays 7   → Cold Test · 8/20, выполнено 8 из 20
Следующее / auto     activeColdItemIndex = 8, coldIndex = 8   → Cold Test · 9/20, выполнено 8 из 20
```

- **Manual Next** (`autoAdvanceDelaySeconds = 0`): feedback shows «Следующее → (Пробел)» and the
  labels stay 8/20 until the click; no countdown is armed.
- **Auto-advance** (default 3 s): numbering changes only when the timer fires and `nextRound()`
  actually activates the next question — not when the timeout starts.
- **Wrong answer:** identical numbering lifecycle (one-attempt item completes immediately; labels
  stay on the answered item until activation).
- **Specialized tasks** (`triadBuild`, `triadInversionBuild`, `chordSymbolRead`, `harmony*`,
  `chordRhythm*`): same shared navigation transition; no per-handler numbering.
- **Item 1:** 1/20 with `выполнено 0 из 20` → feedback 1/20 with `выполнено 1 из 20` → next 2/20.
- **Item 19:** 19/20 → feedback 19/20 with `выполнено 19 из 20` → activation 20/20.
- **Item 20:** 20/20 feedback, `выполнено 20 из 20`, then session completion; never 21/20.
- **Question identity invariant:** the displayed number is tied to the same activation event that
  sets `currentCard` / `currentQuestionInstanceId`; it always describes that question instance.

## Tests

**544 tests / 30 files passing** (536 → 544; +8 navigation lifecycle tests).

`tests/unit/coldTestProgression.test.ts` additions:

- activate item 8 → display 8; complete item 8 → `completedIndex = 8`, display stays 8; activate
  next → display 9 (exact required sequence);
- item 1 boundary (1/20 during feedback after completion), item 19 (`19/20 → feedback 19/20 →
  20/20`), item 20 (`20/20`, clamped, `isColdTestComplete`, never 21);
- wrong and correct completions advance the pointer identically; the display never moves;
- five duplicate completion callbacks cannot alter `completedIndex` or `activeItemIndex`;
- repeated activation (manual + auto next race) changes only `activeItemIndex`, never the pointer;
- before the first activation the display is 0, not a pre-advanced item.

Existing P0 coverage (per-family matrix, queue coverage, boundaries, evaluator completion flags)
remains green.

## Production Smoke

`npm run smoke:cold-test` corrections:

- the old wrong expectation (`header === task === 9/20` after item 8 feedback) is deleted;
- each item's activation asserts `header === task === Cold Test · N/20` with
  `выполнено N−1 из 20`; completion asserts the labels stay N/20 with `выполнено N из 20` until the
  next activation;
- item 8 captures `window.__coldActiveQuestionId` before answering and asserts it is unchanged while
  feedback is visible, and changed only after «Следующее →» (prevents cosmetic-only fixes);
- item 8 asserts the correct feedback «Верно! F#3 мажор.», the trace entry
  `completedIndex 8 / activeItemIndex 7 / nextIndex 8 / claimed`, and that no auto-advance countdown
  is armed (`autoAdvanceDelaySeconds = 0`);
- the seed now waits for app hydration and verifies `autoAdvanceDelaySeconds = 0` in both IndexedDB
  and localStorage (with retry), removing a seeding race that could silently re-arm the 3 s
  auto-advance;
- screenshots regenerated (exactly 3, under `acceptance/cold-test-display-fix/screenshots/`):
  - `01-item-8-before-answer.png` — 8/20, `выполнено 7 из 20`, F#3 prompt;
  - `02-item-8-feedback-still-8-of-20.png` — «✓ Верно! F#3 мажор», **8/20**,
    `выполнено 8 из 20`, «Следующее → (Пробел)»;
  - `03-item-9-after-next.png` — new question, 9/20, `выполнено 8 из 20`.

End-to-end run remains 20/20 items, `coldTests` record `n = 20`, no 21st item, 0 runtime exceptions,
0 console errors.

## Verification

```
npm run typecheck                     # 0 errors
npm run check:svelte                  # 0 errors, 0 warnings
npm test                              # 544/544 across 30 files
npm run build                         # PASS (PWA generated)
npm run verify                        # PASS
npm run smoke:scheduler-integrity     # PASS
npm run smoke:m3i                     # PASS
npm run smoke:m3j                     # PASS
npm run smoke:m3k                     # PASS (3 screenshots, 0 runtime/console errors)
npm run smoke:cold-test               # PASS (3 screenshots, 0 runtime/console errors)
npm run package:cold-test-display-fix # deterministic ZIP + infrastructure self-check
```

## Clean Extraction

From a completely fresh directory containing only the ZIP contents:

```bash
npm ci
npm run verify
npm run smoke:scheduler-integrity
npm run smoke:m3j
npm run smoke:m3k
npm run smoke:cold-test
```

Result: **PASS** on 2026-10-06 from
`C:\Users\pavel\AppData\Local\Temp\opencode\cold-test-display-fix` (173 files; `.github/workflows/verify.yml`
present): `npm ci` clean, `verify` 544/544, and `smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j`,
`smoke:m3k`, `smoke:cold-test` all green. (The first `smoke:m3k` attempts hit the known
environmental preview-readiness slowdown under external machine load and passed on retry; no product
code is involved.)

## Deliverables

- `piano-key-trainer-cold-test-display-fix.zip`
- `COLD_TEST_DISPLAY_FIX_REPORT.md` (this file)
- `acceptance/cold-test-display-fix/README.md` + 3 screenshots

## Known Limitations

- Physical MIDI was not re-tested for this display-only change; the Cold Test-specific MIDI behavior
  is inherited from the accepted M3K input layer.
- The smoke seeds eight of the 19 Cold Test families end-to-end; the remaining families share the
  same navigation transition and are covered by the unit matrix.
