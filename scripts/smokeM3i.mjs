import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previewEntry = path.join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js');
let appUrl = process.env.PIANO_TRAINER_APP_URL || '';
const screenshotDir = path.join(projectDir, 'acceptance', 'm3i-final', 'screenshots');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const execFileAsync = promisify(execFile);
const requiredCoverage = [
  'quality:major', 'quality:minor', 'inversion:first', 'inversion:second',
  'skill:triadInversionBuild', 'skill:triadInversionIdentify', 'skill:chordSymbolRead',
  'symbol:normal', 'symbol:slash', 'root:chromatic'
];
let tempRoot;
let profileDir;
let portFile;
let chrome;
let preview;
let socket;
let browserCards = [];

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

async function startProductionPreview() {
  const port = await findFreePort();
  appUrl = `http://127.0.0.1:${port}/piano-key-trainer/`;
  preview = spawn(process.execPath, [previewEntry, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
    windowsHide: true
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(appUrl);
      if (response.ok) { ready = true; break; }
    } catch {}
    if (preview.exitCode !== null) throw new Error(`Production preview exited with code ${preview.exitCode}.`);
    await delay(100);
  }
  assert(ready, `Production preview did not become ready at ${appUrl}.`);
}

function doneRecord(record, now) {
  return {
    ...record,
    state: 'retention',
    modelCompleted: true,
    guidedSuccesses: 2,
    independentUnhintedSuccesses: 5,
    contexts: [],
    updatedAt: now
  };
}

const learningServer = await createServer({
  configFile: false,
  root: projectDir,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true }
});

