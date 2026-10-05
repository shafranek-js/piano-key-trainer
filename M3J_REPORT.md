# Milestone 3J — Harmony & Accompaniment I

## Outcome

Implemented the introductory Harmony module as learner roadmap stage #10, available after accepted M3I. The module teaches the C major functions `I–V–vi–IV`, the root-position sequence `C → G → Am → F`, and the smoother bass motion `C → G/B → Am → F`.

Scope ends at block-chord progressions and recognition. Rhythm scoring, accompaniment patterns, two-hand performance, and additional keys are outside M3J.

## Learning path

1. Orientation connects C, G, Am, and F to `I`, `V`, `vi`, and `IV`.
2. Function questions establish the Roman-numeral mapping.
3. The learner plays `C → G → Am → F` in root position.
4. A model and comparison show how `G/B` keeps the G major chord while moving B into the bass; the learner identifies the smoother transition.
5. Next-chord questions teach the two practiced sequence patterns.
6. Guided, independent, and memory stages build and retrieve `C → G/B → Am → F` one chord at a time.
7. Transfer uses a fixed 12-task block with an 80% first-attempt threshold. A failed block selects up to three weak tasks for remediation, followed by a fresh eight-task retry. The retry does not extend the original counter.

Progress and transfer assessment are persisted in `LearningProgressRecord`. Independent progression position is restored after reload, while transient selected screen-piano notes are cleared. Passing the retry persists Harmony completion; after reload, the Program shows #10 completed.

## Input contract

| Task | Screen piano | PC keyboard | MIDI |
|---|---|---|---|
| Function, next-chord, and G/B choice | Select an answer button | `1–4`, `Digit1–4`, or `Numpad1–4` selects the same answer | Not used for semantic answer selection |
| Chord progression | Select the three named keys, then submit | No PC piano-note chord-entry mapping; number shortcuts apply only to semantic choices | Hold exactly three unique chord notes together; release all notes before the next chord |

The progression channels use the same `classifyHarmonyChord` outcome. Incomplete, extra, wrong-quality, wrong-inversion, wrong-octave, and wrong-chord inputs receive specific feedback. A wrong task remains available for correction; correction does not erase its first-attempt failure in transfer assessment.

Transfer semantic answer buttons and number shortcuts both dispatch `selectAnswer`. This fixes a UI gap found during production smoke: the reducer handled semantic assessment questions, but the assessment and remediation screens did not render their answer choices. The 9/12 result also retains warning feedback styling after a corrected progression.

## Daily Practice and scheduler

The module defines six Harmony review cards: four function cards, one next-chord card, and one progression card. Each card remains gated by the corresponding retained learning item until the module is complete. A progression is one Daily Practice question: any wrong chord makes its first attempt incorrect, while corrective replay does not create a second grade or ReviewLog. The visible “Следующее задание” action uses the normal scheduler path, which waits for review persistence before selecting another card.

Diagnostics expose Harmony gate states, card lifecycle and eligibility, and transfer phase/block information. Scheduler Trace v2 remains unchanged.

## Verification

- `npm run verify` — passed: TypeScript check, Svelte check (0 errors, 0 warnings), 23 test files / 441 tests, and production build. Vite reported its existing large-chunk advisory.
- `npm run smoke:m3j` — passed against the production preview in isolated Chrome. It exercised the current #10 Program card, screen-piano and fake-MIDI sequences, semantic keyboard shortcuts, independent progression reload, 9/12 failure, remediation, fresh 8/8 retry, completion reload, Daily Practice MIDI progression, exactly one saved ReviewLog/FSRS transition before the next card, and Diagnostics linkage. Runtime exceptions: 0; console errors: 0.
- `npm run smoke:scheduler-integrity` — passed. The inherited scheduler baseline still showed one activation under settings burst, persistence before the next decision, one ReviewLog for wrong-then-correct, and 11 unanswered activations across 11 sessions without scheduler warnings.
- Six current M3J screenshots and `acceptance/m3j/production-smoke.json` are included under `acceptance/m3j/`.
- `npm run package:m3j` creates `piano-key-trainer-milestone3j.zip` from an explicit file allowlist and audits duplicate paths, nested archives, build/dependency folders, browser profile/seed files, and unrelated acceptance evidence.

The MIDI runtime check uses a fake Web MIDI input in Chrome; no physical MIDI device was tested. M3J is implemented and packaged for independent acceptance; implementation and smoke evidence do not mark the milestone accepted.
