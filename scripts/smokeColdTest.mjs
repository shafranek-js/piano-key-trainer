import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previewEntry = path.join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const appRoute = '/piano-key-trainer/';
const screenshotDir = path.join(projectDir, 'acceptance', 'cold-test-progression', 'screenshots');

// Eight families in the canonical Cold Test cycle order place triadBuild exactly at item 8
// (0-based queue index 7): find, identify, patternIdentify, notationToKey, soundToKey,
// notationBassToKey, intervalBuild, triadBuild.
const COLD_FAMILIES = [
  { skill: 'find', note: 'C' },
  { skill: 'identify', note: 'C' },
  { skill: 'patternIdentify', note: 'C' },
  { skill: 'notationToKey', note: 'C' },
  { skill: 'soundToKey', note: 'C' },
  { skill: 'notationBassToKey', note: 'C' },
  { skill: 'intervalBuild', note: 'P8' },
  // reps=3 makes the deterministic canonical root rotation land on F#3 at item 8 (index 7),
  // reproducing the reported "Cold Test 8/20 · F# major" case exactly.
  { skill: 'triadBuild', note: 'major', reps: 3 }
];

let tempRoot;
let profileDir;
let portFile;
let chrome;
let preview;
let socket;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildColdCards() {
  const now = Date.now() - 10_000;
  return COLD_FAMILIES.map(({ skill, note, reps = 1 }) => ({
    id: `${skill}:${note}`,
    skill,
    note,
    memoryState: 'review',
    stability: 3,
    difficulty: 5,
    dueAt: now,
    lastReviewAt: now - 86_400_000,
    firstSeenAt: now - 86_400_000,
    reps,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: reps,
      firstCorrect: reps,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: reps,
      scheduledSuccesses: reps,
      practiceTrials: 0
    }
  }));
}

async function createSyntheticProfile() {
  const server = await createViteServer({
    configFile: false,
    root: projectDir,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true }
  });
  try {
    const fixture = await server.ssrLoadModule('/tests/fixtures/stabilizationProfile.ts');
    const profile = fixture.createSanitizedStabilizationProfile();
    return {
      cards: buildColdCards(),
      learningProgress: [...profile.learningProgress.values()],
      reviewLogs: []
    };
  } finally {
    await server.close();
  }
}

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForPortFile() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const lines = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/);
      if (lines[0]) return Number(lines[0]);
    } catch {}
    await delay(100);
  }
  throw new Error('Chrome did not expose a DevTools port.');
}

async function connectPage(port) {
  let target;
  for (let attempt = 0; attempt < 100; attempt++) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
    target = targets.find(item => item.type === 'page');
    if (target?.webSocketDebuggerUrl) break;
    await delay(100);
  }
  assert(target?.webSocketDebuggerUrl, 'Chrome did not expose its initial page.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const runtimeExceptions = [];
  const consoleErrors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (!message.id) {
      if (message.method === 'Runtime.exceptionThrown') {
        runtimeExceptions.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push((message.params.args || []).map(argument => argument.value || argument.description || '').join(' '));
      }
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  return {
    runtimeExceptions,
    consoleErrors,
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression) {
      const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Page evaluation failed');
      return result.result?.value;
    }
  };
}

async function waitFor(cdp, expression, description, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await cdp.evaluate(expression)) return;
    await delay(100);
  }
  const state = await cdp.evaluate(`JSON.stringify({url:location.href,body:document.body?.innerText?.slice(0,900),trace:(window.__coldTrace||[]).map(e=>({i:e.itemIndex,n:e.itemNumber,card:e.cardId,reason:e.completionReason,claimed:e.completionClaimed,next:e.nextIndex,key:e.questionInstanceId}))})`);
  throw new Error(`Timed out waiting for ${description}: ${state}`);
}