let profiles;
try {
  const learning = await learningServer.ssrLoadModule('/src/core/learning/index.ts');
  const intervals = await learningServer.ssrLoadModule('/src/core/learning/intervals.ts');
  const triads = await learningServer.ssrLoadModule('/src/core/learning/triads.ts');
  const inversions = await learningServer.ssrLoadModule('/src/core/learning/chordInversions.ts');
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
    isBassGrandModuleComplete,
    markFsrsActivated,
    markMixReady,
    recordModelCompleted
  } = learning;
  const { INTERVAL_ITEM_IDS } = intervals;
  const { TRIAD_ITEM_IDS } = triads;
  const { INVERSION_ITEM_IDS, INVERSION_TRANSFER_BLOCK_TRIALS, INVERSION_TRANSFER_REQUIRED_ACCURACY, isInversionModuleAvailable } = inversions;
  const now = Date.now() - 30_000;
  const base = new Map();

  function markDone(id) {
    const record = createInitialLearningProgress(id, now);
    const complete = markFsrsActivated(markMixReady(recordModelCompleted(record, now), now), now);
    base.set(id, doneRecord(complete, now));
  }

  function setCompletedProgress(id, patch) {
    const previous = base.get(id) || createInitialLearningProgress(id, now);
    base.set(id, { ...previous, ...patch, state:'retention', updatedAt:now });
  }

  for (const id of Object.values(FIRST_RUN_CF_ITEM_IDS)) markDone(id);
  for (const note of ['D', 'E', 'B', 'G', 'A']) {
    markDone(getNoteCurriculumItemId(note));
    markDone(getNoteMixCurriculumItemId(note));
  }
  for (const id of Object.values(WHITE_KEY_CURRICULUM_ITEM_IDS)) markDone(id);
  const allWhiteNotes = ['C','D','E','F','G','A','B'];
  for (const note of allWhiteNotes) {
    setCompletedProgress(getNoteCurriculumItemId(note), {
      modelCompleted:true,
      guidedSuccesses:2,
      independentUnhintedSuccesses:5,
      contexts:[`region-${note}3`, `region-${note}4`]
    });
  }
  for (const note of ['D','E','B','G','A']) {
    setCompletedProgress(getNoteMixCurriculumItemId(note), {
      independentUnhintedSuccesses:5,
      contexts:[`${note}:1:region-${note}4`]
    });
  }
  for (const [id, notes] of [
    [WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_CDE, ['C','D','E']],
    [WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FB, ['F','B']],
    [WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_FGAB, ['F','G','A','B']],
    [WHITE_KEY_CURRICULUM_ITEM_IDS.IDENTIFY_ALL_WHITE, allWhiteNotes]
  ]) {
    setCompletedProgress(id, {
      independentUnhintedSuccesses:notes.length,
      contexts:notes.map(note => `identify:${note}`)
    });
  }
  setCompletedProgress(WHITE_KEY_CURRICULUM_ITEM_IDS.MIX_ALL_WHITE, {
    independentUnhintedSuccesses:allWhiteNotes.length,
    contexts:allWhiteNotes.map(note => `${note}:1:region-${note}4`)
  });
  for (const note of BLACK_KEY_ACQUISITION_ORDER) markDone(`curriculum-black:${note}`);
  for (const note of NOTATION_ACQUISITION_ORDER) markDone(`curriculum-notation:${note}`);
  for (const note of EAR_ACQUISITION_ORDER) markDone(`curriculum-ear:${note}`);
  for (const id of Object.values(MILESTONE_3D_ITEM_IDS)) markDone(id);
  for (const note of BASS_NOTE_ACQUISITION_ORDER) markDone(getBassNoteCurriculumItemId(note));
  markDone(INTERVAL_ITEM_IDS.COMPLETE);
  markDone(TRIAD_ITEM_IDS.COMPLETE);
  for (const id of [BASS_GRAND_ITEM_IDS.ORIENTATION, BASS_GRAND_ITEM_IDS.FINAL_MIX, BASS_GRAND_ITEM_IDS.GRAND_ORIENTATION, BASS_GRAND_ITEM_IDS.COMPLETE]) markDone(id);
  const bassTransfer = createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER, now);
  base.set(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER, {
    ...bassTransfer,
    state: 'qualifying',
    modelCompleted: true,
    guidedSuccesses: 14,
    independentUnhintedSuccesses: 11,
    contexts: ['clef:bass', 'clef:treble'],
    updatedAt: now
  });
  assert(isCoreCurriculumComplete({ learningProgress: base }), 'Synthetic profile does not complete the core curriculum.');
  assert(isBassGrandModuleComplete(base), 'Synthetic profile does not complete Bass / Grand Staff.');

  function profileWith(states = {}) {
    const progress = new Map(base);
    for (const [id, state] of Object.entries(states)) {
      const previous = progress.get(id) || createInitialLearningProgress(id, now);
      progress.set(id, { ...previous, state, modelCompleted: state !== 'unseen', updatedAt: now, contexts: [...(previous.contexts || [])] });
    }
    return progress;
  }

  const priorM3iRetention = {
    [INVERSION_ITEM_IDS.ORIENTATION]: 'retention',
    [INVERSION_ITEM_IDS.BUILD_FIRST]: 'retention',
    [INVERSION_ITEM_IDS.BUILD_SECOND]: 'retention',
    [INVERSION_ITEM_IDS.CONTRAST]: 'retention',
    [INVERSION_ITEM_IDS.IDENTIFY]: 'retention',
    [INVERSION_ITEM_IDS.CHORD_SYMBOLS]: 'retention',
    [INVERSION_ITEM_IDS.BUILD_SLASH]: 'retention',
    [INVERSION_ITEM_IDS.HARMONY_SEQUENCE]: 'retention'
  };
  const transferProfile = (trialsCompleted, correctFirstAttempts, failedTrialIndexes) => {
    const progress = profileWith({
      ...priorM3iRetention,
      [INVERSION_ITEM_IDS.TRANSFER]: 'qualifying'
    });
    const previous = progress.get(INVERSION_ITEM_IDS.TRANSFER);
    progress.set(INVERSION_ITEM_IDS.TRANSFER, {
      ...previous,
      state: 'qualifying',
      guidedSuccesses: trialsCompleted,
      independentUnhintedSuccesses: correctFirstAttempts,
      transferLifetimeTrials: trialsCompleted,
      transferLifetimeCorrectFirstAttempts: correctFirstAttempts,
      transferAssessment: {
        blockNumber: 1,
        blockKind: 'initial',
        phase: 'active',
        trialsCompleted,
        correctFirstAttempts,
        coverageTags: [...requiredCoverage],
        failedTrialIndexes: [...failedTrialIndexes],
        remediationTrialIndexes: [],
        remediationIndex: 0,
        pendingCorrective: false
      },
      updatedAt: now
    });
    return progress;
  };

  const guided = profileWith({
    [INVERSION_ITEM_IDS.ORIENTATION]: 'retention',
    [INVERSION_ITEM_IDS.BUILD_FIRST]: 'introduced'
  });
  const identify = profileWith({
    ...priorM3iRetention,
    [INVERSION_ITEM_IDS.IDENTIFY]: 'guided'
  });
  const slashGuided = profileWith({
    ...priorM3iRetention,
    [INVERSION_ITEM_IDS.BUILD_SLASH]: 'introduced'
  });
  const harmony = profileWith({
    ...priorM3iRetention,
    [INVERSION_ITEM_IDS.HARMONY_SEQUENCE]: 'unseen'
  });
  const failTransfer = transferProfile(15, 12, [1, 4, 7]);
  const passTransfer = transferProfile(15, 12, [1, 4, 7]);
  profiles = { guided, identify, slashGuided, harmony, failTransfer, passTransfer, priorM3iRetention };
  for (const [name, profile] of Object.entries(profiles)) {
    if (name !== 'priorM3iRetention') assert(isInversionModuleAvailable(profile), `Synthetic ${name} profile does not unlock M3I.`);
  }
  assert(INVERSION_TRANSFER_BLOCK_TRIALS === 16 && INVERSION_TRANSFER_REQUIRED_ACCURACY === 0.8, 'The M3I transfer acceptance criteria changed unexpectedly.');
} finally {
  await learningServer.close();
}

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
    target = targets.find(item => item.type === 'page');
    if (target?.webSocketDebuggerUrl) break;
    await delay(250);
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
      if (message.method === 'Runtime.exceptionThrown') runtimeExceptions.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push((message.params.args || []).map(argument => argument.value || argument.description || '').join(' '));
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

