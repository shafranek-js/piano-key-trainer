# M3K Final Rev1 — acceptance evidence

Acceptance ID: `m3k-rev1` (includes the Rev1 acceptance fix: PLAY NOW synchronization, accepted
early/late styling, and twoStrikes two-attack lifecycle).
Status: pending independent review and physical-MIDI user test.
Scope: beginner timing tolerance (±140 ms precise / ±300 ms accepted), hands-free MIDI count-in start,
and the twoStrikes release/re-strike contract.

## Evidence

Screenshots (produced by `npm run smoke:m3k` against a production preview with an isolated Chrome
profile, fake Web MIDI, and synthetic progress that completes stages 1–10):

1. `01-midi-start-ready.png` — waiting state with the MIDI start hint; no mouse click is required.
2. `02-accepted-early.png` — correct chord 250 ms early: «Немного рано — засчитано», accepted styling.
3. `03-accepted-late.png` — correct chord 250 ms late: «Немного поздно — засчитано», accepted styling.

The same smoke verifies:

- any MIDI note starts the count-in only after full release; the gesture is never graded;
- arbitrary notes (F#4, A2, D5) and a chord start gesture behave identically;
- exactly one countdown per gesture, ten times in a row (race guard);
- a complete C → G/B two-bar change with no mouse click (`startMethod = midi_gesture`);
- PLAY NOW appears exactly at `target − 300 ms` together with the acceptance window, and an immediate
  pre-window chord is `too_early` while the cue stays hidden;
- timing cases 0 ms («Точно»), −250 ms and +250 ms (accepted styling, no red), +350 ms (failed styling);
- twoStrikes via fake MIDI: strike 1 at beat 1, full release, strike 2 at beat 3, one question, two
  evaluations, «Оба удара приняты», 0 ReviewLogs; holding after strike 1 shows «Отпустите клавиши
  перед вторым ударом» and hides PLAY NOW;
- preserved stabilization flows (corrective reload, exclusivity, remediation/retry exits, completion)
  with 0 runtime exceptions and 0 console errors.

`Physical MIDI tested: NO — Fake Web MIDI tested: YES.`

Related gates: `npm run verify` (tsc, svelte-check 0/0, 506 tests, production build) and
`smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j` are green.

Details: `M3K_REV1_FIX_REPORT.md` (fix round) and `M3K_REV1_REPORT.md` (initial Rev1).
