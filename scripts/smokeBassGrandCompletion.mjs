import { spawn, execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = path.join(projectDir, 'acceptance', 'stabilization', 'stabilization-profile.seed.json');
const seed = JSON.parse(await readFile(seedPath, 'utf8'));
const appUrl = process.env.PIANO_TRAINER_APP_URL || 'http://127.0.0.1:5175/piano-key-trainer/';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-review-smoke-'));
const profileDir = path.join(tempRoot, 'chrome-profile');
const portFile = path.join(profileDir, 'DevToolsActivePort');
const execFileAsync = promisify(execFile);
let chrome;
let socket;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const learningServer = await createServer({
  configFile: false,
  root: projectDir,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true }
});

let bassProgress;
let bassCompletionProgress;
try {
  const learning = await learningServer.ssrLoadModule('/src/core/learning/index.ts');
  const {
    BASS_GRAND_ITEM_IDS,
    BASS_NOTE_ACQUISITION_ORDER,
    BLACK_KEY_ACQUISITION_ORDER,
    EAR_ACQUISITION_ORDER,
    FIRST_RUN_CF_ITEM_IDS,
    MILESTONE_3D_ITEM_IDS,
    NOTATION_ACQUISITION_ORDER,
    WHITE_KEY_CURRICULUM_ITEM_IDS,
    createInitialLearningProgress,
    getBassNoteCurriculumItemId,
    getNoteCurriculumItemId,
    getNoteMixCurriculumItemId,
    isCoreCurriculumComplete,
    markFsrsActivated,
    markMixReady,
    recordModelCompleted
  } = learning;
  const completedProgress = new Map();
  const now = Date.now() - 30_000;
  const markDone = id => {
    const base = createInitialLearningProgress(id, now);
    completedProgress.set(id, {
      ...markFsrsActivated(markMixReady(recordModelCompleted(base, now), now), now),
      guidedSuccesses: 2,
      independentUnhintedSuccesses: 5,
      contexts: []
    });
  };

  for (const id of Object.values(FIRST_RUN_CF_ITEM_IDS)) markDone(id);
  for (const note of ['D', 'E', 'B', 'G', 'A']) {
    markDone(getNoteCurriculumItemId(note));
    markDone(getNoteMixCurriculumItemId(note));
  }
  for (const id of Object.values(WHITE_KEY_CURRICULUM_ITEM_IDS)) markDone(id);
  for (const note of BLACK_KEY_ACQUISITION_ORDER) markDone(`curriculum-black:${note}`);
  for (const note of NOTATION_ACQUISITION_ORDER) markDone(`curriculum-notation:${note}`);
  for (const note of EAR_ACQUISITION_ORDER) markDone(`curriculum-ear:${note}`);
  for (const id of Object.values(MILESTONE_3D_ITEM_IDS)) markDone(id);
  assert(isCoreCurriculumComplete({ learningProgress: completedProgress }), 'The synthetic core-curriculum fixture is incomplete.');

  const retainedProgress = seed.learningProgress.filter(record =>
    !record.id.startsWith('advanced-bass:') &&
    !record.id.startsWith('advanced-bass-note:') &&
    !record.id.startsWith('advanced-grand:') &&
    !record.id.startsWith('advanced-bass-module:')
  );
  bassProgress = [
    ...retainedProgress,
    ...completedProgress.values(),
    {
      ...createInitialLearningProgress('advanced-bass:orientation', now),
      state: 'retention',
      modelCompleted: true,
      guidedSuccesses: 1,
      independentUnhintedSuccesses: 1,
      contexts: []
    },
    {
      ...createInitialLearningProgress('advanced-bass-note:F', now),
      state: 'mixReady',
      modelCompleted: true,
      guidedSuccesses: 1,
      independentUnhintedSuccesses: 3,
      contexts: []
    }
  ];
  const completedBassRecords = [
    {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.ORIENTATION, now),
      state: 'retention', modelCompleted: true, guidedSuccesses: 1,
      independentUnhintedSuccesses: 1, contexts: []
    },
    ...BASS_NOTE_ACQUISITION_ORDER.map(note => ({
      ...createInitialLearningProgress(getBassNoteCurriculumItemId(note), now),
      state: 'retention', modelCompleted: true, guidedSuccesses: 2,
      independentUnhintedSuccesses: 3, contexts: []
    })),
    {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.FINAL_MIX, now),
      state: 'retention', modelCompleted: true, guidedSuccesses: 2,
      independentUnhintedSuccesses: 2, contexts: []
    },
    {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, now),
      state: 'retention', modelCompleted: true, guidedSuccesses: 1,
      independentUnhintedSuccesses: 1, contexts: []
    },
    {
      ...createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER, now),
      state: 'qualifying', modelCompleted: true, guidedSuccesses: 14,
      independentUnhintedSuccesses: 11, contexts: ['clef:bass', 'clef:treble']
    }
  ];
  bassCompletionProgress = [...retainedProgress, ...completedProgress.values(), ...completedBassRecords];
} finally {
  await learningServer.close();
}

