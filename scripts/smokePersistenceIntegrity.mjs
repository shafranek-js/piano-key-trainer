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
const screenshotDir = path.join(projectDir, 'acceptance', 'fsrs-persistence-integrity', 'screenshots');
const FROZEN_NOW = 1_800_000_000_000;

let tempRoot;
let profileDir;
let portFile;
let chrome;
let preview;
let socket;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildReviewCards() {
  const now = Date.now() - 10_000;
  return [
    { id: 'find:C', note: 'C', dueAt: now - 3000 },
    { id: 'find:D', note: 'D', dueAt: now - 2000 },
    { id: 'find:E', note: 'E', dueAt: now - 1000 }
  ].map(({ id, note, dueAt }, index) => ({
    id,
    skill: 'find',
    note,
    memoryState: 'review',
    stability: 3,
    difficulty: 5,
    dueAt,
    lastReviewAt: now - 86_400_000,
    firstSeenAt: now - 172_800_000,
    reps: 1,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: 1,
      firstCorrect: 1,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 1,
      scheduledSuccesses: 1,
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
      cards: buildReviewCards(),
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

async function waitFor(cdp, expression, description, attempts = 300) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await cdp.evaluate(expression)) return;
    await delay(100);
  }
  const state = await cdp.evaluate(`JSON.stringify({url:location.href,body:document.body?.innerText?.slice(0,900)})`);
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

async function waitForAppHydration(cdp) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const hydrated = await cdp.evaluate(`new Promise(resolve => {
      const request = indexedDB.open('PianoTrainerDB');
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction('settings', 'readonly');
          const count = tx.objectStore('settings').count();
          count.onsuccess = () => { const done = count.result > 0; db.close(); resolve(done); };
          count.onerror = () => { db.close(); resolve(false); };
        } catch { db.close(); resolve(false); }
      };
    })`);
    if (hydrated) return;
    await delay(100);
  }
  throw new Error('Application did not finish initial data hydration before seeding.');
}

async function seedDatabase(cdp, data) {
  const payload = { cards: data.cards, learningProgress: data.learningProgress, reviewLogs: [] };
  const seeded = await cdp.evaluate(`((data) => new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const names = ['cards','reviewLogEvents','learningProgress','settings'];
      const tx = db.transaction(names, 'readwrite');
      for (const name of ['cards','reviewLogEvents','learningProgress']) {
        const store = tx.objectStore(name); store.clear();
        for (const row of (data[name] ?? [])) store.put(row);
      }
      tx.objectStore('settings').put({key:'userSettings',value:${JSON.stringify(baseSettings)}});
      tx.oncomplete = () => {
        localStorage.setItem('piano-trainer-settings', ${JSON.stringify(JSON.stringify(baseSettings))});
        db.close(); resolve(true);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }))(${JSON.stringify(payload)})`);
  assert(seeded, 'Could not seed the isolated synthetic browser profile.');
  const freshUrl = `${await cdp.evaluate('location.origin + location.pathname')}?persistenceSeed=${Date.now()}`;
  await cdp.send('Page.navigate', { url: freshUrl });
  await waitFor(cdp, `location.href === ${JSON.stringify(freshUrl)} && document.readyState === 'complete' && document.querySelectorAll('.top-nav-btn').length === 9`, 'reloaded synthetic profile');
  await delay(500);
}

async function saveScreenshot(cdp, fileName) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  return { fileName, bytes: Buffer.from(result.data, 'base64') };
}

