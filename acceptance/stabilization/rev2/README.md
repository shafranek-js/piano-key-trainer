# Stabilization Rev2 browser evidence

The three screenshots in this directory were captured from the built production app in an isolated headless Chrome profile. The smoke seeds only that temporary IndexedDB profile; it does not open or modify the user's browser profile.

`04-interval-p8-guided-single-target.png` shows the exact P8 Guided build prompt for C4 → C5. `scripts/smokeIntervalTriadProduction.mjs` then checks screen C5, the PC `C` shortcut mapped to C5, and MIDI note 72. Each route must reach `p8BuildQualify` with correct feedback, and one screen click must advance exactly once.

`05-triad-major-guided-two-missing-notes.png` shows the Guided C major triad with C4 supplied as the anchor. The production smoke adds E4 and G4 from the screen piano and from MIDI, then checks that both routes reach `majorBuildQualify`. MIDI E4 alone must show one of two missing notes.

`06-intervals-completion-summary-responsive.png` shows the Intervals completion card at 1440px. The same smoke checks that all six rows remain inside the card, do not overlap, and fit at 800px tablet width.

To reproduce after dependencies are installed:

1. Run `npm run build`.
2. Start `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.
3. In another terminal, run `node scripts/smokeIntervalTriadProduction.mjs`.

The smoke also verifies the generated service worker is active, the production app has no runtime exceptions, and the legacy global “Следующее задание” action is absent. A fake Web MIDI input drives the same production MIDI handlers used by connected hardware.
