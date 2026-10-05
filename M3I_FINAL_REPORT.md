# M3I Finalization Report

Date: 2026-10-03. Scope: stabilize the existing Milestone 3I inversion and chord-symbol module. This report records implementation and verification evidence; independent acceptance remains the next gate.

## Baseline

- Existing M3I scope: first and second inversion, inversion identification, slash-chord reading/build, the introductory `C → G/B → Am → F` sequence, and a bounded transfer assessment.
- The project working tree already contained extensive unrelated changes and two previously accepted archives. This checkpoint did not stage or commit files and did not replace those archives.
- Full harmony/accompaniment remains a separate planned module. Learner Roadmap #10 remains planned after M3I (#9).

## Existing M3I Architecture

- Canonical M3I reducer, progression, assessment, and persistence live in `src/core/learning/chordInversions.ts`.
- The advanced-module stage UI is `src/ui/components/InversionStage.svelte`; application wiring, Daily Practice, piano, and MIDI are in `src/App.svelte` and `src/ui/components/Keyboard.svelte`.
- Daily Practice target selection and activation live in `src/core/learning/dailyPractice.ts` and `src/core/learning/curriculumFlow.ts`.
- The module requires Triads completion and remains separate from core Phases 1–6.

## Interaction Audit Matrix

| Task | Screen piano | MIDI | PC note shortcut | Answer buttons / digits |
|---|---|---|---|---|
| Inversion build, slash build, four-chord sequence, transfer chord trial | Select exactly three notes, then submit | Evaluate the same three-note voicing after all notes are held and released | Not accepted | Not used |
| Inversion Identify | Stimulus only; piano presses do not answer | Stimulus only; MIDI presses do not answer | Not accepted | Semantic answer buttons and `1/2/3`, `Digit1/2/3`, or `Numpad1/2/3` |
| Daily Practice inversion/slash build | Select exactly three notes, then submit | Same canonical full-chord evaluator; held-note progress is visible | Not accepted | Not used |
| Daily Practice inversion Identify | Stimulus only | Stimulus only | Not accepted | Semantic answer buttons and `1/2/3` shortcuts |

The bass is marked as `БАС`. Build instructions identify the complete chord input. Identify instructions explain that highlighted piano keys are the stimulus, not an answer channel.

## Defects Found

- Daily Practice's `white` level filter excluded M3I cards whose notes are `first`, `second`, or `slash`.
- M3I inversion and symbol cards had no connection to their module learning-progress gates, so the scheduler could not activate them according to M3I retention state.
- `triadInversionBuild:slash` passed the literal `slash` label as an inversion, producing no valid slash-chord voicing. Its prompt also presented that internal label as learner-facing content.
- The initial production smoke audit exposed correct Guided reducer transitions without visible success feedback; green success feedback was added to the canonical reducer outcomes.

## Fixes

- Mapped Daily Practice inversion-build and identify cards to their M3I learning records. Slash-symbol review requires both chord-symbol and slash-build retention. Pending delayed retry stays excluded; completed M3I makes these retained practice cards available.
- Included the M3I skill family in the `white` Daily Practice candidate pool.
- Resolved the slash-build card to a concrete canonical slash chord, a valid inversion, and a three-note voicing; its prompt now names the displayed chord symbol.
- Preserved one evaluator path for screen and MIDI full-chord submissions. Incomplete screen input cannot be submitted; MIDI tracking waits for the complete held chord.
- Added explanatory green success feedback for correct reducer transitions.
- Added unit regression coverage for M3I Daily Practice activation and pending retry exclusion, valid slash target generation, and the already-covered bounded transfer, stage, persistence, and input contracts.

## M3I End-to-End Behaviour

The production smoke opens the M3I program route, first-inversion Guided, Identify, slash Guided, Harmony Sequence, transfer result/remediation/retry, and completion. It checks the instructional contract, bass marker, ignored piano/MIDI stimulus on Identify, semantic button/digit answers, single-stage advances, failed and passing transfer paths, and the planned-harmony boundary.

## Persistence / Reload

