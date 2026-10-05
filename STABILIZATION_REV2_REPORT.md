# Piano Key Trainer — Stabilization Rev2

**Status:** Rev2 implementation, production PWA build, interaction smoke, screenshots, and archive are prepared for independent review. This checkpoint includes the Rev1 stabilization plus the interval input, module summary layout, and Guided Triad interaction fixes requested during review.

## Changes in Rev2

### Interval Build input semantics

- Guided and other build-stage instructions explicitly say that the root is already supplied and the user presses only the second/upper note. The prompt includes the concrete `C4 → ?` form and interval size.
- A short build-only hint states that the root need not be pressed again and the two notes do not need to be held together. Identify stages do not show this hint.
- Structural root keys display the `ОПОРА` badge and have a distinct anchor style. The answer target retains its own state.
- Wrong-root feedback explains that C4 is already the reference note and asks for the second note above it.
- The PC piano shortcut now resolves its note and key ID and dispatches the same canonical interval `keyPress` action as screen piano and MIDI.

### Completion summary cards

- Advanced module summaries use a centered, width-bounded adaptive grid with enough row and column spacing, shrinkable grid items, wrapping text, and readable line-height.
- The shared pattern covers Intervals, Bass / Grand Staff, Triads, Inversions, and the Curriculum 3D completion stage.
- Browser assertions check all six Intervals summary items for clipping/overlap at desktop width and check the card and item text at 800px tablet width.

### Guided Triad Build

- In Guided Build, the root is supplied as context. Screen input accepts the two remaining chord tones; Guided MIDI counts only those two non-root tones. The supplied root is visibly marked as `ОПОРА`.
- Correct Guided answers flow through the existing canonical triad classifier and advance into the independent Qualify stage, which still requires the full triad. A full chord including the root remains accepted in Guided.
- A single added note is incomplete and does not grade or create an FSRS review. Wrong two-note answers use canonical corrective feedback. Other stages continue to require all three chord tones.

## Regression coverage

Unit coverage includes P8 Guided C4 → C5, P5/M3/m3 target notes, explanatory wrong-root feedback, canonical screen/PC/MIDI interval outcomes, one-stage advancement, Guided major/minor triad builds with two missing notes, supplied-root handling, incomplete one-note input, MIDI root exclusion, full-chord tolerance, and full-chord requirements outside Guided.

## Production browser evidence

`scripts/smokeIntervalTriadProduction.mjs` launches a fresh headless Chrome profile against Vite preview and seeds an isolated IndexedDB fixture. It verifies:

- The production service worker registers with the `/piano-key-trainer/` scope and reaches `activated`.
- On the exact `p8BuildGuided`, root C4, target C5 task, screen piano C5, PC key `C` mapped to C5, and MIDI note 72 each produce correct feedback and the transition to `p8BuildQualify`. A single screen answer advances only once.
- Guided Triad screen E4 + G4 and MIDI E4 + G4 each produce correct feedback and reach `majorBuildQualify`; MIDI E4 alone shows one of two missing notes.
- Intervals completion text fits without row overlap at 1440px and remains within the card at 800px.
- No uncaught production runtime exceptions occur, and the removed global “Следующее задание” control is not present.

Screenshots:

- `acceptance/stabilization/rev2/screenshots/04-interval-p8-guided-single-target.png`
- `acceptance/stabilization/rev2/screenshots/05-triad-major-guided-two-missing-notes.png`
- `acceptance/stabilization/rev2/screenshots/06-intervals-completion-summary-responsive.png`

## Workbox / PWA build gate

Rev1's earlier Workbox stall did not reproduce in the current checkout: the production build completed and generated the service worker, manifest, and Workbox runtime. A temporary, uncommitted timing probe measured the Workbox operations at approximately 17.7ms for the precache scan, 958.6ms for Rollup setup, 374.8ms for `bundle.generate` including Terser, 1338.7ms for the Workbox Rollup wrapper, and 1455.3ms total for `generateSW`. No PWA mode or Workbox configuration workaround was applied. The built production browser smoke confirmed the service worker activates at the expected app scope. This shows the build now completes; it does not identify a definitive cause for the earlier six-minute stall.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed as part of `npm run verify` |
| `npm test` | Passed: 21/21 files, 410/410 tests |
| `npm run build` | Passed: 200 modules transformed; `dist/sw.js`, the Workbox runtime, and manifest generated |
| `npm run verify` | Passed end-to-end |
| Focused interval and triad unit suites | Passed: 2 files / 105 tests |
| Production browser smoke | Passed: exact Interval screen/PC/MIDI parity; Guided Triad screen/MIDI; completion-card desktop/tablet checks; active production service worker; no runtime exceptions |
| ZIP audit | Passed: 132 files; no duplicate or case-colliding paths, nested ZIPs, `.git`, `node_modules`, `dist`, old screenshots, or browser seed |

The production build emitted only Vite's standard large-chunk-size warnings; it generated `dist/sw.js`, the Workbox runtime, the web manifest, and the service-worker registration. The archived deliverables are produced by `node scripts/buildStabilizationRev2Archive.mjs` with an explicit allowlist. The archive includes only the three new Rev2 screenshots and excludes prior milestone screenshots, the Rev1 stabilization screenshots, the isolated browser seed, nested ZIPs, `.git`, `node_modules`, and `dist`.

Rev1's diagnostic export findings, scope, and limitations remain in `STABILIZATION_REV1_REPORT.md` and `acceptance/stabilization/diagnostics-after-fix.*`. Historical data, schema, migrations, and the user's browser profile were not changed by the Rev2 interaction smoke.

## Deliverables

- `piano-key-trainer-stabilization-rev2.zip`
- `STABILIZATION_REV2_REPORT.md`
- `acceptance/stabilization/rev2/README.md`
- The three production screenshots listed above
