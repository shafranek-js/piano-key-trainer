# Milestone 3J Rev1 — Stabilization Report

**Status: implementation complete; independent acceptance pending.** The accepted Milestone 3I and Scheduler Integrity baselines remain unchanged.

Rev1 addresses four M3J blockers: reproducible and complete ZIP packaging, a three-task remediation limit, advanced-stage content scrolling above the piano dock, and visible canonical questions for semantic Harmony tasks.

## Semantic question audit and fix

The Harmony domain model already retained semantic questions. `HarmonyAssessmentTrial` carries a typed `question` with its own prompt and choices; `getCurrentHarmonyQuestion()` returns that model for initial transfer, remediation, and retry trials. Daily Practice semantic cards similarly carry a task-specific prompt through `HarmonyReviewTask.prompt`.

The UI dropped that information at the assessment render boundary. `HarmonyStage.svelte` showed the trial prompt only for progression trials and rendered a generic chord-playing instruction for semantic trials, even though it still rendered their answer buttons. Corrective feedback was a separate state field, so it did not replace the domain question; the missing question was caused by the wrong UI prompt branch.

Rev1 renders `moduleQuestion.prompt` immediately before semantic choices in function identification, inversion choice, transfer, remediation, and retry. Transfer corrective feedback follows the options and explains that the first attempt was counted; the semantic prompt and choices remain in place. Progression transfer prompts now come from the current assessment/remediation trial model. Daily Practice uses its canonical review-task prompt. The production smoke checks at least two different semantic prompt types, the same question and choices after a wrong answer, remediation, retry, and a Daily Practice semantic card.

## Other Rev1 changes

- Transfer remediation selects at most three unique failed-trial indexes. A unit regression with four failures confirms the three-task maximum.
- Advanced modules share a scrollable task workspace that ends above the reserved bottom piano row. The keyboard stays at the viewport bottom; short-height tasks can scroll to their last controls and feedback.
- The browser smoke checks Harmony at 1920×1080, 1920×900, and 1366×768, and checks Bass / Grand Staff, Intervals, Triads, and Chord Inversions at 1366×768.
- The packaging script includes the project scripts and audits every `node scripts/<file>.mjs` reference found in `package.json`. It creates `piano-key-trainer-milestone3j-rev1.zip`, uses fixed ZIP metadata, and verifies identical repeated builds from unchanged inputs.
- The six-image M3J evidence set replaces the former 9/12 result image with a current trial 7/12 screen showing question, choices, and corrective feedback together.
- Clean-extraction validation exposed that the prior M3I smoke required an undocumented external preview, sampled module availability before synthetic progress had settled, and expected Harmony to remain `planned` after M3I completion. The smoke now starts its own production preview, waits for the seeded M3I entry to become actionable, and expects the current post-M3I roadmap state, Harmony `available`. Its initial M3I boundary still checks `planned`.

## Verification

Workspace verification passed:

- `npm run verify`: TypeScript passed; `svelte-check` reported 0 errors and 0 warnings; 23 test files / 443 tests passed; production build passed. Vite emitted its existing advisory for the large JS chunks.
- `npm run smoke:m3j`: PASS. It checked semantic prompts and answer options across 33 semantic task states, including function and next-chord questions, transfer, remediation, retry, and Daily Practice. The wrong-answer transfer state kept the same prompt and choices visible above corrective feedback. The assessment produced 3 remediation tasks and an 8/8 retry. No runtime exceptions or console errors were reported.
- Dock checks passed without horizontal overflow. Harmony feedback ended at y=713 / 588 / 464 while the keyboard began at y=816 / 656 / 532 for 1920×1080, 1920×900, and 1366×768. Bass / Grand Staff, Intervals, Triads, and Chord Inversions at 1366×768 each ended above the keyboard.
- The current six screenshots show only this M3J acceptance run. The transfer screenshot shows trial 7/12 with question, choices, and corrective feedback together; the independent-progression screenshot shows 3/4 and feedback fully above the piano.

Clean extraction of the final ZIP passed all five required commands:

- `npm ci`: installed 474 packages. npm reported two moderate audit findings and deprecated transitive packages; installation completed successfully.
- `npm run verify`: 23 test files / 443 tests passed; TypeScript passed; Svelte reported 0 errors and 0 warnings; production build passed with the existing chunk-size advisory.
- `npm run smoke:scheduler-integrity`: PASS — one activation and two suppressed refreshes in the settings burst; one saved correct review before the next selection (`find:C`); wrong-answer correction produced one review transition; 11 unanswered restarts created 11 sessions and zero scheduler warnings. No runtime exceptions or console errors.
- `npm run smoke:m3i`: PASS on its own temporary production preview — screen/MIDI build parity, Identify, slash chord, sequence, failed assessment/remediation/retry, passing completion, reload persistence, and one Daily Practice review. The starting roadmap kept Harmony `planned`; after M3I completion it was `available`. No runtime exceptions or console errors.
- `npm run smoke:m3j`: PASS — semantic prompts and options across all checked task types, correction prompt retention, remediation capped at 3, retry 8/8, Daily Practice persistence, and dock geometry across the three Harmony viewports plus the four advanced modules at 1366×768. No runtime exceptions or console errors.

The extracted archive contained 149 files and six M3J screenshots. It had no duplicate paths, nested ZIPs, `.git`, `node_modules`, `dist`, browser profile/seed data, unlisted acceptance files, or missing package-script files. Two consecutive archive builds from unchanged workspace inputs were byte-identical.

## Acceptance boundary

This is an implementation and packaging checkpoint only. M3J remains pending independent acceptance. No next milestone was started.
