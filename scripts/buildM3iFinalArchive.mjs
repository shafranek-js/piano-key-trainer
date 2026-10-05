import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = path.join(projectDir, 'piano-key-trainer-m3i-final.zip');

const rootFiles = [
  '.gitignore',
  'README.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'svelte.config.js',
  'index.html',
  'Piano_Key_Trainer_Developer_Handoff.md',
  'Piano_Key_Trainer_Roadmap.md',
  'M3I_FINAL_REPORT.md'
];
const scriptFiles = [
  'scripts/smokeM3i.mjs',
  'scripts/buildM3iFinalArchive.mjs'
];
const acceptanceFiles = [
  'acceptance/m3i-final/README.md',
  'acceptance/m3i-final/screenshots/01-m3i-program-roadmap.png',
  'acceptance/m3i-final/screenshots/02-m3i-first-inversion-guided.png',
  'acceptance/m3i-final/screenshots/03-m3i-identify-input.png',
  'acceptance/m3i-final/screenshots/04-m3i-slash-guided.png',
  'acceptance/m3i-final/screenshots/05-m3i-transfer-result-75-percent.png',
  'acceptance/m3i-final/screenshots/06-m3i-module-complete.png'
];

async function walkTree(relativeDir) {
  const absoluteDir = path.join(projectDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`.replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', 'dist', 'dist-ssr'].includes(entry.name)) continue;
      files.push(...await walkTree(relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

const paths = [
  ...rootFiles,
  ...(await Promise.all(['src', 'tests', 'public'].map(walkTree))).flat(),
  ...scriptFiles,
  ...acceptanceFiles
].sort();

const exactDuplicates = paths.filter((entry, index) => paths.indexOf(entry) !== index);
const caseInsensitiveDuplicates = paths.filter((entry, index) =>
  paths.findIndex(candidate => candidate.toLowerCase() === entry.toLowerCase()) !== index
);
if (exactDuplicates.length || caseInsensitiveDuplicates.length) {
  throw new Error(`Duplicate allowlist paths: ${[...exactDuplicates, ...caseInsensitiveDuplicates].join(', ')}`);
}

for (const relativePath of paths) {
  await readFile(path.join(projectDir, relativePath));
}

const zip = new JSZip();
for (const relativePath of paths) {
  zip.file(relativePath, await readFile(path.join(projectDir, relativePath)));
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
const requiredPaths = [...rootFiles, ...scriptFiles, ...acceptanceFiles];
const expectedScreenshots = new Set(acceptanceFiles.filter(name => name.endsWith('.png')));
const checks = {
  duplicatePaths: archiveEntries.length - new Set(archiveEntries).size,
  caseInsensitiveDuplicatePaths: archiveEntries.length - new Set(archiveEntries.map(name => name.toLowerCase())).size,
  nestedZip: archiveEntries.filter(name => name.toLowerCase().endsWith('.zip')),
  nodeModules: archiveEntries.filter(name => /(^|\/)node_modules(\/|$)/i.test(name)),
  git: archiveEntries.filter(name => /(^|\/)\.git(\/|$)/i.test(name)),
  dist: archiveEntries.filter(name => /(^|\/)dist(\/|$)/i.test(name)),
  profileOrSeed: archiveEntries.filter(name =>
    /(^|\/)(profiles?|user-data|browser-data)(\/|$)|(^|\/)[^/]*(profile|seed)[^/]*\.(json|zip)$/i.test(name)
  ),
  nonM3iAcceptanceFiles: archiveEntries.filter(name =>
    name.startsWith('acceptance/') && !acceptanceFiles.includes(name)
  ),
  unlistedScripts: archiveEntries.filter(name =>
    name.startsWith('scripts/') && !scriptFiles.includes(name)
  ),
  screenshotCount: archiveEntries.filter(name => expectedScreenshots.has(name)).length,
  missingRequired: requiredPaths.filter(name => !archiveEntries.includes(name))
};

if (
  checks.duplicatePaths || checks.caseInsensitiveDuplicatePaths || checks.nestedZip.length ||
  checks.nodeModules.length || checks.git.length || checks.dist.length ||
  checks.profileOrSeed.length || checks.nonM3iAcceptanceFiles.length || checks.unlistedScripts.length ||
  checks.screenshotCount > 6 || checks.screenshotCount !== expectedScreenshots.size || checks.missingRequired.length
) {
  throw new Error(`M3I ZIP audit failed: ${JSON.stringify(checks)}`);
}

await writeFile(archivePath, archiveBytes);
process.stdout.write(`${JSON.stringify({ archivePath, fileCount: archiveEntries.length, bytes: archiveBytes.length, checks }, null, 2)}\n`);
