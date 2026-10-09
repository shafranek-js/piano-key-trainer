import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivePath = path.join(projectDir, 'acceptance-screenshots.zip');

const acceptanceDirs = ['acceptance/m3l-rev4/screenshots', 'acceptance/layout-contract/screenshots'];

async function collectScreenshots(relativeDir) {
  const absoluteDir = path.join(projectDir, relativeDir);
  try {
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.png')) {
        files.push(`${relativeDir}/${entry.name}`.replaceAll('\\', '/'));
      }
    }
    return files;
  } catch (err) {
    return [];
  }
}

const screenshotPaths = (await Promise.all(acceptanceDirs.map(collectScreenshots))).flat().sort();

const fixedDate = new Date('2026-10-09T00:00:00Z');

async function buildArchive() {
  const zip = new JSZip();
  for (const relPath of screenshotPaths) {
    zip.file(relPath, await readFile(path.join(projectDir, relPath)), { date: fixedDate });
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

const firstBuild = await buildArchive();
const secondBuild = await buildArchive();
if (!firstBuild.equals(secondBuild)) {
  throw new Error('Deterministic build failed for acceptance-screenshots.zip');
}

await writeFile(archivePath, firstBuild);

let totalUncompressedBytes = 0;
for (const relPath of screenshotPaths) {
  const buf = await readFile(path.join(projectDir, relPath));
  totalUncompressedBytes += buf.length;
}

process.stdout.write(`${JSON.stringify({
  archivePath,
  screenshotCount: screenshotPaths.length,
  uncompressedBytes: totalUncompressedBytes,
  uncompressedMb: (totalUncompressedBytes / (1024 * 1024)).toFixed(2),
  zipBytes: firstBuild.length,
  zipMb: (firstBuild.length / (1024 * 1024)).toFixed(2),
  files: screenshotPaths
}, null, 2)}\n`);
