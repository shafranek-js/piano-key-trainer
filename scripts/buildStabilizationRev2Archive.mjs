// LEGACY (historical checkpoint): superseded Stabilization Rev2 packaging.
// Not part of the current release workflow and intentionally not referenced by package.json.
// Kept only as historical evidence; do not extend.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = path.join(projectDir, 'piano-key-trainer-stabilization-rev2.zip');
const rootFiles = [
  '.gitignore',
  'README.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'piano_key_trainer_fsrs_v6_0_1_scroll_fix.html',
  'Piano_Key_Trainer_Developer_Handoff.md',
  'Piano_Key_Trainer_Roadmap.md',
  'STABILIZATION_REPORT.md',
  'STABILIZATION_REV1_REPORT.md',
  'STABILIZATION_REV2_REPORT.md'
];
const acceptanceFiles = [
  'acceptance/stabilization/README.md',
  'acceptance/stabilization/diagnostics-after-fix.json',
  'acceptance/stabilization/diagnostics-after-fix.md',
  'acceptance/stabilization/rev2/README.md',
  'acceptance/stabilization/rev2/screenshots/04-interval-p8-guided-single-target.png',
  'acceptance/stabilization/rev2/screenshots/05-triad-major-guided-two-missing-notes.png',
  'acceptance/stabilization/rev2/screenshots/06-intervals-completion-summary-responsive.png'
];
const excludedFiles = new Set([
  'acceptance/stabilization/stabilization-profile.seed.json',
  'scripts/workboxTimingProbe.cjs'
]);

async function walkTree(relativeDir) {
  const absoluteDir = path.join(projectDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`.replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', 'dist', 'dist-ssr'].includes(entry.name)) continue;
      files.push(...(await walkTree(relativePath)));
    } else if (entry.isFile() && !excludedFiles.has(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

const paths = [
  ...rootFiles,
  ...(await Promise.all(['src', 'tests', 'scripts', 'public'].map(walkTree))).flat(),
  ...acceptanceFiles
].sort();

const exactDuplicates = paths.filter((entry, index) => paths.indexOf(entry) !== index);
const caseInsensitiveDuplicates = paths.filter((entry, index) =>
  paths.findIndex(candidate => candidate.toLowerCase() === entry.toLowerCase()) !== index
);
if (exactDuplicates.length || caseInsensitiveDuplicates.length) {
  throw new Error(`Duplicate allowlist paths: ${[...exactDuplicates, ...caseInsensitiveDuplicates].join(', ')}`);
}

const zip = new JSZip();
for (const relativePath of paths) {
  const contents = await readFile(path.join(projectDir, relativePath));
  zip.file(relativePath, contents);
}

const archiveBytes = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 }
});
const inspectedZip = await JSZip.loadAsync(archiveBytes);
const archiveEntries = Object.keys(inspectedZip.files)
  .filter(name => !inspectedZip.files[name].dir)
  .map(name => name.replaceAll('\\', '/'));
const requiredPaths = [...rootFiles, ...acceptanceFiles];
const checks = {
  duplicatePaths: archiveEntries.length - new Set(archiveEntries).size,
  caseInsensitiveDuplicatePaths: archiveEntries.length - new Set(archiveEntries.map(name => name.toLowerCase())).size,
  nestedZip: archiveEntries.filter(name => name.toLowerCase().endsWith('.zip')),
  nodeModules: archiveEntries.filter(name => /(^|\/)node_modules(\/|$)/i.test(name)),
  git: archiveEntries.filter(name => /(^|\/)\.git(\/|$)/i.test(name)),
  dist: archiveEntries.filter(name => /(^|\/)dist(\/|$)/i.test(name)),
  oldStabilizationScreenshots: archiveEntries.filter(name => /^acceptance\/stabilization\/screenshots\//i.test(name)),
  oldAdvancedModuleScreenshots: archiveEntries.filter(name => /^acceptance\/m3[bcdefghi]\//i.test(name) && name.endsWith('.png')),
  isolatedSeed: archiveEntries.filter(name => name === 'acceptance/stabilization/stabilization-profile.seed.json'),
  timingProbe: archiveEntries.filter(name => name === 'scripts/workboxTimingProbe.cjs'),
  screenshotCount: archiveEntries.filter(name => /^acceptance\/stabilization\/rev2\/screenshots\/.*\.png$/i.test(name)).length,
  missingRequired: requiredPaths.filter(name => !archiveEntries.includes(name)),
  unlistedAcceptanceFiles: archiveEntries.filter(name => name.startsWith('acceptance/') && !requiredPaths.includes(name))
};
if (
  checks.duplicatePaths || checks.caseInsensitiveDuplicatePaths || checks.nestedZip.length ||
  checks.nodeModules.length || checks.git.length || checks.dist.length ||
  checks.oldStabilizationScreenshots.length || checks.oldAdvancedModuleScreenshots.length ||
  checks.isolatedSeed.length || checks.timingProbe.length || checks.screenshotCount !== 3 ||
  checks.missingRequired.length || checks.unlistedAcceptanceFiles.length
) {
  throw new Error(`ZIP audit failed: ${JSON.stringify(checks)}`);
}

await writeFile(archivePath, archiveBytes);
process.stdout.write(`${JSON.stringify({ archivePath, fileCount: archiveEntries.length, bytes: archiveBytes.length, checks }, null, 2)}\n`);