async function waitForPage(cdp, expression, description) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await cdp.evaluate(expression)) return;
    await delay(200);
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
      const rowsRequest = tx.objectStore('${storeName}').getAll();
      rowsRequest.onsuccess = () => { db.close(); resolve(rowsRequest.result); };
      rowsRequest.onerror = () => reject(rowsRequest.error);
    };
  })`);
}

async function waitForProgressRecord(cdp, id, predicate, description) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const rows = await readStore(cdp, 'learningProgress');
    const record = rows.find(item => item.id === id);
    if (record && predicate(record)) return record;
    await delay(100);
  }
  throw new Error(`Timed out waiting for persisted ${description}.`);
}

async function seedDatabase(cdp, learningProgress, cards = browserCards) {
  const payload = { cards, reviewLogs: [], learningProgress: [...learningProgress.values()] };
  const seeded = await cdp.evaluate(`((data) => new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['cards', 'reviewLogs', 'learningProgress'], 'readwrite');
      for (const name of ['cards', 'reviewLogs', 'learningProgress']) {
        const store = tx.objectStore(name);
        store.clear();
        for (const row of data[name]) store.put(row);
      }
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }))(${JSON.stringify(payload)})`);
  assert(seeded, 'Could not seed the isolated runtime profile.');
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'the reloaded production app');
  await delay(500);
}

async function openProgram(cdp) {
  const clicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('.top-nav-btn')].find(item => item.innerText.trim() === 'Программа');
    button?.click();
    return Boolean(button);
  })()`);
  assert(clicked, 'Could not open Program.');
  await waitForPage(cdp, 'document.querySelector(".workspace-page[data-page=\\"curriculum\\"].active") !== null', 'Program page');
}

async function openInversionModule(cdp, progress) {
  await seedDatabase(cdp, progress);
  await openProgram(cdp);
  await waitForPage(cdp, 'Boolean(document.querySelector("button[data-action=\\"start-inversion-module\\"]") && !document.querySelector("button[data-action=\\"start-inversion-module\\"]").disabled)', 'M3I availability after synthetic progress is loaded');
  const opened = await cdp.evaluate(`(() => {
    const button = document.querySelector('button[data-action="start-inversion-module"]');
    if (!button || button.disabled) return { ok:false, disabled:button?.disabled ?? null, roadmap:document.querySelector('[data-stage-id="inversions"]')?.dataset.stageStatus ?? null };
    button.click();
    return { ok:true };
  })()`);
  assert(opened.ok, `Could not start M3I module: ${JSON.stringify(opened)}`);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]") !== null', 'M3I stage');
}

