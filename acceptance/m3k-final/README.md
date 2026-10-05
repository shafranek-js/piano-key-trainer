# M3K Finalization — acceptance evidence

Acceptance ID: `m3k-final`
Status: pending independent acceptance and physical-MIDI user test.
Module: Milestone 3K — Chord Rhythm & Pulse I (learner-facing #11 «Ритм аккордов»).

## Evidence

Screenshots (produced by `npm run smoke:m3k` against a production preview with an isolated
Chrome profile, fake Web MIDI, and synthetic progress that completes stages 1–10):

1. `01-pre-count-in.png` — timed two-bar change exercise before the count-in: «Сейчас: C · Далее: G/B» and «Начать отсчёт».
2. `02-play-now.png` — bar 1 target beat: visible «ИГРАЙТЕ СЕЙЧАС» cue equals the open grading window.
3. `03-correct-change-on-time.png` — full C → G/B transition through fake MIDI with per-bar success and «Смена: Точно».
4. `04-wrong-bass-on-time.png` — root-position G on the change bar: «✗ неверный бас» at exact change timing.
5. `05-module-complete.png` — completion persisted (retention records + FSRS cards) with a working exit.

The same smoke also verifies:

- the canonical two-bar exercise `| C | G/B |` (bar 1 C, bar 2 G/B on the next downbeat) is one
  question (one `questionInstanceId`) and is repeated with `C3–E3–G3 → B3–D4–G4` and
  `C4–E4–G4 → B2–D3–G3`;
- plain chords are octave- and inversion-independent, slash `G/B` still requires a B bass;
- a correct G/B played after the missed change threshold keeps `chordCorrect = true` with
  `Смена: Пропущена доля`;
- pending corrective state, module exclusivity, bounded remediation/retry, terminal failed-retry
  exits, completion/exit into normal practice, and zero runtime/console errors.

Related gates: `npm run verify` (tsc, svelte-check 0/0, 495 tests, production build) and
`smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j` are green.

Details: `M3K_FINAL_REPORT.md`.
