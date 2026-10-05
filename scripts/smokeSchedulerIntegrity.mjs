import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { promisify } from 'node:util';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previewEntry = path.join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const appRoute = '/piano-key-trainer/';
const DAY_MS = 86_400_000;
const execFileAsync = promisify(execFile);
let tempRoot;
let profileDir;
let portFile;
let chrome;
let preview;
let socket;

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

async function waitFor(cdp, expression, description, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await cdp.evaluate(expression)) return;
    await delay(100);
  }
  const state = await cdp.evaluate(`JSON.stringify({url:location.href,body:document.body?.innerText?.slice(0,700)})`);
  throw new Error(`Timed out waiting for ${description}: ${state}`);
}

async function createLearningProgress() {
  const server = await createViteServer({
    configFile: false,
    root: projectDir,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true }
  });
  try {
    const learning = await server.ssrLoadModule('/src/core/learning/index.ts');
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
      markFsrsActivated,
      markMixReady,
      recordModelCompleted
    } = learning;
    const now = Date.now() - 10_000;
    const progress = new Map();
    const markDone = id => {
      const record = createInitialLearningProgress(id, now);
      const completed = markFsrsActivated(markMixReady(recordModelCompleted(record, now), now), now);
      progress.set(id, {
        ...completed,
        state: 'retention',
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
    for (const note of BASS_NOTE_ACQUISITION_ORDER) markDone(getBassNoteCurriculumItemId(note));
    markDone(BASS_GRAND_ITEM_IDS.ORIENTATION);
    markDone(BASS_GRAND_ITEM_IDS.FINAL_MIX);
    markDone(BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION);
    markDone(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER);
    markDone(BASS_GRAND_ITEM_IDS.COMPLETE);

    const setContexts = (id, contexts, independentUnhintedSuccesses) => {
      const record = progress.get(id);
      if (record) progress.set(id, {
        ...record,
        contexts,
        ...(independentUnhintedSuccesses === undefined ? {} : { independentUnhintedSuccesses })
      });
    };
    setContexts(learning.FIRST_RUN_CF_ITEM_IDS.ANCHOR_C, ['region-C3', 'region-C4']);
    setContexts(learning.FIRST_RUN_CF_ITEM_IDS.ANCHOR_F, ['region-F3', 'region-F4']);
    for (const note of ['D', 'E', 'B', 'G', 'A']) {
      setContexts(getNoteCurriculumItemId(note), [`region-${note}3`, `region-${note}4`]);
    }
    setContexts(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE, ['identify:C', 'identify:D', 'identify:E']);
    setContexts(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB, ['identify:F', 'identify:B']);
    setContexts(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB, ['identify:F', 'identify:G', 'identify:A', 'identify:B']);
    setContexts(WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE, ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(note => `identify:${note}`));
    setContexts(WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE, ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(note => `${note}:1:region-${note}4`), 7);

    assert(learning.isCoreCurriculumComplete({ learningProgress: progress }), 'Synthetic scheduler profile does not complete all six curriculum phases.');
    assert(!learning.shouldEnterFirstRunCf({ learningProgress: progress }), 'Synthetic scheduler profile still enters First-Run CF.');
    assert(!learning.shouldEnterWhiteKeyCurriculum({ learningProgress: progress }), 'Synthetic scheduler profile still enters the white-key curriculum.');
    assert(!learning.shouldEnterMilestone3dCurriculum({ learningProgress: progress }), 'Synthetic scheduler profile still enters the Milestone 3D curriculum.');
    return [...progress.values()];
  } finally {
    await server.close();
  }
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

async function seedDatabase(cdp, learningProgress, resetLogs = true) {
  const existingCards = await readStore(cdp, 'cards');
  const now = Date.now();
  const cards = existingCards.map(card => ({
    ...card,
    memoryState: 'review',
    stability: 6,
    difficulty: 4,
    dueAt: now + 30 * DAY_MS,
    lastReviewAt: now - 10 * DAY_MS,
    firstSeenAt: now - 30 * DAY_MS,
    reps: 5,
    lapses: 0,
    lastGrade: 3,
    stats: {
      trials: 5,
      firstCorrect: 5,
      firstWrong: 0,
      hints: 0,
      recentScheduledSuccesses: 5,
      scheduledSuccesses: 5,
      practiceTrials: 0
    }
  }));
  let target = cards.find(card => card.id === 'soundToKey:G');
  if (!target) {
    target = {
      id: 'soundToKey:G', skill: 'soundToKey', note: 'G', memoryState: 'review',
      stability: 6, difficulty: 4, dueAt: now - 60_000, lastReviewAt: now - 10 * DAY_MS,
      firstSeenAt: now - 30 * DAY_MS, reps: 5, lapses: 0, lastGrade: 3,
      stats: { trials: 5, firstCorrect: 5, firstWrong: 0, hints: 0, recentScheduledSuccesses: 5, scheduledSuccesses: 5, practiceTrials: 0 }
    };
    cards.push(target);
  } else {
    target.dueAt = now - 60_000;
  }
  const payload = { cards, learningProgress, resetLogs };
  const seeded = await cdp.evaluate(`((data) => new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['cards','reviewLogs','learningProgress','settings'], 'readwrite');
      for (const row of data.cards) tx.objectStore('cards').put(row);
      if (data.resetLogs) tx.objectStore('reviewLogs').clear();
      tx.objectStore('learningProgress').clear();
      for (const row of data.learningProgress) tx.objectStore('learningProgress').put(row);
      tx.objectStore('settings').put({key:'userSettings',value:{sessionPreset:'normal',level:'white',mode:'smart',autoAdvanceDelaySeconds:0,desiredRetention:0.9,maxIntervalDays:120,relearningSeconds:45,newPitchClassesPerSession:2,useLatencyGrading:true,notationClef:'treble'}});
      tx.oncomplete = () => {
        localStorage.setItem('piano-key-trainer-settings', JSON.stringify({sessionPreset:'normal',level:'white',mode:'smart',autoAdvanceDelaySeconds:0,desiredRetention:0.9,maxIntervalDays:120,relearningSeconds:45,newPitchClassesPerSession:2,useLatencyGrading:true,notationClef:'treble'}));
        db.close(); resolve(true);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }))(${JSON.stringify(payload)})`);
  assert(seeded, 'Could not seed the isolated synthetic runtime profile.');
  const freshUrl = `${await cdp.evaluate('location.origin + location.pathname')}?schedulerSmokeSeed=${Date.now()}`;
  await cdp.send('Page.navigate', { url: freshUrl });
  await waitFor(cdp, `location.href === ${JSON.stringify(freshUrl)} && document.readyState === 'complete' && document.querySelectorAll('.top-nav-btn').length === 9`, 'reloaded synthetic profile', 160);
  await cdp.evaluate(`(() => [...document.querySelectorAll('.top-nav-btn')].find(item=>item.innerText.trim()==='Тренировка')?.click())()`);
  await waitFor(cdp, `document.querySelector('[data-page="practice"].active') && document.querySelector('[data-page="practice"].active').className.includes('practice-mode-soundToKey')`, 'the sole due sound-to-key task', 160);
  await delay(150);
}

async function changeSelect(cdp, selector, value) {
  const changed = await cdp.evaluate(`(() => {
    const element = document.querySelector('${selector}');
    if (!element) return false;
    element.value = '${value}';
    element.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  })()`);
  assert(changed, `Could not change ${selector} to ${value}.`);
}

async function openSettings(cdp) {
  await cdp.evaluate(`document.querySelector('button[aria-label="Настройки"]')?.click()`);
  await waitFor(cdp, `!document.querySelector('#settingsDrawer')?.classList.contains('hidden')`, 'settings drawer');
}

async function closeSettings(cdp) {
  await cdp.evaluate(`document.querySelector('#settingsDrawer .settings-close')?.click()`);
  await waitFor(cdp, `document.querySelector('#settingsDrawer')?.classList.contains('hidden')`, 'settings drawer close');
}

async function waitForSoundTask(cdp) {
  await waitFor(cdp, `document.querySelector('[data-page="practice"].active')?.className.includes('practice-mode-soundToKey') && document.querySelector('button[data-id="G4"]')`, 'sound-to-key G task');
}

async function clickKey(cdp, keyId) {
  await cdp.evaluate(`document.querySelector('button[data-id="${keyId}"]')?.click()`);
}

async function clickNext(cdp) {
  await cdp.evaluate(`document.querySelector('.next-question-inline-btn')?.click()`);
}

async function captureDiagnostics(cdp) {
  await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('.top-nav-btn')].find(item => item.innerText.trim() === 'Диагностика');
    button?.click();
  })()`);
  await waitFor(cdp, `document.querySelector('[data-page="diagnostics"].active')`, 'Diagnostics page');
  await cdp.evaluate(`document.querySelector('[data-testid="download-diagnostics-json"]')?.click()`);
  await waitFor(cdp, `Boolean(window.__schedulerDiagnosticsExport)`, 'diagnostics JSON export');
  return cdp.evaluate('window.__schedulerDiagnosticsExport');
}

const exportCaptureScript = `(() => {
  window.__schedulerDiagnosticsExport = null;
  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {
    if (blob?.type === 'application/json') {
      blob.text().then(text => { try { window.__schedulerDiagnosticsExport = JSON.parse(text); } catch {} });
    }
    return createObjectURL(blob);
  };
})();`;
const fakeMidiScript = `(() => {
  const input = {id:'scheduler-smoke-midi',name:'Synthetic MIDI',manufacturer:'Codex',state:'connected',connection:'open',type:'input',onmidimessage:null};
  const access = {inputs:new Map([[input.id,input]]),onstatechange:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});
})();`;

try {
  const learningProgress = await createLearningProgress();
  const previewPort = await findFreePort();
  const previewUrl = `http://127.0.0.1:${previewPort}${appRoute}`;
  preview = spawn(process.execPath, [previewEntry, 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
    cwd: projectDir,
    stdio: 'ignore',
    windowsHide: true
  });
  let previewReady = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(previewUrl);
      if (response.ok) { previewReady = true; break; }
    } catch {}
    if (preview.exitCode !== null) throw new Error(`Production preview exited with code ${preview.exitCode}.`);
    await delay(150);
  }
  assert(previewReady, `Production preview did not become ready at ${previewUrl}.`);

  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-scheduler-integrity-'));
  profileDir = path.join(tempRoot, 'chrome-profile');
  portFile = path.join(profileDir, 'DevToolsActivePort');
  await mkdir(profileDir, { recursive: true });
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--window-size=1440,1000', 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  const cdp = await connectPage(await waitForPortFile());
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `${exportCaptureScript}\n${fakeMidiScript}` });
  await cdp.send('Page.navigate', { url: previewUrl });
  await waitFor(cdp, `document.querySelectorAll('.top-nav-btn').length === 9`, 'production application');
  await waitFor(cdp, `document.querySelector('.keyboard-card') && document.querySelector('.top-nav-btn')`, 'initialized application');
  await seedDatabase(cdp, learningProgress);

  // Recreate rapid All Due setting changes while one question is unanswered.
  await openSettings(cdp);
  await cdp.evaluate(`(() => {
    for (const [selector,value] of [['#presetSelect','due'],['#levelSelect','all'],['#clefSelect','bass']]) {
      const element = document.querySelector(selector);
      element.value = value;
      element.dispatchEvent(new Event('change',{bubbles:true}));
    }
  })()`);
  await waitForSoundTask(cdp);
  const settingsTrace = await captureDiagnostics(cdp);
  const currentSessionId = settingsTrace.schedulerTrace.recentTraces.at(-1)?.sessionId;
  const currentSessionActivations = settingsTrace.schedulerTrace.recentTraces.filter(item => item.sessionId === currentSessionId);
  const currentSessionRounds = settingsTrace.schedulerTrace.nextRoundEvents.filter(item => item.sessionId === currentSessionId);
  assert(currentSessionActivations.length === 1, `Rapid settings changes activated ${currentSessionActivations.length} tasks in one All Due session.`);
  assert(currentSessionRounds.filter(item => item.disposition === 'suppressed_active_question').length === 2, `Expected two duplicate-round suppressions, got ${JSON.stringify(currentSessionRounds)}.`);
  assert(settingsTrace.schedulerTrace.warnings.length === 0, 'The fixed rapid-settings scenario emitted a scheduler warning.');

  // Correct response must persist before the next scheduler decision; balanced rotation must move on.
  await cdp.evaluate(`(() => [...document.querySelectorAll('.top-nav-btn')].find(item=>item.innerText.trim()==='Тренировка')?.click())()`);
  await waitFor(cdp, `document.querySelector('[data-page="practice"].active')`, 'Practice page after settings trace');
  await changeSelect(cdp, '#presetSelect', 'normal');
  await waitFor(cdp, `!document.querySelector('.session-strip .session-meta b')?.innerText.includes('Все повторы')`, 'Balanced session after changing preset');
  await waitForSoundTask(cdp);
  await closeSettings(cdp);
  const logsBeforeCorrect = (await readStore(cdp, 'reviewLogs')).length;
  await clickKey(cdp, 'G4');
  await waitFor(cdp, `document.querySelector('.feedback')?.innerText.includes('Правильно')`, 'correct G4 feedback');
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await readStore(cdp, 'reviewLogs')).length === logsBeforeCorrect + 1) break;
    await delay(100);
  }
  const correctCard = (await readStore(cdp, 'cards')).find(card => card.id === 'soundToKey:G');
  assert((await readStore(cdp, 'reviewLogs')).length === logsBeforeCorrect + 1, 'Correct G4 did not persist exactly one ReviewLog.');
  assert(correctCard?.dueAt > Date.now(), 'Correct G4 did not move the due date into the future.');
  const cardDueAfterCorrect = correctCard.dueAt;
  await clickNext(cdp);
  await waitFor(cdp, `document.querySelector('[data-page="practice"].active') && document.querySelector('.operation-stage') && !document.querySelector('.next-question-inline-btn')`, 'balanced next card after saved review');
  const correctDiagnostics = await captureDiagnostics(cdp);
  const correctTrace = correctDiagnostics.schedulerTrace;
  const correctTransition = correctTrace.reviewTransitions.find(item => item.cardId === 'soundToKey:G');
  const correctOriginDecision = correctTrace.recentTraces.find(item => item.activationId === correctTransition?.activationId);
  const correctNextDecision = correctTrace.recentTraces.at(-1);
  assert(correctTransition?.persisted && correctTransition.persistenceStatus === 'saved', 'The correct-review transition is not marked persisted.');
  assert(Boolean(correctOriginDecision) && correctOriginDecision?.questionInstanceId === correctTransition.questionInstanceId, `The review transition is not linked to its originating activation: ${JSON.stringify({ correctTransition, recentTraces: correctTrace.recentTraces.slice(-4) })}`);
  assert(correctNextDecision?.selected !== 'soundToKey:G', `Balanced next selection immediately repeated the reviewed card: ${JSON.stringify({ correctTransition, correctNextDecision, recentTraces: correctTrace.recentTraces.slice(-5), recentRounds: correctTrace.nextRoundEvents.slice(-8) })}`);
  assert(correctNextDecision?.previousReviewTransitionId === correctTransition.transitionId, 'The next decision does not link to the persisted review transition.');
  const correctFlow = { reviewLogDelta: 1, cardDueAtAfter: cardDueAfterCorrect, transitionId: correctTransition.transitionId, nextSelected: correctNextDecision.selected };

  // A wrong first response followed by a corrective response must create one FSRS mutation only.
  await seedDatabase(cdp, learningProgress);
  await clickKey(cdp, 'F4');
  await waitFor(cdp, `document.querySelector('.feedback')?.innerText.includes('Ошибка')`, 'wrong first-answer feedback');
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await readStore(cdp, 'reviewLogs')).length === 1) break;
    await delay(100);
  }
  const wrongFirstCard = (await readStore(cdp, 'cards')).find(card => card.id === 'soundToKey:G');
  assert((await readStore(cdp, 'reviewLogs')).length === 1, 'Wrong first response did not persist one ReviewLog.');
  assert(wrongFirstCard?.lastGrade === 1 && wrongFirstCard.dueAt > Date.now(), 'Wrong first response did not persist its single Again scheduling transition.');
  const dueAfterWrong = wrongFirstCard.dueAt;
  await clickKey(cdp, 'G4');
  await waitFor(cdp, `document.querySelector('.feedback')?.innerText.includes('Исправлено')`, 'corrective answer feedback');
  await delay(250);
  const wrongCorrectiveLogs = await readStore(cdp, 'reviewLogs');
  const afterCorrectiveCard = (await readStore(cdp, 'cards')).find(card => card.id === 'soundToKey:G');
  assert(wrongCorrectiveLogs.length === 1, `Corrective answer added another ReviewLog (${wrongCorrectiveLogs.length}).`);
  assert(afterCorrectiveCard?.dueAt === dueAfterWrong && afterCorrectiveCard.lastGrade === 1, 'Corrective answer mutated the FSRS schedule a second time.');
  await clickNext(cdp);
  await waitFor(cdp, `document.querySelector('[data-page="practice"].active') && document.querySelector('.operation-stage') && !document.querySelector('.next-question-inline-btn')`, 'post-correction balanced task');
  const wrongCorrective = { reviewLogCount: wrongCorrectiveLogs.length, grade: wrongCorrectiveLogs[0].grade, dueAtAfterFirst: dueAfterWrong, dueAtAfterCorrection: afterCorrectiveCard.dueAt };

  // Start from a clean synthetic profile and stress ten unanswered session restarts.
  await seedDatabase(cdp, learningProgress);
  const unansweredRestartSessions = [];
  for (let index = 0; index < 10; index++) {
    await cdp.evaluate(`document.querySelector('.end-session-btn')?.click()`);
    await waitFor(cdp, `document.querySelector('[data-testid="btn-new-session"]')`, `end unanswered session ${index + 1}`);
    await cdp.evaluate(`document.querySelector('[data-testid="btn-new-session"]')?.click()`);
    await waitForSoundTask(cdp);
    unansweredRestartSessions.push(await cdp.evaluate(`document.querySelector('.session-strip .session-meta b')?.innerText || ''`));
  }
  const finalDiagnostics = await captureDiagnostics(cdp);
  const finalTrace = finalDiagnostics.schedulerTrace;
  const finalDueActivations = finalTrace.recentTraces.filter(item => item.selected === 'soundToKey:G' && item.reason === 'scheduled_due');
  const finalSessionIds = new Set(finalDueActivations.map(item => item.sessionId));
  assert(finalDueActivations.length === 11, `Expected the first session plus 10 unanswered restarts, got ${finalDueActivations.length} due activations.`);
  assert(finalSessionIds.size === 11, `The unanswered restarts did not create 11 separate sessions: ${finalSessionIds.size}.`);
  assert(new Set(finalDueActivations.map(item => item.questionInstanceId)).size === 11, 'A question instance was reused across unanswered restarts.');
  assert(finalTrace.warnings.length === 0, `Fresh diagnostics contains scheduler warnings: ${JSON.stringify(finalTrace.warnings)}`);
  assert(finalTrace.nextRoundEvents.every(item => item.disposition === 'activated'), 'A restart round did not resolve to exactly one activation.');
  assert(finalDiagnostics.diagnosticsSchemaVersion === 2, 'Fresh diagnostics export did not use schema v2.');
  assert(finalDiagnostics.integrityChecks.schedulerReselectionWithoutReview.length === 0, 'Fresh diagnostics reported a scheduled reselect warning.');
  assert(finalDiagnostics.integrityChecks.duplicateTaskActivation.length === 0, 'Fresh diagnostics reported a duplicate activation warning.');
  assert(finalDiagnostics.reviewHistory.recentEventsCount === 0, 'The sanitized final profile unexpectedly contains review history.');
  await writeFile(path.join(projectDir, 'diagnostics-after-scheduler-fix.json'), JSON.stringify(finalDiagnostics, null, 2) + '\n', 'utf8');
  const acceptanceDir = path.join(projectDir, 'acceptance', 'scheduler-integrity');
  await mkdir(acceptanceDir, { recursive: true });

  assert(cdp.runtimeExceptions.length === 0, `Production runtime exceptions: ${JSON.stringify(cdp.runtimeExceptions)}`);
  assert(cdp.consoleErrors.length === 0, `Production console errors: ${JSON.stringify(cdp.consoleErrors)}`);
  const smokeResult = {
    status: 'PASS',
    previewUrl,
    settingsBurst: { activationCountInAllDueSession: currentSessionActivations.length, suppressedDuplicateRounds: 2, warnings: settingsTrace.schedulerTrace.warnings.length },
    correctReview: correctFlow,
    wrongThenCorrective: wrongCorrective,
    unansweredRestartStress: { activations: finalDueActivations.length, sessions: finalSessionIds.size, diagnosticsWarnings: finalTrace.warnings.length },
    diagnosticsFile: 'diagnostics-after-scheduler-fix.json',
    runtimeExceptions: cdp.runtimeExceptions,
    consoleErrors: cdp.consoleErrors
  };
  await writeFile(path.join(acceptanceDir, 'production-smoke-result.json'), JSON.stringify(smokeResult, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(smokeResult, null, 2) + '\n');
} catch (error) {
  process.stderr.write(`Scheduler integrity production smoke failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (chrome && chrome.exitCode === null) {
    const browserExited = new Promise(resolve => chrome.once('exit', resolve));
    try { await execFileAsync('taskkill.exe', ['/PID', String(chrome.pid), '/T', '/F'], { windowsHide: true }); } catch {}
    await Promise.race([browserExited, delay(3000)]);
  }
  if (preview && preview.exitCode === null) {
    const previewExited = new Promise(resolve => preview.once('exit', resolve));
    try { await execFileAsync('taskkill.exe', ['/PID', String(preview.pid), '/T', '/F'], { windowsHide: true }); } catch {}
    await Promise.race([previewExited, delay(3000)]);
  }
  if (tempRoot) {
    const resolvedTempRoot = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    if (resolvedTempRoot.startsWith(`${resolvedSystemTemp}${path.sep}`) && path.basename(resolvedTempRoot).startsWith('piano-trainer-scheduler-integrity-')) {
      await rm(resolvedTempRoot, { recursive: true, force: true });
    }
  }
}
