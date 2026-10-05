import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = path.join(projectDir, 'piano-key-trainer-milestone3j-rev1.zip');
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
  'M3I_FINAL_REPORT.md',
  'RUNTIME_INTEGRITY_REPORT.md',
  'SCHEDULER_INTEGRITY_REPORT.md',
  'STABILIZATION_REV2_REPORT.md',
  'M3J_REV1_REPORT.md',
  'diagnostics-after-scheduler-fix.json'
];
const acceptanceFiles = [
  'acceptance/m3j/README.md',
  'acceptance/m3j/production-smoke.json',
  'acceptance/m3j/screenshots/01-program-harmony-current.png',
  'acceptance/m3j/screenshots/02-harmony-orientation.png',
  'acceptance/m3j/screenshots/03-smooth-bass-transition.png',
  'acceptance/m3j/screenshots/04-independent-progression-3-of-4.png',
  'acceptance/m3j/screenshots/05-transfer-question-corrective-feedback.png',
  'acceptance/m3j/screenshots/06-program-harmony-completed.png'
];
const fixedZipDate = new Date('1980-01-01T00:00:00.000Z');

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

const packageJson = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
const packageScriptFiles = [...new Set(Object.values(packageJson.scripts ?? {}).flatMap(command => {
  const matches = [...command.matchAll(/(?:^|\s)node\s+(scripts\/[A-Za-z0-9._/-]+\.mjs)(?=\s|$)/g)];
  return matches.map(match => match[1]);
}))];
const allScriptFiles = await walkTree('scripts');
const paths = [
  ...rootFiles,
  ...(await Promise.all(['src', 'tests', 'public'].map(walkTree))).flat(),
  ...allScriptFiles,
  ...acceptanceFiles
].sort();
const exactDuplicates = paths.filter((entry, index) => paths.indexOf(entry) !== index);
const caseInsensitiveDuplicates = paths.filter((entry, index) =>
  paths.findIndex(candidate => candidate.toLowerCase() === entry.toLowerCase()) !== index
);
if (exactDuplicates.length || caseInsensitiveDuplicates.length) {
  throw new Error(`Duplicate allowlist paths: ${[...exactDuplicates, ...caseInsensitiveDuplicates].join(', ')}`);
}
for (const relativePath of paths) await readFile(path.join(projectDir, relativePath));

async function generateArchive() {
  const zip = new JSZip();
  for (const relativePath of paths) {
    zip.file(relativePath, await readFile(path.join(projectDir, relativePath)), {
      date: fixedZipDate,
      createFolders: true,
      unixPermissions: '100644'
    });
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'UNIX'
  });
}

const [firstBuild, archiveBytes] = await Promise.all([generateArchive(), generateArchive()]);
if (!firstBuild.equals(archiveBytes)) throw new Error('M3J Rev1 archive is not reproducible from unchanged inputs.');

const inspectedZip = await JSZip.loadAsync(archiveBytes);
const archiveEntries = Object.keys(inspectedZip.files)
  .filter(name => !inspectedZip.files[name].dir)
  .map(name => name.replaceAll('\\', '/'));
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
  unexpectedAcceptanceFiles: archiveEntries.filter(name => name.startsWith('acceptance/') && !acceptanceFiles.includes(name)),
  screenshotCount: archiveEntries.filter(name => expectedScreenshots.has(name)).length,
  packageScriptsReferenced: packageScriptFiles,
  missingPackageScripts: packageScriptFiles.filter(name => !archiveEntries.includes(name)),
  missingRequired: [...rootFiles, ...allScriptFiles, ...acceptanceFiles].filter(name => !archiveEntries.includes(name))
};
if (
  checks.duplicatePaths || checks.caseInsensitiveDuplicatePaths || checks.nestedZip.length ||
  checks.nodeModules.length || checks.git.length || checks.dist.length || checks.profileOrSeed.length ||
  checks.unexpectedAcceptanceFiles.length || checks.screenshotCount !== 6 ||
  checks.missingPackageScripts.length || checks.missingRequired.length
) {
  throw new Error(`M3J Rev1 ZIP audit failed: ${JSON.stringify(checks)}`);
}

await writeFile(archivePath, archiveBytes);
process.stdout.write(`${JSON.stringify({
  archivePath,
  fileCount: archiveEntries.length,
  bytes: archiveBytes.length,
  sha256: createHash('sha256').update(archiveBytes).digest('hex'),
  identicalRebuild: true,
  checks
}, null, 2)}\n`);
