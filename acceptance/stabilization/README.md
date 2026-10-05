# Stabilization Rev1 acceptance evidence

- `diagnostics-after-fix.json` and `diagnostics-after-fix.md` are read-only reclassifications of the user-supplied 2026-10-02 diagnostics export. They include all 66 exported cards, 22 learning-progress records, and the 300 ReviewLog events available in that export. The export does not contain the full ReviewLog history or user settings; the reprocessing uses default app settings and documents that limit.
- The corrected snapshot reports 24 new cards with `dueAt: 0` as not due and not overdue. It accepts all 36 finite fractional due timestamps, reports zero invalid due dates, and retains four historical burst findings plus four stale-session findings in the exported event window. It also preserves one exported UI-versus-resolver availability mismatch for Intervals and a seven-task skill streak under default settings. The source summary says 6/6 core phases, while the 22 exported `learningProgress` rows omit phases 1–3; recomputation from those rows therefore reports 0/6. These conflicting source fields are documented rather than silently rewritten.
- Screenshots `01` and `02` are Program and Diagnostics captures from a separate temporary Chrome profile seeded with the sanitized fixture. Screenshot `03` shows the exact Bass Grand transfer edge case (task 15, minimum 12, 79%); the browser smoke then submits the threshold-crossing answer, verifies both terminal progress records in IndexedDB, reloads, and confirms Bass remains completed. The user's browser profile and learning database were not used or modified.
- `npm test -- tests/unit/reviewPersistence.test.ts` exercises the four real Advanced Module reducer outputs through the canonical review-persistence boundary and checks one append/persist operation per gradeable event.
- `stabilization-profile.seed.json` is generated scratch input for the temporary browser profile and is excluded from the archive.

Reproduce the evidence with installed dependencies:

1. Run `node scripts/reprocessDiagnosticExport.mjs "C:\\Users\\pavel\\Downloads\\piano-key-trainer-diagnostics-2026-10-02.json"` to regenerate actual diagnostics.
2. Run `node_modules/.bin/vite-node.cmd scripts/generateStabilizationDiagnostics.ts` to generate the isolated browser seed.
3. Start this Vite app at `127.0.0.1:5175` with the configured `/piano-key-trainer/` base path. Run `node scripts/captureStabilizationScreenshots.mjs` for screenshots `01` and `02`, then `node scripts/smokeBassGrandCompletion.mjs` for screenshot `03` and the completion/reload smoke. Set `PIANO_TRAINER_APP_URL` if another port is needed.

The generated ZIP preserves `README.md` at the archive root and this file at `acceptance/stabilization/README.md`.