const cards = structuredClone(seed.cards);
const bassCard = cards.find(card => card.id === 'notationBassToKey:F');
assert(bassCard, 'The sanitized smoke seed does not contain the Bass F card.');
Object.assign(bassCard, {
  memoryState: 'new',
  stability: null,
  difficulty: null,
  dueAt: 0,
  lastReviewAt: 0,
  firstSeenAt: 0,
  reps: 0,
  lapses: 0,
  lastGrade: null,
  stats: {
    trials: 0,
    firstCorrect: 0,
    firstWrong: 0,
    hints: 0,
    recentScheduledSuccesses: 0,
    scheduledSuccesses: 0,
    practiceTrials: 0
  }
});

async function waitForPortFile() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const lines = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/);
      if (lines[0]) return lines[0];
    } catch {}
    await delay(250);
  }
  throw new Error('Chrome did not expose a DevTools port.');
}

async function connectPage(port) {
  let target;
  for (let attempt = 0; attempt < 80; attempt++) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
    target = targets.find(item => item.type === 'page' && item.url.startsWith(appUrl));
    if (target?.webSocketDebuggerUrl) break;
    await delay(250);
  }
  assert(target?.webSocketDebuggerUrl, 'Chrome did not open the trainer page.');

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
      const result = await this.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Page evaluation failed');
      }
      return result.result?.value;
    }
  };
}

async function waitForPage(cdp, expression, description) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await cdp.evaluate(expression)) return;
    await delay(250);
  }
  const state = await cdp.evaluate(`JSON.stringify({
    body: document.body?.innerText?.slice(0, 500),
    activeNav: [...document.querySelectorAll('.top-nav-btn')].find(button => button.classList.contains('active'))?.innerText.trim(),
    pages: [...document.querySelectorAll('.workspace-page')].map(page => [page.dataset.page, page.classList.contains('active')]),
    bassButtons: [...document.querySelectorAll('[data-action="start-bass-module"]')].length,
    runtimeExceptions: ${JSON.stringify(cdp.runtimeExceptions)},
    consoleErrors: ${JSON.stringify(cdp.consoleErrors)}
  })`);
  throw new Error(`Timed out waiting for ${description}: ${state}`);
}