- A failed 16-trial result remains on its result stage after reload; focused remediation then opens a fresh 8-trial retry.
- The passing transfer record and M3I completion record persist after reload; the Program/Roadmap state remains completed for M3I while full harmony remains planned.
- The production smoke uses an isolated temporary Chrome profile and synthetic IndexedDB data.

## Daily Practice Integration

- The browser smoke seeds one due `triadInversionBuild:slash` card with retained M3I prerequisites, opens Training at level `white`, confirms the concrete `Am/C` chord and three-key submit guard, then enters `C4 + E4 + A4`.
- It checks that one correct `triadInversionBuild:slash` scheduled log is persisted through the existing daily evaluator.
- Unit tests verify first/second inversion, identify, slash-build, and slash-symbol cards appear at level `white` only when their mapped M3I progress is retained, and that delayed-retry items remain inactive.

## Documentation Updates

- `README.md` documents the production smoke and final archive commands.
- `Piano_Key_Trainer_Developer_Handoff.md` records the M3I scope, interaction model, bounded assessment, persistence, Daily Practice activation, and acceptance boundary.
- `Piano_Key_Trainer_Roadmap.md` keeps M3I at #9 and full harmony/accompaniment at #10 planned.
- `acceptance/m3i-final/README.md` inventories the current six screenshots and synthetic-smoke evidence.

## Tests

Full `npm run verify` passed on 2026-10-03:

- `npm run typecheck` — passed.
- `npm run check:svelte` — 0 errors, 0 warnings.
- `npm test` — 21 files, 424 tests passed.
- `npm run build` — passed; Vite emitted its existing advisory about large chunks.
- `node --check scripts/smokeM3i.mjs` — passed.

## Production Smoke

`npm run smoke:m3i` passed against `http://127.0.0.1:4173/piano-key-trainer/` with isolated Chrome and fake MIDI:

- Program showed M3I in progress and Harmony planned. Screen piano and MIDI both advanced first-inversion Guided to Qualify with the same correct feedback; the bass cue displayed `БАС`.
- Identify ignored piano and MIDI input. The semantic answer button and `Digit2` each advanced to the expected next stage.
- Slash Guided advanced to Qualify; the first harmony chord advanced exactly once from `C` to `G/B`.
- A failed transfer finished at exactly 16 trials and 75%, with the 80% requirement visible. Remediation then opened a fresh retry at `1 из 8`; a separate 13/16 synthetic run completed the module.
- Failed result, completion, and the Roadmap boundary persisted after reload. M3I became completed while Harmony remained planned.
- Daily Practice activated a due M3I slash-build card under the white level. It displayed `Am/C`, said to play the chord by that symbol, kept submit disabled at `0 из 3`, and persisted exactly one correct `triadInversionBuild:slash` log after `C4 + E4 + A4`.
- Production smoke reported zero runtime exceptions and zero console errors. It refreshed only the six listed M3I screenshots.

The initial attempts at the newly added Daily Practice smoke check exposed setup-variable issues in the test harness before that check ran. After switching it to the already-prepared profile/card fixture, the complete final production smoke passed; no application behavior assertion failed in those earlier setup attempts.

Evidence images are limited to the six current files in `acceptance/m3i-final/screenshots/`.

## Known Limitations

- MIDI coverage uses a synthetic Web MIDI device; no physical MIDI hardware was tested.
- Browser profiles and learning records are synthetic. No real learner account or production service was used.
- The Vite production build reports large JavaScript chunk advisory output; build succeeds.
- The scoped `git diff --check` reported two trailing spaces in existing Staff JSX attributes in `src/App.svelte`, outside the M3I changes. They were left untouched to preserve unrelated dirty work.
- This is implementation verification, not independent acceptance. Stop here for that review; do not begin full accompaniment work.

## Verification

The production smoke passed. `npm run package:m3i-final` passed on 2026-10-03 and created `piano-key-trainer-m3i-final.zip` with 125 files. The allowlist audit found six screenshots, no duplicates, nested ZIPs, `.git`, `node_modules`, `dist`, temporary profile/seed files, unlisted scripts or acceptance files, or missing required files. Independent acceptance remains the final checkpoint gate.
