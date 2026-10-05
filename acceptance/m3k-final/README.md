# M3K Finalization — acceptance evidence

Acceptance ID: `m3k-final`
Status: pending independent acceptance and physical-MIDI user test.
Module: Milestone 3K — Chord Rhythm & Pulse I (learner-facing #11 «Ритм аккордов»).

## Evidence

Screenshots (produced by `npm run smoke:m3k` against a production preview with an isolated
Chrome profile, fake Web MIDI, and synthetic progress that completes stages 1–10):

1. `01-pre-count-in.png` — timed task before the count-in: explicit «Начать отсчёт» state.
2. `02-play-now.png` — the canonical target beat: visible «ИГРАЙТЕ СЕЙЧАС» cue equals the open grading window.
3. `03-correct-chord-on-time.png` — physical-MIDI-style correct C major accepted with exact timing.
4. `04-wrong-chord-on-time.png` — C minor on the beat: independent pitch (✗ wrong_quality, «Сыграно: C minor / Ожидалось: C») and timing (Точно).
5. `05-module-complete.png` — completion persisted (retention records + FSRS cards) with a working exit.

The same smoke also verifies:

- `changeOnBeatOne`, target `C`: count-in completes, fake MIDI sends C major at beat 1 with
  `timingBand = on_time`, `chordCorrect = true`, stage success — repeated 10 times with different
  octaves (`C3–E3–G3`, `C4–E4–G4`, `C5–E5–G5`) and inversions (`E4–G4–C5`, `G4–C5–E4`), and the
  classification trace records the real raw MIDI note numbers;
- plain chords are octave- and inversion-independent, slash `G/B` still requires a B bass;
- a correct chord played after the missed threshold keeps `chordCorrect = true` with
  `timingBand = missed`;
- pending corrective state, module exclusivity, bounded remediation/retry, terminal failed-retry
  exits, completion/exit into normal practice, and zero runtime/console errors.

Related gates: `npm run verify` (tsc, svelte-check 0/0, 488 tests, production build) and
`smoke:scheduler-integrity`, `smoke:m3i`, `smoke:m3j` are green.

Details: `M3K_FINAL_REPORT.md`.
