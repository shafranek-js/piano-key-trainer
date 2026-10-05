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
const screenshotDir = path.join(projectDir, 'acceptance', 'audit-stabilization-a', 'screenshots');

const RHYTHM_CHORD_KEYS = {
  C: ['C4', 'E4', 'G4'],
  G: ['G3', 'B3', 'D4'],
  'G/B': ['B3', 'D4', 'G4'],
  Am: ['A3', 'C4', 'E4'],
  F: ['F3', 'A3', 'C4']
};
const WRONG_CHORD_ID = 'G';

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

async function createSyntheticProfile() {
  const server = await createViteServer({
    configFile: false,
    root: projectDir,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true }
  });
  try {
    const learning = await server.ssrLoadModule('/src/core/learning/index.ts');
    const bass = await server.ssrLoadModule('/src/core/learning/bassGrandStaff.ts');
    const intervals = await server.ssrLoadModule('/src/core/learning/intervals.ts');
    const triads = await server.ssrLoadModule('/src/core/learning/triads.ts');
    const inversions = await server.ssrLoadModule('/src/core/learning/chordInversions.ts');
    const harmony = await server.ssrLoadModule('/src/core/learning/harmony.ts');
    const chordRhythm = await server.ssrLoadModule('/src/core/learning/chordRhythm.ts');
    const fixture = await server.ssrLoadModule('/tests/fixtures/stabilizationProfile.ts');
    const profile = fixture.createSanitizedStabilizationProfile();
    const progress = new Map(profile.learningProgress);
    const now = Date.now() - 10_000;
    const complete = id => {
      const record = learning.createInitialLearningProgress(id, now);
      const noteMatch = id.match(/^curriculum-note:([DEBGA])$/);
      const noteContexts = noteMatch ? [`region-${noteMatch[1]}3`, `region-${noteMatch[1]}4`] : [];
      const identifyNotes = {
        'curriculum-identify:CDE': ['C', 'D', 'E'],
        'curriculum-identify:FB': ['F', 'B'],
        'curriculum-identify:FGAB': ['F', 'G', 'A', 'B'],
        'curriculum-identify:ALL_WHITE': ['C', 'D', 'E', 'F', 'G', 'A', 'B']
      }[id] ?? [];
      const contexts = noteContexts.length
        ? noteContexts
        : identifyNotes.map(note => `identify:${note}`);
      progress.set(id, {
        ...record,
        state: 'retention',
        modelCompleted: true,
        guidedSuccesses: 2,
        independentUnhintedSuccesses: 8,
        contexts,
        updatedAt: now
      });
    };
    for (const id of [
      ...learning.FIRST_RUN_CF_ALL_ITEM_IDS,
      ...learning.WHITE_KEY_CURRICULUM_ALL_ITEM_IDS,
      ...learning.MILESTONE_3D_ALL_ITEM_IDS,
      bass.BASS_GRAND_ITEM_IDS.COMPLETE,
      intervals.INTERVAL_ITEM_IDS.COMPLETE,
      triads.TRIAD_ITEM_IDS.COMPLETE,
      inversions.INVERSION_ITEM_IDS.COMPLETE,
      harmony.HARMONY_ITEM_IDS.COMPLETE
    ]) complete(id);

    assert(harmony.getHarmonyModuleStatus(progress) === 'completed', 'Synthetic profile does not complete Harmony.');
    assert(
      chordRhythm.getChordRhythmModuleStatus(progress) === 'not_started',
      'Synthetic profile unexpectedly reports Chord Rhythm progress.'
    );

    const base = new Map(progress);
    const sessionSnapshot = (snapshot) => {
      const next = new Map(base);
      const record = learning.createInitialLearningProgress(chordRhythm.CHORD_RHYTHM_ITEM_IDS.SESSION, now);
      next.set(record.id, { ...record, modelCompleted: true, chordRhythmSnapshot: snapshot });
      return [...next.values()];
    };
    const assessment = (overrides = {}) => ({
      blockKind: 'initial',
      phase: 'active',
      trialIndex: 0,
      trialsCompleted: 0,
      correctFirstAttempts: 0,
      failedTrialIndexes: [],
      remediationTrialIndexes: [],
      remediationIndex: 0,
      remediationUsed: 0,
      pendingCorrective: false,
      scoredQuestionIds: [],
      ...overrides
    });

    const zeroStats = {
      trials: 0, firstCorrect: 0, firstWrong: 0, hints: 0,
      recentScheduledSuccesses: 0, scheduledSuccesses: 0, practiceTrials: 0
    };
    const cards = profile.cards.map(card => ({
      ...card,
      memoryState: 'new',
      stability: null,
      difficulty: null,
      dueAt: 0,
      lastReviewAt: 0,
      firstSeenAt: 0,
      reps: 0,
      lapses: 0,
      lastGrade: null,
      stats: { ...zeroStats }
    }));

    return {
      cards,
      now,
      profiles: {
        liveAssessment: sessionSnapshot({ stage: 'transferAssessment', sequenceIndex: 0, assessment: assessment() }),
        failingAssessment: sessionSnapshot({
          stage: 'transferAssessment',
          sequenceIndex: 0,
          assessment: assessment({
            trialIndex: 11,
            trialsCompleted: 11,
            correctFirstAttempts: 8,
            failedTrialIndexes: [0, 1, 4]
          })
        }),
        failedRetry: sessionSnapshot({
          stage: 'transferResult',
          sequenceIndex: 0,
          assessment: assessment({
            blockKind: 'retry',
            phase: 'failed',
            trialIndex: 0,
            trialsCompleted: 8,
            correctFirstAttempts: 1,
            failedTrialIndexes: [0, 1, 2, 3, 4, 5, 6],
            remediationUsed: 1
          })
        }),
        passedAssessment: sessionSnapshot({
          stage: 'transferResult',
          sequenceIndex: 0,
          assessment: assessment({
            phase: 'passed',
            trialIndex: 0,
            trialsCompleted: 12,
            correctFirstAttempts: 10,
            failedTrialIndexes: [2, 5]
          })
        })
      }
    };
  } finally {
    await server.close();
  }
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