async function resumeInversionModule(cdp) {
  await openProgram(cdp);
  const clicked = await cdp.evaluate(`(() => {
    const button = document.querySelector('button[data-action="start-inversion-module"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, 'Could not resume M3I from Program after reload.');
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]") !== null', 'resumed M3I stage');
}

async function saveScreenshot(cdp, fileName) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  return { fileName, bytes: Buffer.from(result.data, 'base64') };
}

async function clickPianoChord(cdp, keyIds, submitSelector = '[data-action="triad-submit-chord"]') {
  for (const keyId of keyIds) {
    const point = await cdp.evaluate(`(() => {
      const key = document.querySelector('.keyboard button[data-id="${keyId}"]');
      if (!key) return null;
      const rect = key.getBoundingClientRect();
      return { x:rect.left + rect.width / 2, y:rect.top + rect.height / 2 };
    })()`);
    assert(point, `On-screen piano key ${keyId} is missing.`);
    await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:point.x, y:point.y });
    await cdp.send('Input.dispatchMouseEvent', { type:'mousePressed', x:point.x, y:point.y, button:'left', clickCount:1 });
    await cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:point.x, y:point.y, button:'left', clickCount:1 });
    await delay(100);
  }
  const result = await cdp.evaluate(`(() => {
    const missing = ${JSON.stringify(keyIds)}.filter(id => !document.querySelector('.keyboard button[data-id="' + id + '"]'));
    const submit = document.querySelector(${JSON.stringify(submitSelector)});
    return { ok:!missing.length && Boolean(submit && !submit.disabled), missing, selected:document.querySelector('.triad-selection-count')?.innerText || '' };
  })()`);
  assert(result.ok, `Could not select complete M3I chord ${keyIds.join(' + ')}: ${JSON.stringify(result)}`);
  await cdp.evaluate(`document.querySelector(${JSON.stringify(submitSelector)})?.click()`);
}

async function reloadApp(cdp) {
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'reloaded production app');
  await delay(450);
}

const fakeMidiScript = `(() => {
  const input = { id:'m3i-fake-midi', name:'M3I acceptance MIDI', manufacturer:'Codex', state:'connected', connection:'open', type:'input', onmidimessage:null };
  const access = { inputs:new Map([[input.id,input]]), onstatechange:null };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable:true, value:async () => access });
  window.__m3iMidiInput = input;
  window.__m3iNoteOn = note => input.onmidimessage?.({ data:new Uint8Array([0x90,note,100]) });
  window.__m3iNoteOff = note => input.onmidimessage?.({ data:new Uint8Array([0x80,note,0]) });
})();`;

const screenshots = [];
let evidence = {};
try {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-m3i-smoke-'));
  profileDir = path.join(tempRoot, 'chrome-profile');
  portFile = path.join(profileDir, 'DevToolsActivePort');
  await mkdir(screenshotDir, { recursive: true });
  if (!appUrl) await startProductionPreview();
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--window-size=1440,1000', 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const port = await waitForPortFile();
  const cdp = await connectPage(port);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source:fakeMidiScript });
  await cdp.send('Page.navigate', { url:appUrl });
  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'production preview');
  for (let attempt = 0; attempt < 40 && browserCards.length === 0; attempt++) {
    browserCards = await readStore(cdp, 'cards');
    if (!browserCards.length) await delay(150);
  }
  assert(browserCards.some(card => card.id === 'triadInversionBuild:first'), 'Production app did not initialize M3I daily-practice cards.');

  // Program status and roadmap boundary: M3I is available; the broader accompaniment step stays planned.
  await seedDatabase(cdp, profiles.guided);
  await openProgram(cdp);
  const roadmap = await cdp.evaluate(`(() => ({
    inversion:document.querySelector('[data-stage-id="inversions"]')?.dataset.stageStatus,
    harmony:document.querySelector('[data-stage-id="harmony"]')?.dataset.stageStatus,
    buttonDisabled:document.querySelector('button[data-action="start-inversion-module"]')?.disabled ?? null
  }))()`);
  assert(roadmap.inversion === 'in_progress' && roadmap.harmony === 'planned' && roadmap.buttonDisabled === false, `M3I roadmap status/boundary is wrong: ${JSON.stringify(roadmap)}`);
  screenshots.push(await saveScreenshot(cdp, '01-m3i-program-roadmap.png'));

  // Screen piano: first-inversion Guided asks for all three notes and advances once.
  await openInversionModule(cdp, profiles.guided);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "firstInversionGuided"', 'first-inversion Guided');
  const guidedUi = await cdp.evaluate(`(() => ({
    instruction:document.querySelector('[data-testid="inversion-stage"] .first-run-task-desc')?.innerText || '',
    inputLegend:document.querySelector('[data-testid="inversion-input-legend"]')?.innerText || '',
    bassBadge:document.querySelector('.keyboard button[data-id="E4"] .inversion-bass-badge')?.innerText || '',
    pianoKeys:['E4','G4','C5'].map(id => Boolean(document.querySelector('.keyboard button[data-id="'+id+'"]')))
  }))()`);
  assert(guidedUi.instruction.includes('полный аккорд') && guidedUi.instruction.includes('3 нот') && guidedUi.instruction.includes('одновременно'), `Guided instruction does not match input model: ${JSON.stringify(guidedUi)}`);
  assert(guidedUi.bassBadge === 'БАС' && guidedUi.inputLegend.includes('Бас-подсказка'), `Bass guide is not visually distinct: ${JSON.stringify(guidedUi)}`);
  screenshots.push(await saveScreenshot(cdp, '02-m3i-first-inversion-guided.png'));
  await clickPianoChord(cdp, ['E4','G4','C5']);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "firstInversionQualify" && document.querySelector(".first-run-feedback-text")?.innerText.includes("Верно")', 'screen-piano Guided answer and feedback');
  const screenOutcome = await cdp.evaluate(`({step:document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  await delay(350);
  assert(await cdp.evaluate(`document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep === 'firstInversionQualify'`), 'One screen-piano chord advanced more than once.');

  // MIDI enters the same first-inversion Guided task through the canonical chord reducer.
  await openInversionModule(cdp, profiles.guided);
  await waitForPage(cdp, 'Boolean(window.__m3iMidiInput?.onmidimessage)', 'isolated fake MIDI listener');
  const midiBefore = await cdp.evaluate(`({step:document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep, held:document.querySelector('[data-testid="midi-chord-progress"]')?.innerText || ''})`);
  await cdp.evaluate('window.__m3iNoteOn(64)');
  await delay(100);
  const midiPartial = await cdp.evaluate(`({step:document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep, held:document.querySelector('[data-testid="midi-chord-progress"]')?.innerText || ''})`);
  assert(midiPartial.step === 'firstInversionGuided' && midiPartial.held.includes('1 из 3'), `Partial MIDI chord evaluated early: ${JSON.stringify(midiPartial)}`);
  await cdp.evaluate('window.__m3iNoteOn(67); window.__m3iNoteOn(72)');
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "firstInversionQualify"', 'MIDI chord transition');
  const midiOutcome = await cdp.evaluate(`({step:document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  assert(midiOutcome.step === screenOutcome.step && midiOutcome.feedback.includes('Верно'), `Screen/MIDI outcomes differ: ${JSON.stringify({screenOutcome,midiOutcome,midiBefore})}`);
  await delay(350);
  assert(await cdp.evaluate(`document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep === 'firstInversionQualify'`), 'One MIDI chord advanced more than once.');

  // Identify semantics: piano/MIDI are stimulus only; answer button and Digit2 are equivalent.
  await openInversionModule(cdp, profiles.identify);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionIdentifyQualify"', 'Identify Qualify');
  const identifyUi = await cdp.evaluate(`(() => ({
    instruction:document.querySelector('[data-testid="inversion-stage"] .first-run-task-desc')?.innerText || '',
    highlighted:[...document.querySelectorAll('.keyboard button.target')].map(button => button.dataset.id).sort(),
    answers:[...document.querySelectorAll('[data-inversion-id]')].map(button => button.dataset.inversionId)
  }))()`);
  assert(identifyUi.instruction.toLowerCase().includes('клавиши пианино и midi') && identifyUi.highlighted.length === 3, `Identify input semantics/stimulus are unclear: ${JSON.stringify(identifyUi)}`);
  screenshots.push(await saveScreenshot(cdp, '03-m3i-identify-input.png'));
  await cdp.evaluate('document.querySelector(".keyboard button[data-id=\\"C4\\"]")?.click()');
  await cdp.evaluate('window.__m3iNoteOn(60)');
  await delay(200);
  const ignoredStimulus = await cdp.evaluate(`({step:document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  assert(ignoredStimulus.step === 'inversionIdentifyQualify', `Piano or MIDI was accepted as an Identify answer: ${JSON.stringify(ignoredStimulus)}`);
  await cdp.evaluate('window.__m3iNoteOff(60)');
  await cdp.evaluate('document.querySelector("button[data-inversion-id=\\"first\\"]")?.click()');
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionIdentifyDelayedCheck"', 'Identify answer-button outcome');
  const identifyButton = await cdp.evaluate(`({step:document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  await openInversionModule(cdp, profiles.identify);
  await cdp.send('Input.dispatchKeyEvent', { type:'rawKeyDown', key:'2', code:'Digit2', windowsVirtualKeyCode:50, nativeVirtualKeyCode:50 });
  await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key:'2', code:'Digit2', windowsVirtualKeyCode:50, nativeVirtualKeyCode:50 });
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionIdentifyDelayedCheck"', 'Identify Digit2 outcome');

  // Slash-Chord Guided and the first Harmony Sequence transition use full three-note input.
  await openInversionModule(cdp, profiles.slashGuided);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "slashChordGuided"', 'Slash Guided');
  const slashUi = await cdp.evaluate(`({instruction:document.querySelector('[data-testid="inversion-stage"] .first-run-task-desc')?.innerText || '',bass:document.querySelector('.keyboard button[data-id="B3"] .inversion-bass-badge')?.innerText || ''})`);
  assert(slashUi.instruction.includes('G/B') && slashUi.instruction.includes('полный аккорд') && slashUi.bass === 'БАС', `Slash Guided instruction/input does not match: ${JSON.stringify(slashUi)}`);
  screenshots.push(await saveScreenshot(cdp, '04-m3i-slash-guided.png'));
  await clickPianoChord(cdp, ['B3','D4','G4']);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "slashChordQualify" && document.querySelector(".first-run-feedback-text")?.innerText.includes("Верно")', 'Slash Guided answer');

  await openInversionModule(cdp, profiles.harmony);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "harmonySequence"', 'Harmony Sequence');
  const sequenceBefore = await cdp.evaluate(`document.querySelector('[data-testid="inversion-stage"] .first-run-task-desc')?.innerText || ''`);
  assert(sequenceBefore.includes('Сыграйте текущий аккорд') && sequenceBefore.includes('C'), `Harmony sequence does not explain its current chord: ${sequenceBefore}`);
  await clickPianoChord(cdp, ['C4','E4','G4']);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "harmonySequence" && document.querySelector("[data-testid=\\"inversion-stage\\"] .first-run-task-desc")?.innerText.includes("G/B")', 'Harmony Sequence next chord');
  await delay(300);
  const sequenceAfter = await cdp.evaluate(`document.querySelector('[data-testid="inversion-stage"] .first-run-task-desc')?.innerText || ''`);
  assert(sequenceAfter.includes('G/B'), 'One harmony answer did not advance exactly one sequence item.');

  // Failed 16-trial assessment at 75%: no 17/16; correction does not increase assessment totals.
  await openInversionModule(cdp, profiles.failTransfer);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionTransfer"', 'transfer trial 16');
  const transferPrompt = await cdp.evaluate(`({text:document.querySelector('[data-testid="inversion-stage"] .first-run-task-desc')?.innerText || '',progress:document.querySelector('.first-run-progress-pills')?.innerText || ''})`);
  assert(transferPrompt.progress.includes('16 из 16') && transferPrompt.text.includes('80%'), `Transfer block/criterion is not explicit: ${JSON.stringify(transferPrompt)}`);
  await cdp.evaluate('document.querySelector("[data-action=\\"triad-dont-know\\"]")?.click()');
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionTransfer" && document.querySelector(".first-run-progress-pills")?.innerText.includes("16 из 16")', 'last trial corrective prompt');
  const correctiveProgress = await cdp.evaluate(`({text:document.querySelector('.first-run-task-desc')?.innerText || '',progress:document.querySelector('.first-run-progress-pills')?.innerText || ''})`);
  assert(!/\b(?:17|18|19)\s+из\s+16\b/.test(correctiveProgress.progress), `Rendered overlong assessment counter: ${correctiveProgress.progress}`);
  await clickPianoChord(cdp, ['D4','F4','A4']);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionTransferResult"', 'failed transfer result');
  const failedResult = await cdp.evaluate(`({trials:Number(document.querySelector('[data-testid="inversion-transfer-result"]')?.dataset.blockTrials),text:document.querySelector('[data-testid="inversion-stage"]')?.innerText || '',feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  assert(failedResult.trials === 16 && failedResult.text.includes('75%') && failedResult.text.includes('80%'), `Failed block result did not explain the unmet requirement: ${JSON.stringify(failedResult)}`);
  await waitForProgressRecord(cdp, 'advanced-inversion:transfer', record => record.transferAssessment?.phase === 'result' && record.transferAssessment.trialsCompleted === 16 && record.transferAssessment.correctFirstAttempts === 12, 'failed 16-trial result');
  screenshots.push(await saveScreenshot(cdp, '05-m3i-transfer-result-75-percent.png'));
  await reloadApp(cdp);
  await resumeInversionModule(cdp);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionTransferResult"', 'persisted transfer result after reload');
  await cdp.evaluate('document.querySelector("[data-action=\\"inversion-transfer-remediate\\"]")?.click()');
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionTransferRemediation"', 'focused transfer remediation');
  const remediationPlan = [
    { type:'answer', value:'second' },
    { type:'answer', value:'first' },
    { type:'chord', value:['B3','E4','G4'] },
    { type:'chord', value:['D4','F4','A4'] }
  ];
  for (const item of remediationPlan) {
    if (item.type === 'answer') {
      await cdp.evaluate(`document.querySelector('button[data-inversion-id="${item.value}"]')?.click()`);
    } else {
      await clickPianoChord(cdp, item.value);
    }
    await delay(200);
  }
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionTransfer" && document.querySelector("[data-testid=\\"inversion-stage\\"]")?.innerText.includes("Повторная проверка")', 'fresh bounded retry');
  const retryStart = await cdp.evaluate(`({progress:document.querySelector('.first-run-progress-pills')?.innerText || '',text:document.querySelector('.first-run-task-desc')?.innerText || ''})`);
  assert(retryStart.progress.includes('1 из 8') && retryStart.text.includes('8 новых заданий'), `Retry was not a fresh bounded 8-trial block: ${JSON.stringify(retryStart)}`);

  // Passing 16/16 block: 13/16 first responses passes; completion survives reload.
  await openInversionModule(cdp, profiles.passTransfer);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionTransfer"', 'passing final transfer trial');
  await clickPianoChord(cdp, ['D4','F4','A4']);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "moduleComplete"', 'passing transfer completion');
  const completion = await cdp.evaluate(`({step:document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep,text:document.querySelector('[data-testid="inversion-stage"]')?.innerText || ''})`);
  assert(completion.text.includes('Поздравляем') && completion.text.includes('гармоническую последовательность'), `M3I completion summary is missing: ${completion.text}`);
  await waitForProgressRecord(cdp, 'advanced-inversion:complete', record => record.state === 'retention', 'M3I completion record');
  screenshots.push(await saveScreenshot(cdp, '06-m3i-module-complete.png'));
  await reloadApp(cdp);
  await resumeInversionModule(cdp);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "moduleComplete"', 'persisted M3I completion after reload');
  await openProgram(cdp);
  const completedRoadmap = await cdp.evaluate(`({inversion:document.querySelector('[data-stage-id="inversions"]')?.dataset.stageStatus,harmony:document.querySelector('[data-stage-id="harmony"]')?.dataset.stageStatus})`);
  assert(completedRoadmap.inversion === 'completed' && completedRoadmap.harmony === 'available', `Roadmap completion boundary did not persist: ${JSON.stringify(completedRoadmap)}`);

  // Daily Practice: a due slash-build card remains available at level "white",
  // displays a concrete slash symbol, requires three notes, and grades the same chord.
  const dailyProgress = profiles.passTransfer;
  const dailyNow = Date.now();
  const dailyCards = browserCards.map(card => card.id === 'triadInversionBuild:slash'
    ? {
        ...card,
        memoryState:'review', stability:3.5, difficulty:5.0,
        dueAt:dailyNow - 10_000, lastReviewAt:dailyNow - 86_400_000, firstSeenAt:dailyNow - 86_400_000,
        reps:1, lapses:0, lastGrade:3,
        stats:{ ...card.stats, trials:1, firstCorrect:1, firstWrong:0, hints:0, recentScheduledSuccesses:1, scheduledSuccesses:1, practiceTrials:0 }
      }
    : card);
  await seedDatabase(cdp, dailyProgress, dailyCards);
  const trainingButtonClicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('.top-nav-btn')].find(item => item.innerText.trim() === 'Тренировка');
    button?.click();
    return Boolean(button);
  })()`);
  assert(trainingButtonClicked, 'Could not open Training for the M3I Daily Practice check.');
  await waitForPage(cdp, 'Boolean(document.querySelector("[data-action=\\"daily-triad-submit-chord\\"]"))', 'M3I Daily Practice slash-build task');
  const dailyUi = await cdp.evaluate(`(() => ({
    prompt:document.querySelector('.operation-stage .prompt')?.innerText || '',
    instruction:document.querySelector('.operation-stage .instruction')?.innerText || '',
    count:document.querySelector('.triad-selection-count')?.innerText || '',
    submitDisabled:document.querySelector('[data-action="daily-triad-submit-chord"]')?.disabled ?? null
  }))()`);
  assert(dailyUi.prompt.includes('Am/C') && dailyUi.instruction.includes('полный аккорд') && dailyUi.instruction.includes('обозначению Am/C') && dailyUi.count.includes('0 из 3') && dailyUi.submitDisabled === true,
    `Daily Practice did not activate and explain the expected M3I slash card: ${JSON.stringify(dailyUi)}`);
  await clickPianoChord(cdp, ['C4','E4','A4'], '[data-action="daily-triad-submit-chord"]');
  await waitForPage(cdp, `document.querySelectorAll("*").length > 0 && new Promise(resolve => { const request=indexedDB.open('PianoTrainerDB'); request.onsuccess=()=>{const db=request.result; const tx=db.transaction('reviewLogs','readonly'); const rows=tx.objectStore('reviewLogs').getAll(); rows.onsuccess=()=>{db.close(); resolve(rows.result.some(row=>row.cardId==='triadInversionBuild:slash' && row.firstCorrect));}; request.onerror=()=>resolve(false); }; request.onerror=()=>resolve(false); })`, 'correct M3I Daily Practice slash-card log');
  const dailyLog = (await readStore(cdp, 'reviewLogs')).filter(row => row.cardId === 'triadInversionBuild:slash');
  assert(dailyLog.length === 1 && dailyLog[0].firstCorrect === true, `Daily slash chord did not use the canonical correct-answer grade path: ${JSON.stringify(dailyLog)}`);

  assert(cdp.runtimeExceptions.length === 0, `Production runtime exceptions: ${JSON.stringify(cdp.runtimeExceptions)}`);
  assert(cdp.consoleErrors.length === 0, `Production console errors: ${JSON.stringify(cdp.consoleErrors)}`);
  for (const screenshot of screenshots) await writeFile(path.join(screenshotDir, screenshot.fileName), screenshot.bytes);
  evidence = {
    status:'PASS', appUrl,
    roadmap,
    buildInput:{ instruction:guidedUi.instruction, bassBadge:guidedUi.bassBadge, screenPiano:screenOutcome, midi:midiOutcome, pcNoteShortcut:false },
    identify:{ instruction:identifyUi.instruction, highlightedNotes:identifyUi.highlighted, ignoredPianoAndMidi:ignoredStimulus, answerButton:identifyButton, digit2:'advanced to inversionIdentifyDelayedCheck' },
    slash:{ instruction:slashUi.instruction, bassBadge:slashUi.bass, result:'slashChordGuided → slashChordQualify' },
    harmony:{ firstStep:sequenceBefore, afterOneAnswer:sequenceAfter },
    transfer:{ failingBlock:failedResult, correctiveProgress, retryStart, passingCompletion:completion.step },
    persistence:{ failedResultAfterReload:true, completionAfterReload:true, completedRoadmap },
    dailyPractice:{ task:dailyUi, correctSlashCardLog:{ count:dailyLog.length, firstCorrect:dailyLog[0]?.firstCorrect, cardId:dailyLog[0]?.cardId } },
    runtimeExceptions:cdp.runtimeExceptions,
    consoleErrors:cdp.consoleErrors,
    screenshots:screenshots.map(screenshot => path.relative(projectDir, path.join(screenshotDir, screenshot.fileName)))
  };
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} catch (error) {
  process.stderr.write(`M3I production smoke failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (chrome && chrome.exitCode === null) {
    const browserExited = new Promise(resolve => chrome.once('exit', resolve));
    try { await execFileAsync('taskkill.exe', ['/PID', String(chrome.pid), '/T', '/F'], { windowsHide:true }); } catch {}
    await Promise.race([browserExited, delay(3000)]);
  }
  if (preview && preview.exitCode === null) {
    const previewExited = new Promise(resolve => preview.once('exit', resolve));
    preview.kill();
    await Promise.race([previewExited, delay(3000)]);
  }
  if (tempRoot) {
    const resolvedTempRoot = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    if (resolvedTempRoot.startsWith(`${resolvedSystemTemp}${path.sep}`) && path.basename(resolvedTempRoot).startsWith('piano-trainer-m3i-smoke-')) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try { await rm(resolvedTempRoot, { recursive:true, force:true }); break; }
        catch {
          if (attempt === 4) throw new Error(`Could not remove isolated Chrome profile ${resolvedTempRoot}.`);
          await delay(250);
        }
      }
    }
  }
}