async function readStore(cdp, storeName) {
  return cdp.evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('${storeName}', 'readonly');
      const rows = tx.objectStore('${storeName}').getAll();
      rows.onsuccess = () => { db.close(); resolve(rows.result); };
      rows.onerror = () => reject(rows.error);
    };
  })`);
}

const baseSettings = {
  sessionPreset: 'normal', level: 'white', mode: 'smart', autoAdvanceDelaySeconds: 0,
  desiredRetention: 0.9, maxIntervalDays: 120, relearningSeconds: 45,
  newPitchClassesPerSession: 2, useLatencyGrading: true, notationClef: 'treble'
};

async function seedDatabase(cdp, data) {
  const payload = { cards: data.cards, learningProgress: data.learningProgress, reviewLogs: [] };
  const seeded = await cdp.evaluate(`((data) => new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const names = ['cards','reviewLogs','learningProgress','settings'];
      const tx = db.transaction(names, 'readwrite');
      for (const name of ['cards','reviewLogs','learningProgress']) {
        const store = tx.objectStore(name); store.clear();
        for (const row of data[name]) store.put(row);
      }
      tx.objectStore('settings').put({key:'userSettings',value:${JSON.stringify(baseSettings)}});
      tx.oncomplete = () => {
        localStorage.setItem('piano-key-trainer-settings', ${JSON.stringify(JSON.stringify(baseSettings))});
        db.close(); resolve(true);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }))(${JSON.stringify(payload)})`);
  assert(seeded, 'Could not seed the isolated synthetic browser profile.');
  const freshUrl = `${await cdp.evaluate('location.origin + location.pathname')}?coldSeed=${Date.now()}`;
  await cdp.send('Page.navigate', { url: freshUrl });
  await waitFor(cdp, `location.href === ${JSON.stringify(freshUrl)} && document.readyState === 'complete' && document.querySelectorAll('.top-nav-btn').length === 9`, 'reloaded synthetic profile');
  await delay(500);
}

async function saveScreenshot(cdp, fileName) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  return { fileName, bytes: Buffer.from(result.data, 'base64') };
}

async function clickKeyboardKey(cdp, keyId) {
  return cdp.evaluate(`(() => {
    const key = document.querySelector('.keyboard button[data-id="${keyId}"]');
    if (!key) return false;
    key.click();
    return true;
  })()`);
}

async function readColdUi(cdp) {
  return cdp.evaluate(`(() => ({
    header: document.querySelector('.session-strip .session-meta b')?.innerText.trim() ?? null,
    detail: document.querySelector('.session-strip .session-meta small')?.innerText.trim() ?? null,
    task: document.querySelector('.operation-stage .eyebrow')?.textContent?.trim() ?? null,
    prompt: document.querySelector('.operation-stage .prompt')?.innerText.trim() ?? '',
    feedback: document.querySelector('.operation-stage .feedback')?.innerText.trim() ?? '',
    feedbackClass: document.querySelector('.operation-stage .feedback')?.className ?? '',
    nextVisible: Boolean(document.querySelector('.next-question-inline-btn')),
    complete: Boolean(document.querySelector('[data-testid="session-complete-stage"]'))
  }))()`);
}

async function clickNext(cdp) {
  const clicked = await cdp.evaluate(`(() => {
    const button = document.querySelector('.next-question-inline-btn');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, 'Cold Test «Следующее» button was not available after completion.');
}

function expectedSkillForItem(itemNumber) {
  return COLD_FAMILIES[(itemNumber - 1) % COLD_FAMILIES.length].skill;
}

async function waitForColdItem(cdp, itemNumber) {
  const label = `Cold Test · ${itemNumber}/20`;
  await waitFor(cdp, `(() => {
    const header = document.querySelector('.session-strip .session-meta b');
    const task = document.querySelector('.operation-stage .eyebrow');
    return header?.innerText.trim() === ${JSON.stringify(label)}
      && task?.textContent?.trim() === ${JSON.stringify(label)}
      && !document.querySelector('.next-question-inline-btn');
  })()`, `Cold Test item ${itemNumber} ready`);
}

async function waitForColdCompletion(cdp, itemNumber) {
  if (itemNumber < 20) {
    const nextLabel = `Cold Test · ${itemNumber + 1}/20`;
    await waitFor(cdp, `document.querySelector('.session-strip .session-meta b')?.innerText.trim() === ${JSON.stringify(nextLabel)} && Boolean(document.querySelector('.next-question-inline-btn'))`, `item ${itemNumber} completion`);
  } else {
    await waitFor(cdp, `Boolean(document.querySelector('.next-question-inline-btn'))`, 'item 20 completion');
  }
}