async function waitFor(cdp, expression, description, attempts = 140) {
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
  const freshUrl = `${await cdp.evaluate('location.origin + location.pathname')}?m3kSeed=${Date.now()}`;
  await cdp.send('Page.navigate', { url: freshUrl });
  await waitFor(cdp, `location.href === ${JSON.stringify(freshUrl)} && document.readyState === 'complete' && document.querySelectorAll('.top-nav-btn').length === 9`, 'reloaded synthetic profile');
  // Let loadData finish its asynchronous session/module bootstrap before navigating.
  await delay(500);
}

async function saveScreenshot(cdp, fileName) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  return { fileName, bytes: Buffer.from(result.data, 'base64') };
}

async function openProgram(cdp) {
  await cdp.evaluate(`(() => [...document.querySelectorAll('.top-nav-btn')].find(button => button.innerText.trim() === 'Программа')?.click())()`);
  await waitFor(cdp, `document.querySelector('[data-page="curriculum"].active') !== null`, 'Program page');
}

async function startRoadmapModule(cdp, stageId, stageSelector) {
  await openProgram(cdp);
  const selected = await cdp.evaluate(`(() => {
    const card = document.querySelector(${JSON.stringify(`[data-stage-id="${stageId}"]`)});
    card?.click();
    return Boolean(card);
  })()`);
  assert(selected, `Program stage ${stageId} is missing.`);
  await waitFor(cdp, `Boolean(document.querySelector('.roadmap-action-btn'))`, `${stageId} module action`);
  await cdp.evaluate('document.querySelector(".roadmap-action-btn")?.click()');
  await waitFor(cdp, `Boolean(document.querySelector(${JSON.stringify(stageSelector)}))`, `${stageId} stage`);
}

