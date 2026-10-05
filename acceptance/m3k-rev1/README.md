# M3K Final Rev1 — acceptance evidence

Acceptance ID: `m3k-rev1`
Status: pending independent review and physical-MIDI user test.
Scope: beginner timing tolerance (±140 ms precise / ±300 ms accepted) and hands-free MIDI count-in start.

## Evidence

Screenshots (produced by `npm run smoke:m3k` against a production preview with an isolated Chrome
profile, fake Web MIDI, and synthetic progress that completes stages 1–10):

1. `01-midi-start-ready.png` — waiting state with the MIDI start hint; no mouse click is required.
2. `02-accepted-early.png` — correct chord 250 ms early: «Немного рано — засчитано».
3. `03-accepted-late.png` — correct chord 250 ms late: «Немного поздно — засчитано».

The same smoke verifies:

- any MIDI note starts the count-in only after full release; the gesture is never graded;
- arbitrary notes (F#4, A2, D5) and a chord start gesture behave identically;
- exactly one countdown per gesture, ten times in a row (race guard);
- a complete C → G/B two-bar change with no mouse click (`startMethod = midi_gesture`);
- timing cases 0 ms («Точно»), −250 ms and +250 ms (accepted), +350 ms («Слишком поздно», failed);
- preserved stabilization flows (corrective reload, exclusivity, remediation/retry exits, completion)
  with 0 runtime exceptions and 0 console errors.

`Physical MIDI tested: NO — Fake Web MIDI tested: YES.`

Related gates: `npm run verify` (tsc, svelte-check 0/0, 498 tests, production build) and
`smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j` are green.

Details: `M3K_REV1_REPORT.md`.
