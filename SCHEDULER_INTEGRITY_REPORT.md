# Daily Practice Scheduler Integrity Checkpoint

Date: 2026-10-04  
Scope: Daily Practice scheduled-review selection, question activation, persistence ordering, and diagnostics. No music features were added.

## Decision

The implementation checkpoint is ready for independent acceptance. One unanswered due card may appear again after a new session starts. The same active question must not be replaced by a second activation inside its session.

## Evidence from the supplied diagnostic export

The source file was `piano-key-trainer-diagnostics-2026-10-04.json`. It reported 66 cards and one due card, `soundToKey:G`. Its scheduler trace contained seven `scheduled_due` selections of that card over roughly 43 minutes. Three selections were 15 ms apart, spanning 30 ms.

The export uses diagnostics schema v1. It has timestamps and scheduler reasons, but no `sessionId`, question instance, or activation identifier on those traces. The export therefore cannot establish whether each of the seven selections followed an unanswered restart or whether the 30 ms group replaced one active question. It does establish that the tight group did not have a corresponding review transition between selections. The old trace is preserved as evidence; it is not rewritten.

The supplied export also contains nine historical `duplicateReviewBurst` findings and 20 `staleSessionHandlerSuspected` findings from the existing review-log checks. Those saved-history findings remain unchanged and separate from the new in-session scheduler warnings.

## Root cause

`nextRound()` cleared the active task unconditionally. The Settings callback had separate conditions that could each call `nextRound()` for one patch, and separate settings changes could call it again immediately afterward. With the `due` preset, the selector intentionally preserves due priority even when the sole due card is the most recent card. Each call could therefore replace the unanswered question with another activation of `soundToKey:G`.

The prior implementation did not have an active-question guard or an activation trace with session/question identifiers. This combination explains how multiple due selections could be recorded within milliseconds. The schema v1 export cannot prove that this was the only cause of the historical trio; the production smoke below exercises the same rapid-settings path against the fixed build.

## Changes

- Consolidated settings handling so a settings patch requests at most one task refresh.
- Added a `nextRound()` guard for an incomplete question in the same session and activity. It records suppressed refresh requests and leaves the active question intact.
- Kept unanswered-session behavior intact: starting a new session clears the active question and permits the still-due card to be selected again.
- Added a persistence gate. If a next-round request arrives while a ReviewLog transaction is pending, that request waits. The next selection runs only after the card and ReviewLog commit succeeds. A failed commit blocks the selection and displays an error instead of advancing with unsaved scheduling state.
- Advanced diagnostics to schema v2. Scheduler traces now link decision sequence, activation ID, session ID, question instance, next-round call, pre-selection card state and due time, eligible and due candidate counts, and recent cards. Review transitions link to their originating activation and show pending/saved/failed persistence status. The next decision links to the preceding saved review transition.
- Added warnings for a scheduled card reselected in the same session without an intervening review transition and for duplicate scheduled activations within 100 ms. Existing saved review-log findings are retained.

## Why one due card can recur after restart

An unanswered restart does not create a ReviewLog and does not change FSRS due state. A new session also resets its recent-card history. The sole due card is therefore still eligible and can correctly be selected in that new session. This is expected and is not classified as a duplicate.

## Production smoke results

`npm run smoke:scheduler-integrity` ran the production build in an isolated headless Chromium profile containing synthetic curriculum progress and 66 synthetic cards. Only `soundToKey:G` was due. The actual user's diagnostic export was not loaded into the browser or package.

- Rapid `All Due` preset, material, and clef changes while one task was unanswered: one activation in the session; the following two round requests were suppressed; zero scheduler warnings.
- Correct G4 response: one ReviewLog was persisted, `soundToKey:G` moved to a future due date, and the next Balanced decision selected `find:C`. The trace links the decision to its persisted review transition and the next decision to that transition.
- Wrong F4 followed by corrective G4: one ReviewLog with grade `Again`; the corrective response did not create another ReviewLog or alter the FSRS due date.
- Ten unanswered end/start cycles: 11 total due activations across 11 distinct sessions and question instances; zero warnings.
- Runtime exceptions: 0. Browser console errors: 0.

The resulting `diagnostics-after-scheduler-fix.json` is a fresh synthetic-profile export at diagnostics schema v2. It contains 66 cards, one still-due card, 11 activation traces across 11 sessions, and zero scheduler warnings. Its review history and potential-issue list are empty. It contains no user review history.

## Regression coverage and verification

Added scheduler-integrity unit coverage for duplicate in-session selection, allowed unanswered restarts, correct review linkage and persistence, later legitimate due selection, and ten separate unanswered sessions. Existing FSRS tests cover a wrong first response followed by one corrective response without a second mutation. Daily Practice tests cover a sole due card and Balanced rotation to another card.

Verification results:

- `npm run verify` — passed: typecheck, Svelte diagnostics (0 errors, 0 warnings), 22 test files / 431 tests passed, and production build.
- `npm run smoke:scheduler-integrity` — passed with the production browser results above.
- `node --check scripts/smokeSchedulerIntegrity.mjs` and `node --check scripts/buildSchedulerIntegrityArchive.mjs` — passed.

The production build still reports its existing large-chunk advisory for the JavaScript and OpenSheetMusicDisplay bundles; build completed successfully.

## Limits and acceptance boundary

The schema v1 export cannot retrospectively group the historical 30 ms trace trio into a session. Future schema v2 exports include the IDs needed to distinguish session restarts from duplicate in-session activations. Scheduler events are held in a bounded in-memory trace ring; saved review history remains in IndexedDB and is not cleared by this checkpoint.

No screenshot was necessary for this checkpoint. The archive contains no earlier screenshots, the supplied raw diagnostic export, or real user profile data. No files were staged or committed. Independent acceptance remains pending.
