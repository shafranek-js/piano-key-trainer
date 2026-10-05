# M3I Finalization Acceptance Evidence

This evidence belongs only to the Milestone 3I stabilization checkpoint. The screenshots come from a production-build browser smoke using an isolated Chrome profile and synthetic learner progress.

## Screenshots

1. `01-m3i-program-roadmap.png` — M3I available/in progress while full harmony remains planned.
2. `02-m3i-first-inversion-guided.png` — three-note build instructions, input legend, and visually marked bass.
3. `03-m3i-identify-input.png` — highlighted chord stimulus and answer-channel instructions.
4. `04-m3i-slash-guided.png` — slash-symbol build instructions and bass marker.
5. `05-m3i-transfer-result-75-percent.png` — failed 16-trial assessment with the 80% gate visible.
6. `06-m3i-module-complete.png` — completion summary.

## Runtime evidence

Run `npm run smoke:m3i` after `npm run build`. It starts a temporary Vite production preview and Chrome profile, seeds synthetic IndexedDB state and fake MIDI, and checks screen piano, MIDI, Identify buttons/digits, sequence progression, failed and passing bounded transfer paths, persistence after reload, and one correct Daily Practice slash-build review. Set `PIANO_TRAINER_APP_URL` to use an existing preview. The smoke writes or replaces only the six named screenshots in this directory. After M3I completion, the current roadmap makes #10 Harmony available.

## Boundary

This evidence supports independent acceptance of M3I finalization. It does not accept or start the separate full harmony/accompaniment milestone. Fake MIDI does not replace a physical hardware check.
