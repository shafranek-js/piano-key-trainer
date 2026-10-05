# Runtime Interaction Integrity Hotfix

**Status:** ready for independent acceptance review. This checkpoint continues from accepted Stabilization Rev2 and is limited to runtime action integrity, Svelte-aware checking, regression coverage, and packaging.

## Root cause and correction

Triad Identify used two incompatible action names. `TriadAction` and its reducer accept `selectAnswer`, while the UI handler and keyboard resolver used `selectQuality`; the reducer treated that unknown action as a no-op. The UI button path, PC keyboard path, and reducer now share the canonical `{ type: 'selectAnswer', quality }` contract. No `selectQuality` action alias was added.

For a Major stimulus, clicking Minor now displays corrective feedback and keeps the learner on the Major Identify step. Clicking Major displays green success feedback and advances exactly once from `majorIdentifyQualify` to `majorIdentifyDelayedCheck`. The Minor stimulus likewise accepts its Minor button. `Digit1`, `Digit2`, `Numpad1`, and `Numpad2` resolve through the same action path. MIDI remains a non-answer channel for Identify.

Identify prompts spell out the stimulus and response: inspect the three highlighted notes, then choose Major or Minor with a button or `1 / 2`. The daily-practice card presentation now validates interval, triad-quality, and inversion identifiers before using them; this removes unsafe casts from the Identify answer presentation.

## Svelte-aware checking and action audit

Added `svelte-check` and `svelte.config.js`; `npm run verify` now runs `typecheck`, `check:svelte`, unit tests, and the production build. `svelte-check` reports **0 errors and 0 warnings**, including `App.svelte`. The Svelte integration cleanup corrected typed action handlers and component contracts rather than suppressing diagnostics.

As a negative control, `App.svelte` was temporarily given the invalid action `{ type: 'selectQuality', quality }`. `npm run check:svelte` failed at that call site with `Type '"selectQuality"' is not assignable to type ... TriadAction`. The temporary mutation was reverted, and the final checker run passed.

The UI-to-reducer review covered FirstRun, Curriculum, Curriculum3D, Bass / Grand Staff, Intervals, Triads, and Chord Inversions. Their App dispatch functions take the exported domain action types, and the final Svelte-aware check passed. The stray Triad `midiChord` action branch was not retained; chord MIDI continues to use the existing `MidiChordTracker` and canonical `submitChord` action where that input is supported.

## Regression and production evidence

Triad unit coverage now checks canonical Digit/Numpad resolution, correct Major and Minor answers, corrective feedback for a wrong Minor answer on a Major stimulus, one-stage advancement, and a single ReviewLog from one gradeable delayed-check answer.

`npm run smoke:runtime-integrity` drives a production preview using a fresh headless Chrome profile and synthetic progress records. It verifies:

- Major Identify renders exactly the three expected highlighted keys and both answer buttons.
- Wrong Minor gives visible corrective feedback; correct Major and correct Minor each show success feedback and move to their delayed-check stage.
- `Digit1` / `Numpad1` match the Major button; `Digit2` / `Numpad2` give the same corrective result as Minor on a Major stimulus.
- MIDI note input leaves Triad Identify step and feedback unchanged.
- One gradeable answer creates exactly one additional ReviewLog; one Qualify input advances only one stage.
- Interval Identify responds to its P8 button and `Digit1`; Inversion Identify responds to its first-inversion button and `Digit2`.
- The production browser reports **0 uncaught runtime exceptions** and **0 console errors**.

The smoke creates a temporary Chrome profile and builds its synthetic curriculum progress in the script. It does not use the user's browser profile or the local Stabilization Rev2 seed.

## Verification results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed (`tsc --noEmit`) |
| `npm run check:svelte` | Passed: 0 errors, 0 warnings |
| `npm test` | Passed: 21/21 files, 414/414 tests |
| `npm run build` | Passed: 198 modules transformed; PWA service worker, Workbox runtime, and manifest generated |
| `npm run verify` | Passed end-to-end with exit code 0 |
| `npm run smoke:runtime-integrity` | Passed against production preview; all assertions passed |
| `npm run package:runtime-integrity` | See archive audit below |

Vite printed its large-chunk-size advisory for the existing application bundles; it did not fail the build. Physical MIDI hardware was not used; the smoke dispatched a synthetic MIDI note through the production Web MIDI controller.

## Screenshots

- `acceptance/runtime-integrity/screenshots/01-triad-identify-major-correct.png` — three illuminated stimulus keys, answer buttons, and visible success feedback after Major.
- `acceptance/runtime-integrity/screenshots/02-triad-identify-wrong-feedback.png` — the same Major stimulus with corrective feedback after choosing Minor.

These are the only new acceptance screenshots in this checkpoint. Earlier Rev2 and milestone screenshots are not copied into the runtime-integrity package.

## Packaging and acceptance boundary

`piano-key-trainer-runtime-integrity.zip` is built from an explicit allowlist containing the application source, tests, required root documentation, runtime-integrity report, smoke/packaging scripts, and the two screenshots. The archive audit rejects duplicate paths, nested ZIPs, `.git`, `node_modules`, `dist`, local profile seeds, browser profiles, and earlier acceptance screenshots.

The final archive audit passed with **120 files**. It found no duplicate or case-colliding paths, nested ZIPs, `.git`, `node_modules`, `dist`, profile or seed data, earlier acceptance screenshots, unlisted acceptance files, or unlisted scripts. Exactly the two screenshots listed above are included.

No roadmap milestone status changed. The implementation and evidence are ready for independent review; stop at this checkpoint until acceptance is decided.