async function clickPianoKeys(cdp, keyIds) {
  for (const keyId of keyIds) {
    const point = await cdp.evaluate(`(() => {
      const key = document.querySelector('.keyboard button[data-id="${keyId}"]');
      if (!key) return null;
      const rect = key.getBoundingClientRect();
      return { x:rect.left + rect.width / 2, y:rect.top + rect.height / 2 };
    })()`);
    assert(point, `On-screen piano key ${keyId} is missing.`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }
}

async function realClick(cdp, selector) {
  const found = await cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  assert(found, `Element ${selector} is missing.`);
  await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const point = await cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  assert(point, `Element ${selector} is missing.`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

async function runRhythmTrial(cdp, chordId) {
  const keys = RHYTHM_CHORD_KEYS[chordId];
  await cdp.evaluate(`(() => { for (const id of ${JSON.stringify(keys)}) document.querySelector('.keyboard button[data-id="' + id + '"]')?.click(); return true; })()`);
  await waitFor(cdp, `document.querySelector('[data-testid="rhythm-selected-count"]')?.innerText.includes('3 из 3')`, 'three rhythm keys selected');
  for (let attempt = 0; attempt < 5; attempt++) {
    await realClick(cdp, '[data-testid="rhythm-start-run"]');
    await delay(250);
    if (!(await cdp.evaluate(`Boolean(document.querySelector('[data-testid="rhythm-start-run"]'))`))) break;
  }
  const result = await cdp.evaluate(`new Promise(resolve => {
    const keyIds = ${JSON.stringify(keys)};
    const clickKey = id => document.querySelector('.keyboard button[data-id="' + id + '"]')?.click();
    const started = performance.now();
    let strikeCount = 0;
    let lastSubmittedBeat = null;
    const diag = () => {
      const stage = document.querySelector('[data-testid="chord-rhythm-stage"]');
      const submit = document.querySelector('[data-testid="rhythm-submit-chord"]');
      return {
        step: stage?.dataset.rhythmStep,
        feedback: stage?.querySelector('.rhythm-feedback')?.innerText || '',
        selected: stage?.querySelector('[data-testid="rhythm-selected-count"]')?.innerText || '',
        submitDisabled: submit ? submit.disabled : null,
        label: stage?.querySelector('.rhythm-count-label')?.innerText || '',
        beats: [...(stage?.querySelectorAll('[data-testid="rhythm-beat-indicator"] span') || [])].map(item => item.className),
        strikeCount
      };
    };
    const tick = () => {
      const stage = document.querySelector('[data-testid="chord-rhythm-stage"]');
      const startButton = document.querySelector('[data-testid="rhythm-start-run"]');
      const step = stage?.dataset.rhythmStep;
      if (strikeCount > 0 && (startButton || step === 'transferResult' || step === 'transferRemediation' || step === 'moduleComplete')) {
        resolve({ ok: true });
        return;
      }
      const active = document.querySelector('[data-testid="rhythm-beat-indicator"] .active');
      const label = document.querySelector('.rhythm-count-label')?.innerText || '';
      const submit = document.querySelector('[data-testid="rhythm-submit-chord"]');
      const beat = active?.innerText.trim();
      if (submit && (beat === '1' || beat === '3') && !label.includes('Приготовьтесь')) {
        if (submit.disabled) {
          for (const id of keyIds) clickKey(id);
        } else if (beat !== lastSubmittedBeat) {
          lastSubmittedBeat = beat;
          submit.click();
          strikeCount += 1;
        }
      }
      if (performance.now() - started > 16000) { resolve({ ok: false, diag: diag() }); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`);
  assert(result?.ok, `Rhythm run for ${chordId} did not finish: ${JSON.stringify(result?.diag)}`);
}

let screenshots = [];

try {
  const synthetic = await createSyntheticProfile();
  const previewPort = await findFreePort();
  const previewUrl = `http://127.0.0.1:${previewPort}${appRoute}`;
  preview = spawn(process.execPath, [previewEntry, 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
    cwd: projectDir, stdio: 'ignore', windowsHide: true
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

  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-m3k-smoke-'));
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
  await cdp.send('Page.navigate', { url: previewUrl });
  await waitFor(cdp, `document.querySelectorAll('.top-nav-btn').length === 9`, 'production application');

  // 1. Program shows #11 as the current available stage.
  await seedDatabase(cdp, {
    cards: synthetic.cards,
    learningProgress: synthetic.profiles.liveAssessment
  });
  await openProgram(cdp);
  await waitFor(
    cdp,
    `(document.querySelector('[data-stage-id="chord_rhythm"]')?.dataset.stageStatus === 'available' || document.querySelector('[data-stage-id="chord_rhythm"]')?.dataset.stageStatus === 'in_progress') && document.querySelector('[data-stage-id="chord_rhythm"]')?.classList.contains('is-current')`,
    'hydrated #11 Chord Rhythm status'
  );
  const roadmap = await cdp.evaluate(`(() => ({
    title:document.querySelector('[data-stage-id="chord_rhythm"] .step-card-title')?.innerText || '',
    status:document.querySelector('[data-stage-id="chord_rhythm"]')?.dataset.stageStatus || '',
    current:document.querySelector('[data-stage-id="chord_rhythm"]')?.classList.contains('is-current') || false,
    action:document.querySelector('.roadmap-action-btn')?.innerText || ''
  }))()`);
  assert(roadmap.title === 'Ритм аккордов' && (roadmap.status === 'available' || roadmap.status === 'in_progress') && roadmap.current, `Program did not expose #11 as current: ${JSON.stringify(roadmap)}`);
  assert(roadmap.action.includes('Начать') || roadmap.action.includes('Продолжить'), `Chord Rhythm Program card has no start action: ${JSON.stringify(roadmap)}`);
  screenshots.push(await saveScreenshot(cdp, '01-program-chord-rhythm-current.png'));

  // 2. Enter module and verify advanced-module exclusivity (visible module === input routing module).
  await startRoadmapModule(cdp, 'chord_rhythm', '[data-testid="chord-rhythm-stage"]');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferAssessment'`, 'seeded transfer assessment');
  await startRoadmapModule(cdp, 'intervals', '[data-testid="interval-stage"]');
  assert(await cdp.evaluate(`!document.querySelector('[data-testid="chord-rhythm-stage"]')`), 'Starting Intervals left a stale Chord Rhythm stage mounted.');
  await startRoadmapModule(cdp, 'chord_rhythm', '[data-testid="chord-rhythm-stage"]');
  assert(await cdp.evaluate(`!document.querySelector('[data-testid="interval-stage"]')`), 'Starting Chord Rhythm left a stale Interval stage mounted.');

  // 3. Wrong first attempt -> corrective requirement survives reload -> corrective run completes.
  await runRhythmTrial(cdp, 'G');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"] .rhythm-feedback.bad')?.innerText.includes('неверный')`, 'wrong chord feedback');
  await waitFor(cdp, `document.querySelector('[data-rhythm-step]') !== null`, 'rhythm stage after wrong attempt');
  await delay(400);
  const persistedCorrective = (await readStore(cdp, 'learningProgress')).find(record => record.id === 'advanced-chord-rhythm:session');
  assert(persistedCorrective?.chordRhythmSnapshot?.assessment?.pendingCorrective === true, `Pending corrective was not persisted: ${JSON.stringify(persistedCorrective?.chordRhythmSnapshot)}`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferAssessment'`, 'corrective state after reload');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="rhythm-start-run"]'))`, 'corrective run action after reload');
  await runRhythmTrial(cdp, 'C');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"] .rhythm-feedback.good')?.innerText.includes('Исправлено')`, 'corrective completion');
  const logsAfterCorrective = await readStore(cdp, 'reviewLogs');
  assert(logsAfterCorrective.length === 0, `Module assessment unexpectedly wrote FSRS review logs: ${JSON.stringify(logsAfterCorrective)}`);

  // 4. Finish the initial assessment below 80% -> remediation -> fresh eight-trial retry.
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.failingAssessment });
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferAssessment'`, 'failing assessment trial 12');
  await runRhythmTrial(cdp, WRONG_CHORD_ID);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"] .rhythm-feedback.bad') !== null`, 'failed trial feedback');
  // Complete the corrective replay for the failed trial; the assessment then resolves.
  await runRhythmTrial(cdp, 'F');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferResult'`, 'failed assessment result');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="rhythm-start-remediation"]'))`, 'remediation action');
  const failedUi = await cdp.evaluate(`document.querySelector('[data-testid="chord-rhythm-stage"]')?.innerText || ''`);
  assert(failedUi.includes('8 правильных первых попыток из 12'), `Failed assessment summary is incomplete: ${failedUi.slice(0, 300)}`);
  screenshots.push(await saveScreenshot(cdp, '02-failed-assessment-remediation.png'));

  await cdp.evaluate(`document.querySelector('[data-testid="rhythm-start-remediation"]')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferRemediation'`, 'focused remediation block');
  const remediationChords = ['C', 'G/B', 'C'];
  for (const [index, chordId] of remediationChords.entries()) {
    await runRhythmTrial(cdp, chordId);
    await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"] .rhythm-feedback.good')?.innerText.includes('Аккорд верный')`, `remediation ${index + 1} success`);
    if (index < remediationChords.length - 1) {
      await cdp.evaluate(`document.querySelector('[data-testid="chord-rhythm-stage"] .rhythm-actions .btn.btn-secondary')?.click()`);
      await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferRemediation'`, `remediation ${index + 2}`);
    }
  }
  await cdp.evaluate(`document.querySelector('[data-testid="chord-rhythm-stage"] .rhythm-actions .btn.btn-secondary')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferAssessment'`, 'fresh retry block');

  // 5. Failed retry is terminal and offers a working return to learning + exit.
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.failedRetry });
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferResult'`, 'failed retry result');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="rhythm-return-to-learning"]'))`, 'return-to-learning action');
  assert(await cdp.evaluate(`Boolean(document.querySelector('[data-testid="rhythm-exit-to-program"]'))`), 'Failed retry has no Program exit.');
  screenshots.push(await saveScreenshot(cdp, '03-failed-retry-exit.png'));

  await cdp.evaluate(`document.querySelector('[data-testid="rhythm-return-to-learning"]')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'oneChordPerBar'`, 'targeted guided rhythm step');
  const returnFeedback = await cdp.evaluate(`document.querySelector('[data-testid="chord-rhythm-stage"]')?.innerText || ''`);
  assert(returnFeedback.includes('слабом навыке'), `Return to learning did not explain the targeted focus: ${returnFeedback.slice(0, 300)}`);

  // 6. Passed assessment completes the module and exits without a page reload.
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.passedAssessment });
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferResult'`, 'passed assessment result');
  await cdp.evaluate(`document.querySelector('[data-testid="rhythm-complete-module"]')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'moduleComplete'`, 'module completion');
  const completionRecords = (await readStore(cdp, 'learningProgress')).filter(record => record.id.startsWith('advanced-chord-rhythm:'));
  assert(completionRecords.some(record => record.id === 'advanced-chord-rhythm:complete' && record.state === 'retention'), `Module completion was not persisted: ${JSON.stringify(completionRecords.map(record => [record.id, record.state]))}`);
  screenshots.push(await saveScreenshot(cdp, '04-module-complete-continue.png'));

  await cdp.evaluate(`document.querySelector('[data-testid="rhythm-continue-practice"]')?.click()`);
  await waitFor(cdp, `!document.querySelector('[data-testid="m3k-module-stage"]')`, 'Chord Rhythm module exit');
  await waitFor(cdp, `document.querySelector('[data-page="practice"].active') !== null`, 'practice page after exit');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="daily-rhythm-stage"]')) || Boolean(document.querySelector('.card-stage-wrap')) || Boolean(document.querySelector('.session-complete-stage-wrap'))`, 'normal practice lifecycle after exit');
  await openProgram(cdp);
  await waitFor(cdp, `document.querySelector('[data-stage-id="chord_rhythm"]')?.dataset.stageStatus === 'completed'`, 'completed roadmap status');

  const runtimeExceptions = cdp.runtimeExceptions;
  const consoleErrors = cdp.consoleErrors.filter(message => !message.includes('favicon'));
  assert(runtimeExceptions.length === 0, `Runtime exceptions: ${runtimeExceptions.join(' | ')}`);
  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);

  await mkdir(screenshotDir, { recursive: true });
  for (const shot of screenshots) {
    await writeFile(path.join(screenshotDir, shot.fileName), shot.bytes);
  }
  console.info(`M3K smoke passed with ${screenshots.length} screenshots.`);
} finally {
  try { socket?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { preview?.kill(); } catch {}
  if (tempRoot) {
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    const resolvedTempRoot = path.resolve(tempRoot);
    if (resolvedTempRoot.startsWith(resolvedSystemTemp) && !resolvedTempRoot.includes('piano-trainer-m3k-smoke-')) {
      throw new Error(`Refusing to remove unexpected temp path ${resolvedTempRoot}`);
    }
    if (resolvedTempRoot.startsWith(resolvedSystemTemp)) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await rm(resolvedTempRoot, { recursive: true, force: true });
          break;
        } catch {
          await delay(250);
        }
      }
    }
  }
}