async function answerGenericWrong(cdp, skill, itemNumber) {
  if (skill === 'identify') {
    const clicked = await cdp.evaluate(`(() => {
      const button = document.querySelector('button[data-answer-note]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert(clicked, `Item ${itemNumber} (identify) had no answer button.`);
  } else if (skill === 'notationBassToKey') {
    await clickKeyboardKey(cdp, 'D3');
  } else {
    await clickKeyboardKey(cdp, 'D4');
  }
  await waitForColdCompletion(cdp, itemNumber);
}

async function answerTriadWrong(cdp, itemNumber) {
  await clickKeyboardKey(cdp, 'D4');
  await clickKeyboardKey(cdp, 'F4');
  await clickKeyboardKey(cdp, 'A4');
  await waitFor(cdp, `document.querySelector('.triad-selection-count')?.innerText.includes('3')`, `item ${itemNumber} triad keys selected`);
  await cdp.evaluate(`document.querySelector('.triad-check-btn')?.click()`);
  await waitForColdCompletion(cdp, itemNumber);
}

const screenshots = [];

try {
  const synthetic = await createSyntheticProfile();
  const previewPort = await findFreePort();
  const previewUrl = `http://127.0.0.1:${previewPort}${appRoute}`;
  preview = spawn(process.execPath, [previewEntry, 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
    cwd: projectDir, stdio: 'ignore', windowsHide: true
  });
  let previewReady = false;
  for (let attempt = 0; attempt < 400; attempt++) {
    try {
      const response = await fetch(previewUrl);
      if (response.ok) { previewReady = true; break; }
    } catch {}
    if (preview.exitCode !== null) throw new Error(`Production preview exited with code ${preview.exitCode}.`);
    await delay(150);
  }
  assert(previewReady, `Production preview did not become ready at ${previewUrl}.`);

  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-cold-smoke-'));
  profileDir = path.join(tempRoot, 'chrome-profile');
  portFile = path.join(profileDir, 'DevToolsActivePort');
  await mkdir(profileDir, { recursive: true });
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--window-size=1440,1000', 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  const cdp = await connectPage(await waitForPortFile());
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { window.__coldTrace = []; })();`
  });
  await cdp.send('Page.navigate', { url: previewUrl });
  await waitFor(cdp, `document.querySelectorAll('.top-nav-btn').length === 9`, 'production application');
  await seedDatabase(cdp, synthetic);

  // Start Cold Test through the session summary action.
  await cdp.evaluate(`window.__openSessionSummary?.()`);
  await waitFor(cdp, `Boolean([...document.querySelectorAll('button')].find(b => b.innerText.trim().startsWith('Cold Test')))`, 'Cold Test start button');
  await cdp.evaluate(`([...document.querySelectorAll('button')].find(b => b.innerText.trim().startsWith('Cold Test')))?.click()`);
  await waitForColdItem(cdp, 1);

  for (let itemNumber = 1; itemNumber <= 20; itemNumber++) {
    const expectedHeader = `Cold Test · ${itemNumber}/20`;
    await waitForColdItem(cdp, itemNumber);
    const ui = await readColdUi(cdp);
    assert(ui.header === expectedHeader, `Item ${itemNumber}: header mismatch "${ui.header}" (expected "${expectedHeader}")`);
    assert(ui.task === expectedHeader, `Item ${itemNumber}: task label mismatch "${ui.task}" (expected "${expectedHeader}")`);

    const skill = expectedSkillForItem(itemNumber);
    if (itemNumber === 8) {
      // Exact user reproduction: Cold Test 8/20, triadBuild F# major, correct answer.
      assert(skill === 'triadBuild', `Item 8 must be triadBuild, got ${skill}`);
      assert(ui.prompt.includes('F#'), `Item 8 prompt must target F#: ${ui.prompt}`);
      const rootMatch = ui.prompt.match(/от\s+([A-G]#?\d)/);
      assert(rootMatch, `Item 8 prompt must expose the root: ${ui.prompt}`);
      const rootKeyId = rootMatch[1];
      assert(rootKeyId === 'F#3', `Item 8 must be F# major at the canonical F#3 root, got ${rootKeyId}`);
      assert(ui.detail.startsWith('выполнено 7 из 20'), `Item 8 activation must report 7 completed: ${ui.detail}`);
      screenshots.push(await saveScreenshot(cdp, '01-cold-test-specialized-item.png'));
      const triadKeys = await cdp.evaluate(`(() => {
        const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const root = ${JSON.stringify(rootKeyId)};
        const pc = names.indexOf(root.replace(/\\d/g, ''));
        const octave = Number(root.slice(-1));
        const midi = (octave + 1) * 12 + pc;
        return [midi, midi + 4, midi + 7].map(value => names[((value % 12) + 12) % 12] + (Math.floor(value / 12) - 1));
      })()`);
      for (const keyId of triadKeys) {
        const clicked = await clickKeyboardKey(cdp, keyId);
        assert(clicked, `Item 8 chord key ${keyId} is missing on the keyboard.`);
      }
      await waitFor(cdp, `document.querySelector('.triad-selection-count')?.innerText.includes('3')`, 'item 8 chord selection');
      await cdp.evaluate(`document.querySelector('.triad-check-btn')?.click()`);
      await waitFor(cdp, `document.querySelector('.operation-stage .feedback')?.innerText.includes('F#3') && document.querySelector('.session-strip .session-meta b')?.innerText.trim() === 'Cold Test · 9/20'`, 'item 8 correct feedback + counter');
      const correctUi = await readColdUi(cdp);
      assert(correctUi.feedback.includes('Верно') && correctUi.feedback.includes('F#3'), `Item 8 feedback must confirm F#3 major: ${correctUi.feedback}`);
      assert(correctUi.header === 'Cold Test · 9/20' && correctUi.task === 'Cold Test · 9/20', `Item 8 completion must advance both counters to 9/20: ${correctUi.header} / ${correctUi.task}`);
      assert(correctUi.detail.startsWith('выполнено 8 из 20'), `Item 8 completion must report 8 completed: ${correctUi.detail}`);
      screenshots.push(await saveScreenshot(cdp, '02-correct-specialized-feedback.png'));
      await waitFor(cdp, `(window.__coldTrace?.length ?? 0) > 0`, 'cold trace');
      const trace = await cdp.evaluate(`window.__coldTrace.at(-1)`);
      assert(trace.itemIndex === 7 && trace.itemNumber === 8 && trace.completionClaimed === true && trace.nextIndex === 8,
        `Cold trace for item 8 is wrong: ${JSON.stringify(trace)}`);
      await clickNext(cdp);
    } else if (skill === 'triadBuild') {
      await answerTriadWrong(cdp, itemNumber);
      await clickNext(cdp);
    } else {
      await answerGenericWrong(cdp, skill, itemNumber);
      await clickNext(cdp);
    }

    if (itemNumber === 8) {
      await waitForColdItem(cdp, 9);
      const afterUi = await readColdUi(cdp);
      assert(!afterUi.prompt.includes('F#'), 'Previous specialized question must not be shown again.');
      screenshots.push(await saveScreenshot(cdp, '03-next-cold-test-item.png'));
    }
  }

  // Item 20 completed exactly once -> Cold Test complete screen, no 21st item.
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="session-complete-stage"]')) || Boolean(document.querySelector('.session-summary-modal'))`, 'Cold Test completion screen');
  const finalUi = await readColdUi(cdp);
  assert(finalUi.complete || finalUi.feedback.includes('Cold') || finalUi.feedback.includes('сесси') || !finalUi.task,
    `Cold Test did not complete cleanly: ${JSON.stringify(finalUi)}`);
  const coldTests = await readStore(cdp, 'coldTests');
  assert(coldTests.length === 1 && coldTests[0].n === 20, `Cold Test record must contain 20 items: ${JSON.stringify(coldTests)}`);

  const runtimeExceptions = cdp.runtimeExceptions;
  const consoleErrors = cdp.consoleErrors.filter(message => !message.includes('favicon'));
  assert(runtimeExceptions.length === 0, `Runtime exceptions: ${runtimeExceptions.join(' | ')}`);
  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);

  await mkdir(screenshotDir, { recursive: true });
  for (const shot of screenshots) {
    await writeFile(path.join(screenshotDir, shot.fileName), shot.bytes);
  }
  console.info(`Cold Test progression smoke passed with ${screenshots.length} screenshots.`);
} finally {
  try { socket?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { preview?.kill(); } catch {}
  if (tempRoot) {
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    const resolvedTempRoot = path.resolve(tempRoot);
    if (resolvedTempRoot.startsWith(resolvedSystemTemp)) {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          await rm(resolvedTempRoot, { recursive: true, force: true });
          break;
        } catch {
          await delay(400);
        }
      }
    }
  }
}