async function clickFindKey(cdp) {
  const note = await cdp.evaluate(`document.querySelector('.operation-stage .prompt .note')?.innerText.trim() ?? ''`);
  const letter = note.match(/^([A-G]#?)/)?.[1];
  assert(letter, `Could not read the prompt note: ${note}`);
  const keyId = `${letter}4`;
  const clicked = await cdp.evaluate(`(() => {
    const key = document.querySelector('.keyboard button[data-id="${keyId}"]');
    if (!key) return false;
    key.click();
    return true;
  })()`);
  assert(clicked, `Piano key ${keyId} is missing for prompt ${note}.`);
  return keyId;
}

async function readPersistenceUi(cdp) {
  return cdp.evaluate(`(() => ({
    ready: Boolean(document.querySelector('.operation-stage')),
    prompt: document.querySelector('.operation-stage .prompt')?.innerText.trim() ?? '',
    feedback: document.querySelector('.operation-stage .feedback')?.innerText.trim() ?? '',
    feedbackClass: document.querySelector('.operation-stage .feedback')?.className ?? '',
    nextVisible: Boolean(document.querySelector('.next-question-inline-btn')),
    bannerVisible: Boolean(document.querySelector('[data-testid="persistence-error-banner"]')),
    retryVisible: Boolean(document.querySelector('[data-testid="persistence-retry-btn"]')),
    questionId: window.__activeQuestionId ?? null,
    diagnostics: window.__persistenceDiagnostics ?? []
  }))()`);
}

async function clickNext(cdp) {
  const clicked = await cdp.evaluate(`(() => {
    const button = document.querySelector('.next-question-inline-btn');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, 'Next button was not available.');
}

const screenshots = [];
const evidence = {
  generatedAt: new Date().toISOString(),
  smoke: 'smoke:persistence-integrity'
};

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

  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-persistence-smoke-'));
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
    source: `(() => {
      const realNow = Date.now.bind(Date);
      window.__frozenNow = null;
      Date.now = () => (window.__frozenNow == null ? realNow() : window.__frozenNow);
      window.__persistenceDiagnostics = [];
    })();`
  });
  await cdp.send('Page.navigate', { url: previewUrl });
  await waitFor(cdp, `document.querySelectorAll('.top-nav-btn').length === 9`, 'production application');
  await waitForAppHydration(cdp);
  await seedDatabase(cdp, synthetic);

  // Review 1: correct answer at the frozen timestamp.
  await waitFor(cdp, `document.querySelector('.operation-stage .prompt')?.innerText.includes('Найдите ноту')`, 'first find card');
  await cdp.evaluate(`window.__frozenNow = ${FROZEN_NOW}`);
  await clickFindKey(cdp);
  await waitFor(cdp, `document.querySelector('.operation-stage .feedback')?.className.includes('good') && Boolean(document.querySelector('.next-question-inline-btn'))`, 'first review feedback');
  let logs = await readStore(cdp, 'reviewLogEvents');
  assert(logs.length === 1 && logs[0].ts === FROZEN_NOW, `First review must persist with the frozen ts: ${JSON.stringify(logs)}`);
  const firstEventId = logs[0].reviewEventId;
  let ui = await readPersistenceUi(cdp);
  assert(ui.diagnostics.some(entry => entry.commitStatus === 'persisted'), `Persisted diagnostics missing: ${JSON.stringify(ui.diagnostics)}`);

  // Advance to review 2.
  const firstQuestionId = ui.questionId;
  await clickNext(cdp);
  await waitFor(cdp, `window.__activeQuestionId && window.__activeQuestionId !== ${JSON.stringify(firstQuestionId)} && Boolean(document.querySelector('.operation-stage .prompt')) && !document.querySelector('.next-question-inline-btn')`, 'second review question');
  const secondQuestionId = await cdp.evaluate('window.__activeQuestionId');
  const secondUi = await readPersistenceUi(cdp);
  const secondPrompt = secondUi.prompt;
  assert(secondPrompt.includes('Найдите ноту'), `Second question must be a find task: ${secondPrompt}`);

  // Injected persistence failure: scheduler must not advance.
  await cdp.evaluate(`window.__persistenceTestHooks.failNextReviewCommit()`);
  await clickFindKey(cdp);
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="persistence-error-banner"]'))`, 'persistence error banner');
  ui = await readPersistenceUi(cdp);
  const failedEntry = [...ui.diagnostics].reverse().find(entry => entry.commitStatus === 'failed');
  assert(failedEntry && failedEntry.errorClass === 'InjectedPersistenceFailure', `Failed commit diagnostics wrong: ${JSON.stringify(ui.diagnostics)}`);
  logs = await readStore(cdp, 'reviewLogEvents');
  assert(logs.length === 1 && logs[0].reviewEventId === firstEventId, `Failed commit must not persist anything: ${JSON.stringify(logs)}`);
  screenshots.push(await saveScreenshot(cdp, '01-persistence-retry-banner.png'));

  // Next is blocked while the failed commit is unresolved.
  await clickNext(cdp);
  await delay(400);
  const blockedUi = await readPersistenceUi(cdp);
  assert(blockedUi.bannerVisible && blockedUi.retryVisible, 'Retry banner must stay visible while blocked.');
  assert(blockedUi.questionId === secondQuestionId, `Scheduler advanced before persistence: ${secondQuestionId} -> ${blockedUi.questionId}`);
  assert(blockedUi.prompt === secondPrompt, `Question changed while persistence is blocked: ${blockedUi.prompt}`);

  // Retry: same reviewEventId, exactly one event, scheduler resumes.
  await cdp.evaluate(`document.querySelector('[data-testid="persistence-retry-btn"]').click()`);
  await waitFor(cdp, `!document.querySelector('[data-testid="persistence-error-banner"]')`, 'banner cleared after retry');
  await waitFor(cdp, `window.__activeQuestionId && window.__activeQuestionId !== ${JSON.stringify(secondQuestionId)}`, 'scheduler resumed after retry');
  logs = await readStore(cdp, 'reviewLogEvents');
  assert(logs.length === 2, `Retry must persist exactly one additional event: ${JSON.stringify(logs)}`);
  const timestamps = new Set(logs.map(entry => entry.ts));
  assert(timestamps.size === 1 && timestamps.has(FROZEN_NOW), `Both reviews must share the synthetic timestamp: ${JSON.stringify(logs)}`);
  const eventIds = new Set(logs.map(entry => entry.reviewEventId));
  assert(eventIds.size === 2, `Same-ts reviews must have distinct event ids: ${JSON.stringify(logs)}`);
  evidence.sameMsProof = {
    frozenTimestamp: FROZEN_NOW,
    eventCount: logs.length,
    timestamps: [...timestamps],
    reviewEventIds: [...eventIds]
  };
  ui = await readPersistenceUi(cdp);
  const retriedEntry = [...ui.diagnostics].reverse().find(entry => entry.commitStatus === 'retry_succeeded');
  assert(retriedEntry && retriedEntry.retryCount === 1 && retriedEntry.reviewEventId === failedEntry.reviewEventId,
    `Retry must reuse the same reviewEventId: ${JSON.stringify(ui.diagnostics)}`);
  evidence.failureRetryProof = {
    failedErrorClass: failedEntry.errorClass,
    failedReviewEventId: failedEntry.reviewEventId,
    retryCount: retriedEntry.retryCount,
    reusedSameReviewEventId: retriedEntry.reviewEventId === failedEntry.reviewEventId,
    schedulerStayedOnFailedQuestion: true,
    schedulerAdvancedAfterRetry: true,
    finalEventCount: logs.length
  };
  const cards = await readStore(cdp, 'cards');
  const reviewedCards = cards.filter(card => card.id === 'find:C' || card.id === 'find:D');
  const untouchedCard = cards.find(card => card.id === 'find:E');
  assert(reviewedCards.length === 2 && reviewedCards.every(card => card.reps === 2),
    `Retried card transition must persist exactly once per card: ${JSON.stringify(reviewedCards)}`);
  assert(untouchedCard && untouchedCard.reps === 1, `Unanswered card must stay at reps 1: ${JSON.stringify(untouchedCard)}`);
  screenshots.push(await saveScreenshot(cdp, '02-after-retry-advance.png'));

  // Reload: persisted state stays consistent, no duplicate events.
  await cdp.send('Page.navigate', { url: previewUrl });
  await waitFor(cdp, `document.querySelectorAll('.top-nav-btn').length === 9`, 'reloaded application');
  await waitFor(cdp, `document.querySelector('.operation-stage')`, 'task after reload');
  const logsAfterReload = await readStore(cdp, 'reviewLogEvents');
  assert(logsAfterReload.length === 2, `Reload must keep exactly two events: ${JSON.stringify(logsAfterReload)}`);
  assert(new Set(logsAfterReload.map(entry => entry.reviewEventId)).size === 2, 'Reload must keep distinct event ids.');
  const cardsAfterReload = await readStore(cdp, 'cards');
  const persistedFindCards = cardsAfterReload.filter(card => (card.id === 'find:C' || card.id === 'find:D') && card.reps === 2);
  assert(persistedFindCards.length === 2, `Reload must keep both card transitions: ${JSON.stringify(cardsAfterReload.filter(card => card.id.startsWith('find:')))}`);
  evidence.reloadProof = {
    eventCount: logsAfterReload.length,
    distinctEventIds: new Set(logsAfterReload.map(entry => entry.reviewEventId)).size,
    findCards: cardsAfterReload
      .filter(card => card.id.startsWith('find:'))
      .map(card => ({ id: card.id, reps: card.reps }))
  };

  const runtimeExceptions = cdp.runtimeExceptions;
  const consoleErrors = cdp.consoleErrors.filter(message => !message.includes('favicon'));
  assert(runtimeExceptions.length === 0, `Runtime exceptions: ${runtimeExceptions.join(' | ')}`);
  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);

  await mkdir(screenshotDir, { recursive: true });
  for (const shot of screenshots) {
    await writeFile(path.join(screenshotDir, shot.fileName), shot.bytes);
  }
  await writeFile(
    path.join(path.dirname(screenshotDir), 'persistence-evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n'
  );
  console.info(`Persistence integrity smoke passed with ${screenshots.length} screenshots.`);
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

