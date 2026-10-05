import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagnosticSnapshot, generateDiagnosticsMarkdownSummary } from '../src/core/diagnostics/buildDiagnosticSnapshot';
import { createSanitizedStabilizationProfile } from '../tests/fixtures/stabilizationProfile';

const outputDir = path.resolve(process.cwd(), 'acceptance', 'stabilization');
const profile = createSanitizedStabilizationProfile();
const snapshot = buildDiagnosticSnapshot({
  cards: profile.cards,
  learningProgress: profile.learningProgress,
  reviewLogs: profile.reviewLogs,
  now: profile.now,
  environmentMeta: {
    browser: 'Sanitized stabilization regression fixture; synthetic data only',
    platform: 'Synthetic profile',
    screenSize: 'N/A'
  }
});

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'diagnostics-after-fix.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
await writeFile(path.join(outputDir, 'diagnostics-after-fix.md'), `${generateDiagnosticsMarkdownSummary(snapshot)}\n`, 'utf8');
await writeFile(path.join(outputDir, 'stabilization-profile.seed.json'), JSON.stringify({
  cards: profile.cards,
  reviewLogs: profile.reviewLogs,
  learningProgress: [...profile.learningProgress.values()]
}), 'utf8');
process.stdout.write(`Generated JSON and Markdown diagnostics in ${outputDir}\n`);
