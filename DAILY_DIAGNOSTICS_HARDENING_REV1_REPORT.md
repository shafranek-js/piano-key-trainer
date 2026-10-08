# Daily Practice & Diagnostics Hardening — Rev1 Report (SessionStrip vertical clipping)

**Scope:** targeted fix for the P1 finding in independent review of Checkpoint C: at 1440×1000
the wrapped session title's second line was vertically clipped by the SessionStrip boundary.
Daily Practice, Diagnostics, storage normalization and all other Checkpoint C changes are
preserved unchanged.

---

## Confirmed defect

At 1440×1000 the title «Ежедневная тренировка · 7:59 осталось» wrapped to two lines and the
second line («осталось») was cut by the strip's bottom edge; 1024 looked correct.

## Root cause (legacy desktop `!important` rules)

- `@media(min-width:1261px) .session-strip{height:54px!important; …;
  grid-template-columns:220px minmax(0,1fr) auto!important}` forced a narrow fixed title column.
- `@media(min-width:1261px) .workspace-page[data-page="practice"] > .session-strip{height:46px
  !important; max-height:46px!important; overflow:hidden!important; …}` locked the strip to a
  single 46 px row and clipped overflow.
- The practice page grid pinned its first row to `46px`
  (`grid-template-rows: 46px minmax(0,1fr) var(--keyboard-dock-height)!important`), so even an
  auto-height strip was stretched/clipped to that row.
- The earlier Checkpoint C rules allowed wrapping but had lower specificity/importance than these
  legacy rules, so they never took effect.
- The Checkpoint C smoke only checked horizontal overflow (`scrollWidth > clientWidth`), which
  cannot detect vertical ancestor clipping.

## Fix (same selectors, later source, explicit `!important`)

```css
@media(min-width:1261px){
  .workspace-page[data-page="practice"].active{
    grid-template-rows:minmax(46px,auto) minmax(0,1fr) var(--keyboard-dock-height,252px)!important;
  }
  .workspace-page[data-page="practice"] > .session-strip{
    height:auto!important;min-height:54px!important;max-height:none!important;
    overflow:visible!important;padding:7px 12px!important;
    grid-template-columns:minmax(0,1fr) minmax(140px,260px) auto!important;
  }
}
```

- The first grid row now grows with the wrapped title (`minmax(46px, auto)`), while the keyboard
  dock row (`var(--keyboard-dock-height)`) and the stage row are untouched — the piano stays
  docked and the page does not scroll.
- The title column is flexible (`minmax(0,1fr)`), so at 1440 the title fits on one line; when it
  wraps the strip grows instead of clipping.
- Progress bar and «Завершить» remain in the strip and usable at all three widths.

## Smoke upgrade (vertical clipping detection)

`smoke:daily-practice` now audits three widths — **1440×1000, 1280×800, 1024×900** — and asserts
per width:

- the title's bounding rect is fully inside the strip rect (`titleClippedByStrip === false`);
- no ancestor with `overflow-y: hidden/clip` clips the title (`ancestorClippedBy === null`) —
  this is the regression guard the previous smoke lacked;
- no horizontal clipping and no trailing ellipsis;
- progress bar and «Завершить» rects are inside the viewport (usable);
- the piano keyboard stays docked inside the viewport;
- the document itself is not scrollable (no unexpected page scrolling).

All audit results are stored in `acceptance/checkpoint-c/evidence.json → sessionStrip`.
Screenshots regenerated at all three widths (plus the diagnostics screenshot):
`01-session-strip-1440.png`, `02-session-strip-1280.png`, `03-session-strip-1024.png`,
`04-diagnostics-clean.png`.

## Verification

```
npm run typecheck                     # 0 errors
npm run check:svelte                  # 0 errors, 0 warnings
npm test                              # 604/604 across 39 files
npm run build                         # PASS
npm run verify                        # PASS
npm run smoke:daily-practice          # PASS (70 tasks, 17 skills, 4 screenshots)
npm run smoke:scheduler-integrity     # PASS
npm run smoke:m3i                     # PASS
npm run smoke:m3j                     # PASS
npm run smoke:m3k                     # PASS
npm run smoke:cold-test               # PASS
npm run smoke:persistence-integrity   # PASS
npm run package:daily-diagnostics-hardening-rev1  # deterministic ZIP + self-check
```

## Clean extraction

From a completely fresh directory containing only the ZIP contents:

```bash
npm ci
npm run verify
npm run smoke:persistence-integrity
npm run smoke:daily-practice
```

Result: **PASS** on 2026-10-08 from
`C:\Users\pavel\AppData\Local\Temp\opencode\daily-diagnostics-hardening-rev1` (file count printed
by the packaging script; `.github/workflows/verify.yml` present).

## Delivery

- `piano-key-trainer-daily-diagnostics-hardening-rev1.zip`
- `DAILY_DIAGNOSTICS_HARDENING_REV1_REPORT.md` (this file)

## Known limitations

- Secondary strip metadata (progress detail / accuracy line) may wrap or be reduced at compact
  widths/heights; the primary session title is always fully visible and the detail remains
  available in the session summary and diagnostics.
- All Checkpoint C known limitations stand unchanged (physical MIDI not re-tested, deterministic
  synthetic long-run fixture, diagnostics keeps real warnings when they truly exist).
