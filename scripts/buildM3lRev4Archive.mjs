import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = path.join(projectDir, 'piano-key-trainer-m3l-two-hand-accompaniment-rev4.zip');
const screenshotsArchivePath = path.join(projectDir, 'acceptance-screenshots.zip');

const rootFiles = [
  '.gitignore',
  'README.md',
  'CODE_AUDIT.md',
  'AUDIT_STABILIZATION_A_REPORT.md',
  'M3K_FINAL_REPORT.md',
  'M3K_REV1_REPORT.md',
  'M3K_REV1_FIX_REPORT.md',
  'COLD_TEST_PROGRESSION_FIX_REPORT.md',
  'COLD_TEST_DISPLAY_FIX_REPORT.md',
  'FSRS_PERSISTENCE_INTEGRITY_REPORT.md',
  'FSRS_PERSISTENCE_INTEGRITY_REV1_REPORT.md',
  'FSRS_PERSISTENCE_INTEGRITY_REV2_REPORT.md',
  'DAILY_DIAGNOSTICS_HARDENING_REPORT.md',
  'DAILY_DIAGNOSTICS_HARDENING_REV1_REPORT.md',
  'M3L_TWO_HAND_ACCOMPANIMENT_REPORT.md',
  'M3L_TWO_HAND_ACCOMPANIMENT_REV1_REPORT.md',
  'M3L_DEVICE_AWARENESS_REV2_REPORT.md',
  'M3L_DEVICE_AWARENESS_REV3_REPORT.md',
  'M3L_DEVICE_AWARENESS_REV4_REPORT.md',
  'GLOBAL_TRAINING_LAYOUT_CONTRACT_ACCEPTANCE_REPORT.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'svelte.config.js',
  'vite.config.ts',
  'index.html',
  'Piano_Key_Trainer_Developer_Handoff.md',
  'Piano_Key_Trainer_Roadmap.md',
  'M3I_FINAL_REPORT.md',
  'M3J_REPORT.md',
  'M3J_REV1_REPORT.md',
  'RUNTIME_INTEGRITY_REPORT.md',
  'SCHEDULER_INTEGRITY_REPORT.md',
  'STABILIZATION_REV2_REPORT.md'
];

const acceptanceDir = 'acceptance/m3l-rev4';
const layoutAcceptanceDir = 'acceptance/layout-contract';