try {
  chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--window-size=1440,1000',
    appUrl
  ], { stdio: 'ignore', windowsHide: true });

  const port = await waitForPortFile();
  const cdp = await connectPage(port);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: appUrl });
  await delay(250);
  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'the mounted application');
  const globalNext = await cdp.evaluate(`
    [...document.querySelectorAll('.hero-toolbar button')]
      .some(button => button.innerText.trim() === 'Следующее задание')
  `);
  assert(!globalNext, 'The global next-question action is still visible.');

  const databaseSeed = {
    cards,
    reviewLogs: seed.reviewLogs,
    learningProgress: bassProgress
  };
  const seedResult = await cdp.evaluate(`((data) => new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['cards', 'reviewLogEvents', 'learningProgress'], 'readwrite');
      for (const name of ['cards', 'reviewLogEvents', 'learningProgress']) {
        const store = tx.objectStore(name);
        store.clear();
        for (const row of (data[name] ?? [])) store.put(row);
      }
      tx.oncomplete = () => { db.close(); resolve('seeded'); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }))(${JSON.stringify(databaseSeed)})`);
  assert(seedResult === 'seeded', 'Could not seed the isolated runtime profile.');
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'the reloaded runtime profile');
  await delay(1500);

  const programClicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('.top-nav-btn')].find(item => item.innerText.trim() === 'Программа');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(programClicked, 'Could not find the Program navigation button.');
  await waitForPage(cdp, `document.querySelector('.workspace-page[data-page="curriculum"].active') !== null`, 'the runtime Program page');
  const programState = await cdp.evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['learningProgress'], 'readonly');
      const progress = tx.objectStore('learningProgress');
      const phase3 = progress.get('curriculum-phase3:complete');
      const phase6 = progress.get('curriculum-phase6:complete');
      tx.oncomplete = () => {
        db.close();
        resolve({ phase3: phase3.result?.state, phase6: phase6.result?.state,
          bassStageStatus: document.querySelector('[data-stage-id="bass_clef"]')?.getAttribute('data-stage-status'),
          startButton: document.querySelector('button[data-action="start-bass-module"]')?.innerText.trim() });
      };
      tx.onerror = () => reject(tx.error);
    };
  })`);
  assert(programState.phase3 === 'retention' && programState.phase6 === 'retention', `The seeded core progress was not loaded: ${JSON.stringify(programState)}`);
  assert(programState.bassStageStatus !== 'locked', `The Bass module is still locked in the isolated profile: ${JSON.stringify(programState)}`);
  const started = await cdp.evaluate(`(() => {
    const button = document.querySelector('button[data-action="start-bass-module"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(started, 'The completed-core fixture did not offer the Bass module.');
  await waitForPage(cdp, 'document.querySelector(".advanced-notation-stage") !== null', 'the Bass delayed-check stage');

  const completionSeeded = await cdp.evaluate(`((progress) => new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['learningProgress'], 'readwrite');
      const store = tx.objectStore('learningProgress');
      store.clear();
      for (const row of progress) store.put(row);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }))(${JSON.stringify(bassCompletionProgress)})`);
  assert(completionSeeded, 'Could not seed the isolated Bass completion scenario.');
  await cdp.evaluate(`sessionStorage.setItem('piano-trainer-active-page', 'curriculum')`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForPage(cdp, `document.querySelector('.workspace-page[data-page="curriculum"].active') !== null`, 'the reloaded completion Program page');
  await delay(1500);
  const completionStarted = await cdp.evaluate(`(() => {
    const button = document.querySelector('button[data-action="start-bass-module"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(completionStarted, 'The completion fixture did not offer the Bass module.');
  await waitForPage(cdp, 'document.querySelector(".advanced-notation-stage") !== null', 'the Bass transfer stage');
  const beforeFinalAnswer = await cdp.evaluate(`({
    targetLabel: document.querySelector('.task-stage-eyebrow')?.innerText || '',
    progressLabel: [...document.querySelectorAll('.first-run-status-chip')].map(item => item.innerText.trim()),
    targetKeyExists: Boolean(document.querySelector('button[data-id="D3"]'))
  })`);
  assert(beforeFinalAnswer.progressLabel.some(label => label.includes('Задание 15 · минимум 12')), `The 15th transfer task is mislabeled: ${JSON.stringify(beforeFinalAnswer)}`);
  assert(beforeFinalAnswer.progressLabel.some(label => label.includes('Первые ответы: 79%')), `The completion fixture does not reproduce the 79% threshold state: ${JSON.stringify(beforeFinalAnswer)}`);
  assert(beforeFinalAnswer.targetKeyExists, 'The Bass transfer completion key is unavailable.');
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const screenshotPath = path.join(projectDir, 'acceptance', 'stabilization', 'screenshots', '03-bass-transfer-minimum.png');
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  const finalAnswerSubmitted = await cdp.evaluate(`(() => {
    const key = document.querySelector('button[data-id="D3"]');
    if (!key) return false;
    key.click();
    return true;
  })()`);
  assert(finalAnswerSubmitted, 'Could not submit the terminal Bass transfer answer.');
  await waitForPage(cdp, `document.body.innerText.includes('Поздравляем!') || document.body.innerText.includes('Не удалось сохранить завершение модуля')`, 'the Bass completion result');
  const completionText = await cdp.evaluate('document.body.innerText');
  assert(completionText.includes('Поздравляем!'), `Bass completion was not shown after the terminal answer: ${completionText.slice(0, 1200)} Console errors: ${cdp.consoleErrors.join(' | ')}`);
  const persistedCompletion = await cdp.evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['learningProgress'], 'readonly');
      const store = tx.objectStore('learningProgress');
      const transfer = store.get('advanced-grand:transfer');
      const complete = store.get('advanced-grand:complete');
      tx.oncomplete = () => { db.close(); resolve({ transfer: transfer.result, complete: complete.result }); };
      tx.onerror = () => reject(tx.error);
    };
  })`);
  assert(persistedCompletion.transfer?.state === 'retention' && persistedCompletion.complete?.state === 'retention', `Bass completion records were not persisted: ${JSON.stringify(persistedCompletion)}`);
  await cdp.evaluate(`sessionStorage.setItem('piano-trainer-active-page', 'curriculum')`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForPage(cdp, `document.querySelector('.workspace-page[data-page="curriculum"].active') !== null`, 'the Program page after Bass completion reload');
  await delay(1500);
  const reloadedBassStatus = await cdp.evaluate(`document.querySelector('[data-stage-id="bass_clef"]')?.getAttribute('data-stage-status') || ''`);
  assert(reloadedBassStatus === 'completed', `Bass completion did not survive reload: ${reloadedBassStatus}`);
  assert(cdp.runtimeExceptions.length === 0, `Application runtime exceptions: ${cdp.runtimeExceptions.join('; ')}`);

  process.stdout.write(JSON.stringify({
    browserRuntime: 'passed',
    topNavigationGlobalNextAction: 'absent',
    advancedModule: 'Bass',
    bassGrandCompletion: 'persisted and resolved completed after reload',
    terminalTransferLabel: beforeFinalAnswer.progressLabel[0],
    terminalTransferFirstAttemptAccuracy: beforeFinalAnswer.progressLabel[1],
    screenshot: screenshotPath
  }, null, 2) + '\n');
} catch (error) {
  process.stderr.write(`Bass completion smoke failed: ${error instanceof Error ? error.message : String(error)}\n`);
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (chrome && chrome.exitCode === null) {
    const browserExited = new Promise(resolve => chrome.once('exit', resolve));
    try {
      await execFileAsync('taskkill.exe', ['/PID', String(chrome.pid), '/T', '/F'], { windowsHide: true });
    } catch {}
    await Promise.race([browserExited, delay(3000)]);
  }
  const resolvedTempRoot = path.resolve(tempRoot);
  const resolvedSystemTemp = path.resolve(os.tmpdir());
  if (resolvedTempRoot.startsWith(`${resolvedSystemTemp}${path.sep}`) && path.basename(resolvedTempRoot).startsWith('piano-trainer-review-smoke-')) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await rm(resolvedTempRoot, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 4) throw error;
        await delay(250);
      }
    }
  }
}


