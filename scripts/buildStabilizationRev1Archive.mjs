// LEGACY (historical checkpoint): superseded Stabilization Rev1 packaging.
// Not part of the current release workflow and intentionally not referenced by package.json.
// Kept only as historical evidence; do not extend.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = path.join(projectDir, 'piano-key-trainer-stabilization-rev1.zip');
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
  'STABILIZATION_REV1_REPORT.md'
];
const acceptanceFiles = [
  'acceptance/stabilization/README.md',
  'acceptance/stabilization/diagnostics-after-fix.json',
  'acceptance/stabilization/diagnostics-after-fix.md',
  'acceptance/stabilization/screenshots/01-program-after-reload.png',
  'acceptance/stabilization/screenshots/02-diagnostics-integrity.png',
  'acceptance/stabilization/screenshots/03-bass-transfer-minimum.png'
];
const excludedScratch = new Set(['acceptance/stabilization/stabilization-profile.seed.json']);

async function walkTree(relativeDir) {
  const absoluteDir = path.join(projectDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`.replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', 'dist', 'dist-ssr'].includes(entry.name)) continue;
      files.push(...(await walkTree(relativePath)));
    } else if (entry.isFile() && !excludedScratch.has(relativePath)) {
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
const archiveEntries = Object.keys(inspectedZip.files).filter(name => !inspectedZip.files[name].dir);
const normalizedEntries = archiveEntries.map(name => name.replaceAll('\\', '/'));
const checks = {
  duplicatePaths: normalizedEntries.length - new Set(normalizedEntries).size,
  caseInsensitiveDuplicatePaths: normalizedEntries.length - new Set(normalizedEntries.map(name => name.toLowerCase())).size,
  nestedZip: normalizedEntries.filter(name => name.toLowerCase().endsWith('.zip')).length,
  nodeModules: normalizedEntries.filter(name => /(^|\/)node_modules(\/|$)/i.test(name)).length,
  git: normalizedEntries.filter(name => /(^|\/)\.git(\/|$)/i.test(name)).length,
  dist: normalizedEntries.filter(name => /(^|\/)dist(\/|$)/i.test(name)).length,
  missingRequired: [...rootFiles, ...acceptanceFiles].filter(name => !normalizedEntries.includes(name))
};
if (
  checks.duplicatePaths || checks.caseInsensitiveDuplicatePaths || checks.nestedZip ||
  checks.nodeModules || checks.git || checks.dist || checks.missingRequired.length
) {
  throw new Error(`ZIP audit failed: ${JSON.stringify(checks)}`);
}

await writeFile(archivePath, archiveBytes);
process.stdout.write(`${JSON.stringify({ archivePath, fileCount: archiveEntries.length, bytes: archiveBytes.length, checks }, null, 2)}\n`);