async function walkTree(relativeDir) {
  const absoluteDir = path.join(projectDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`.replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', 'dist', 'dist-ssr', 'dist-test'].includes(entry.name)) continue;
      files.push(...await walkTree(relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

async function collectScripts() {
  const entries = await readdir(path.join(projectDir, 'scripts'), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isFile()) {
      files.push(`scripts/${entry.name}`);
    } else if (entry.isDirectory()) {
      const nested = await readdir(path.join(projectDir, 'scripts', entry.name), { withFileTypes: true });
      for (const nestedEntry of nested) {
        if (nestedEntry.isFile()) files.push(`scripts/${entry.name}/${nestedEntry.name}`);
      }
    }
  }
  return files.sort();
}

const acceptanceFiles = (await walkTree(acceptanceDir)).sort();
const layoutAcceptanceFiles = (await walkTree(layoutAcceptanceDir)).sort();
const scripts = await collectScripts();
const githubFiles = (await walkTree('.github')).sort();

// Permanent rule — Lean ZIP Packaging:
// 1. Main ZIP includes application source, tests, scripts, docs, and compact machine-readable acceptance evidence.
// 2. Include at most 3-4 representative screenshots in the main ZIP when essential.
// 3. Store the full screenshot collection in separate optional acceptance-screenshots.zip.
// 4. Do not accumulate historical screenshots from previous revisions.

const machineReadableAcceptanceFiles = [
  ...acceptanceFiles.filter(f => !f.endsWith('.png')),
  ...layoutAcceptanceFiles.filter(f => !f.endsWith('.png'))
].sort();

const allMilestoneScreenshots = [
  ...acceptanceFiles.filter(f => f.endsWith('.png')),
  ...layoutAcceptanceFiles.filter(f => f.endsWith('.png'))
].sort();

const representativeScreenshots = [
  'acceptance/m3l-rev4/screenshots/01-m3l-rev4-device-range.png',
  'acceptance/m3l-rev4/screenshots/05-m3l-hands-free-initial.png',
  'acceptance/layout-contract/screenshots/m3l-1792x864-failing-baseline.png',
  'acceptance/layout-contract/screenshots/m3l-1024x768-compact-desktop.png'
].sort();

if (representativeScreenshots.length > 4) {
  throw new Error(`Representative screenshots limit exceeded: ${representativeScreenshots.length} > 4`);
}

const mainPaths = [
  ...rootFiles,
  ...(await Promise.all(['src', 'tests', 'public'].map(walkTree))).flat(),
  ...scripts,
  ...githubFiles,
  ...machineReadableAcceptanceFiles,
  ...representativeScreenshots
].sort();

const exactDuplicates = mainPaths.filter((entry, index) => mainPaths.indexOf(entry) !== index);
const caseInsensitiveDuplicates = mainPaths.filter((entry, index) =>
  mainPaths.findIndex(candidate => candidate.toLowerCase() === entry.toLowerCase()) !== index
);
if (exactDuplicates.length || caseInsensitiveDuplicates.length) {
  throw new Error(`Duplicate allowlist paths: ${[...exactDuplicates, ...caseInsensitiveDuplicates].join(', ')}`);
}

for (const relativePath of mainPaths) {
  await readFile(path.join(projectDir, relativePath));
}

const packageJson = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
const referencedScripts = Object.values(packageJson.scripts ?? {})
  .flatMap(command => [...String(command).matchAll(/node\s+(scripts\/[\w./-]+\.mjs)/g)].map(match => match[1]));
const missingScripts = referencedScripts.filter(scriptPath => !mainPaths.includes(scriptPath));
if (missingScripts.length) {
  throw new Error(`package.json references scripts missing from the archive: ${missingScripts.join(', ')}`);
}

const requiredInfrastructure = [
  '.github/workflows/verify.yml',
  '.gitignore',
  'package.json',
  'package-lock.json'
];
const missingInfrastructure = requiredInfrastructure.filter(required => !mainPaths.includes(required));
for (const tree of ['src/', 'tests/', 'scripts/']) {
  if (!mainPaths.some(entry => entry.startsWith(tree))) {
    missingInfrastructure.push(`${tree} (empty)`);
  }
}
if (missingInfrastructure.length) {
  throw new Error(`Archive is missing required infrastructure: ${missingInfrastructure.join(', ')}`);
}

const fixedDate = new Date('2026-10-09T00:00:00Z');

async function buildZip(fileList) {
  const zip = new JSZip();
  for (const relativePath of fileList) {
    zip.file(relativePath, await readFile(path.join(projectDir, relativePath)), { date: fixedDate });
  }
  for (const entry of Object.values(zip.files)) {
    entry.date = fixedDate;
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

// 1. Build Main Source ZIP
const firstMainBuild = await buildZip(mainPaths);
const secondMainBuild = await buildZip(mainPaths);
if (!firstMainBuild.equals(secondMainBuild)) {
  throw new Error('Deterministic build failed for main source ZIP');
}

const inspectedMainZip = await JSZip.loadAsync(firstMainBuild);
const mainArchiveEntries = Object.keys(inspectedMainZip.files)
  .filter(name => !inspectedMainZip.files[name].dir)
  .map(name => name.replaceAll('\\', '/'));

const mainChecks = {
  duplicatePaths: mainArchiveEntries.length - new Set(mainArchiveEntries).size,
  caseInsensitiveDuplicatePaths: mainArchiveEntries.length - new Set(mainArchiveEntries.map(name => name.toLowerCase())).size,
  nestedZip: mainArchiveEntries.filter(name => name.toLowerCase().endsWith('.zip')),
  nodeModules: mainArchiveEntries.filter(name => /(^|\/)node_modules(\/|$)/i.test(name)),
  git: mainArchiveEntries.filter(name => /(^|\/)\.git(\/|$)/i.test(name)),
  dist: mainArchiveEntries.filter(name => /(^|\/)dist(-[^/]+)?(\/|$)/i.test(name)),
  profileOrSeed: mainArchiveEntries.filter(name =>
    /(^|\/)(profiles?|user-data|browser-data)(\/|$)|(^|\/)[^/]*(profile|seed)[^/]*\.(json|zip)$/i.test(name)
  ),
  foreignAcceptanceFiles: mainArchiveEntries.filter(name =>
    name.startsWith('acceptance/') &&
    !machineReadableAcceptanceFiles.includes(name) &&
    !representativeScreenshots.includes(name)
  ),
  unlistedScripts: mainArchiveEntries.filter(name =>
    name.startsWith('scripts/') && !scripts.includes(name)
  ),
  githubFiles: mainArchiveEntries.filter(name => name.startsWith('.github/') && !githubFiles.includes(name)),
  screenshotCount: mainArchiveEntries.filter(name => name.endsWith('.png')).length,
  missingRequired: mainPaths.filter(name => !mainArchiveEntries.includes(name))
};

if (
  mainChecks.duplicatePaths || mainChecks.caseInsensitiveDuplicatePaths || mainChecks.nestedZip.length ||
  mainChecks.nodeModules.length || mainChecks.git.length || mainChecks.dist.length ||
  mainChecks.profileOrSeed.length || mainChecks.foreignAcceptanceFiles.length || mainChecks.unlistedScripts.length ||
  mainChecks.githubFiles.length || mainChecks.screenshotCount > 4 ||
  mainChecks.screenshotCount !== representativeScreenshots.length || mainChecks.missingRequired.length
) {
  throw new Error(`Main source ZIP audit failed: ${JSON.stringify(mainChecks)}`);
}

await writeFile(archivePath, firstMainBuild);

// 2. Build Separate Acceptance Screenshots ZIP
const firstScreenshotsBuild = await buildZip(allMilestoneScreenshots);
const secondScreenshotsBuild = await buildZip(allMilestoneScreenshots);
if (!firstScreenshotsBuild.equals(secondScreenshotsBuild)) {
  throw new Error('Deterministic build failed for acceptance-screenshots.zip');
}

await writeFile(screenshotsArchivePath, firstScreenshotsBuild);

// Measure uncompressed screenshot sizes
let repScreenshotsBytes = 0;
for (const relPath of representativeScreenshots) {
  const buf = await readFile(path.join(projectDir, relPath));
  repScreenshotsBytes += buf.length;
}

let allScreenshotsBytes = 0;
for (const relPath of allMilestoneScreenshots) {
  const buf = await readFile(path.join(projectDir, relPath));
  allScreenshotsBytes += buf.length;
}

const summary = {
  rule: 'Permanent Project Rule — Lean ZIP Packaging',
  mainSourceArchive: {
    path: path.basename(archivePath),
    totalFileCount: mainArchiveEntries.length,
    finalArchiveBytes: firstMainBuild.length,
    finalArchiveMb: (firstMainBuild.length / (1024 * 1024)).toFixed(2),
    screenshotCount: mainChecks.screenshotCount,
    screenshotsUncompressedBytes: repScreenshotsBytes,
    screenshotsUncompressedMb: (repScreenshotsBytes / (1024 * 1024)).toFixed(2),
    screenshots: representativeScreenshots
  },
  screenshotsArchive: {
    path: path.basename(screenshotsArchivePath),
    totalScreenshotCount: allMilestoneScreenshots.length,
    uncompressedBytes: allScreenshotsBytes,
    uncompressedMb: (allScreenshotsBytes / (1024 * 1024)).toFixed(2),
    finalArchiveBytes: firstScreenshotsBuild.length,
    finalArchiveMb: (firstScreenshotsBuild.length / (1024 * 1024)).toFixed(2)
  },
  checks: mainChecks
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
