# M3J acceptance evidence

Milestone 3J Rev1 — Harmony & Accompaniment I is implemented and awaiting independent acceptance. Its baseline is accepted Milestone 3I. This checkpoint adds the learner-facing #10 harmony curriculum; rhythm scoring, two-hand accompaniment, and later harmony levels remain out of scope. Rev1 also reserves a scrollable task workspace above the bottom keyboard dock and caps transfer remediation at three tasks.

## Evidence

- `production-smoke.json` records the production Chrome smoke result and machine-readable assertions.
- `screenshots/01-program-harmony-current.png` shows #10 available after M3I.
- `screenshots/02-harmony-orientation.png` shows C major chord functions and the I–V–vi–IV sequence.
- `screenshots/03-smooth-bass-transition.png` shows C → G/B → Am and the C–B–A bass movement.
- `screenshots/04-independent-progression-3-of-4.png` shows the restored independent sequence at 3/4 with its feedback fully above the piano. The smoke checks the task/dock boundary at 1920×1080, 1920×900 and 1366×768, scrolling the workspace when needed.
- `screenshots/05-transfer-question-corrective-feedback.png` shows transfer trial 7/12 with its canonical question, answer options, and corrective feedback visible together.
- `screenshots/06-program-harmony-completed.png` shows the persisted completed #10 Program state after reload.

## Reproduce

```bash
npm run verify
npm run smoke:m3j
npm run smoke:scheduler-integrity
npm run package:m3j
```

To verify the delivered ZIP itself, extract it into a blank folder and run:

```bash
npm ci
npm run verify
npm run smoke:scheduler-integrity
npm run smoke:m3i
npm run smoke:m3j
```

The M3J smoke uses an isolated temporary Chrome profile, a synthetic completed prerequisite profile, screen-piano input, and injected fake MIDI messages. It covers 9/12 initial assessment, three-task-capped remediation, a fresh 8/8 retry, trial-specific semantic prompts across identify/next-chord/inversion/transfer/remediation/retry/Daily Practice, prompt retention after a wrong answer, progress reload, Daily Practice FSRS persistence, and scheduler transition linkage. It also checks the shared advanced-stage keyboard layout on Bass / Grand Staff, Intervals, Triads, Chord Inversions, and Harmony. No physical MIDI hardware is included in this evidence.

The compatibility `smoke:m3i` command starts its own production preview after the build and verifies the M3I state before and after completion. It keeps the initial M3I boundary at Harmony `planned`; after M3I is completed, the current roadmap correctly unlocks Harmony as `available`.

The archive `piano-key-trainer-milestone3j-rev1.zip` contains the complete project scripts and verifies every package-script reference. Its six screenshots are only the current M3J acceptance images; it excludes prior acceptance images, nested ZIP files, `dist`, `node_modules`, `.git`, and temporary browser data.
