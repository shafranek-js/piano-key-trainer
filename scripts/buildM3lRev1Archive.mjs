import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = path.join(projectDir, 'piano-key-trainer-m3l-two-hand-accompaniment-rev1.zip');

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

const acceptanceDir = 'acceptance/m3l-rev1';

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
const scripts = await collectScripts();
const githubFiles = (await walkTree('.github')).sort();

const paths = [
  ...rootFiles,
  ...(await Promise.all(['src', 'tests', 'public'].map(walkTree))).flat(),
  ...scripts,
  ...githubFiles,
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

const packageJson = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
const referencedScripts = Object.values(packageJson.scripts ?? {})
  .flatMap(command => [...String(command).matchAll(/node\s+(scripts\/[\w./-]+\.mjs)/g)].map(match => match[1]));
const missingScripts = referencedScripts.filter(scriptPath => !paths.includes(scriptPath));
if (missingScripts.length) {
  throw new Error(`package.json references scripts missing from the archive: ${missingScripts.join(', ')}`);
}

const requiredInfrastructure = [
  '.github/workflows/verify.yml',
  '.gitignore',
  'package.json',
  'package-lock.json'
];
const missingInfrastructure = requiredInfrastructure.filter(required => !paths.includes(required));
for (const tree of ['src/', 'tests/', 'scripts/']) {
  if (!paths.some(entry => entry.startsWith(tree))) {
    missingInfrastructure.push(`${tree} (empty)`);
  }
}
if (missingInfrastructure.length) {
  throw new Error(`Archive is missing required infrastructure: ${missingInfrastructure.join(', ')}`);
}

const fixedDate = new Date('2026-10-08T00:00:00Z');

async function buildArchive() {
  const zip = new JSZip();
  for (const relativePath of paths) {
    zip.file(relativePath, await readFile(path.join(projectDir, relativePath)), { date: fixedDate });
  }
  // JSZip auto-creates parent folder entries with the current time; pin every entry's date
  // so archives are byte-identical regardless of when the build runs.
  for (const entry of Object.values(zip.files)) {
    entry.date = fixedDate;
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

const firstBuild = await buildArchive();
const secondBuild = await buildArchive();
if (!firstBuild.equals(secondBuild)) {
  const firstZip = await JSZip.loadAsync(firstBuild);
  const secondZip = await JSZip.loadAsync(secondBuild);
  const differing = [];
  for (const name of Object.keys(firstZip.files)) {
    if (firstZip.files[name].dir) continue;
    const left = await firstZip.files[name].async('nodebuffer');
    const right = await secondZip.files[name]?.async('nodebuffer');
    if (!right || !left.equals(right)) differing.push(name);
  }
  let firstDiff = -1;
  for (let index = 0; index < Math.min(firstBuild.length, secondBuild.length); index++) {
    if (firstBuild[index] !== secondBuild[index]) { firstDiff = index; break; }
  }
  throw new Error(`Archive build is not deterministic for unchanged inputs: ${JSON.stringify(differing.slice(0, 10))} lengths=${firstBuild.length}/${secondBuild.length} firstDiff=${firstDiff}`);
}

const inspectedZip = await JSZip.loadAsync(firstBuild);
const archiveEntries = Object.keys(inspectedZip.files)
  .filter(name => !inspectedZip.files[name].dir)
  .map(name => name.replaceAll('\\', '/'));

const expectedScreenshots = acceptanceFiles.filter(name => name.endsWith('.png'));
const requiredPaths = [...rootFiles, ...scripts, ...githubFiles, ...acceptanceFiles];
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
  foreignAcceptanceFiles: archiveEntries.filter(name =>
    name.startsWith('acceptance/') && !name.startsWith(`${acceptanceDir}/`)
  ),
  unlistedScripts: archiveEntries.filter(name =>
    name.startsWith('scripts/') && !scripts.includes(name)
  ),
  githubFiles: archiveEntries.filter(name => name.startsWith('.github/') && !githubFiles.includes(name)),
  screenshotCount: archiveEntries.filter(name => expectedScreenshots.includes(name)).length,
  missingRequired: requiredPaths.filter(name => !archiveEntries.includes(name))
};

if (
  checks.duplicatePaths || checks.caseInsensitiveDuplicatePaths || checks.nestedZip.length ||
  checks.nodeModules.length || checks.git.length || checks.dist.length ||
  checks.profileOrSeed.length || checks.foreignAcceptanceFiles.length || checks.unlistedScripts.length ||
  checks.githubFiles.length || checks.screenshotCount > 4 ||
  checks.screenshotCount !== expectedScreenshots.length || checks.missingRequired.length
) {
  throw new Error(`M3L Rev1 two-hand accompaniment ZIP audit failed: ${JSON.stringify(checks)}`);
}

await writeFile(archivePath, firstBuild);
process.stdout.write(`${JSON.stringify({
  archivePath,
  fileCount: archiveEntries.length,
  bytes: firstBuild.length,
  referencedScripts: referencedScripts.length,
  infrastructure: requiredInfrastructure,
  screenshots: expectedScreenshots,
  checks
}, null, 2)}\n`);
