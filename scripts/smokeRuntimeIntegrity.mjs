import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = process.env.PIANO_TRAINER_APP_URL || 'http://127.0.0.1:4173/piano-key-trainer/';
const screenshotDir = path.join(projectDir, 'acceptance', 'runtime-integrity', 'screenshots');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const execFileAsync = promisify(execFile);
let tempRoot;
let profileDir;
let portFile;
let chrome;
let socket;
let browserCards = [];

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
  const { INTERVAL_ITEM_IDS, createIntervalCurriculumState } = intervals;
  const { TRIAD_ITEM_IDS, createTriadCurriculumState } = triads;
  const { INVERSION_ITEM_IDS, createInversionCurriculumState } = inversions;
  const now = Date.now() - 30_000;
  const base = new Map();

  function markDone(id) {
    const record = createInitialLearningProgress(id, now);
    const complete = markFsrsActivated(markMixReady(recordModelCompleted(record, now), now), now);
    base.set(id, {
      ...complete,
      state: 'retention',
      guidedSuccesses: 2,
      independentUnhintedSuccesses: 5,
      contexts: []
    });
  }

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
  markDone(BASS_GRAND_ITEM_IDS.COMPLETE);
  const grandTransfer = createInitialLearningProgress(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER, now);
  base.set(BASS_GRAND_ITEM_IDS.GRAND_TRANSFER, {
    ...grandTransfer,
    state: 'qualifying',
    modelCompleted: true,
    guidedSuccesses: 14,
    independentUnhintedSuccesses: 11,
    contexts: ['clef:bass', 'clef:treble'],
    updatedAt: now
  });

  assert(isCoreCurriculumComplete({ learningProgress: base }), 'The synthetic profile does not complete the core curriculum.');
  assert(isBassGrandModuleComplete(base), 'The synthetic profile does not complete Bass / Grand Staff.');

  function profileWith(states) {
    const progress = new Map(base);
    for (const [id, state] of Object.entries(states)) {
      const previous = progress.get(id) || createInitialLearningProgress(id, now);
      progress.set(id, {
        ...previous,
        state,
        updatedAt: now,
        contexts: [...(previous.contexts || [])]
      });
    }
    return progress;
  }

  const intervalQualify = profileWith({
    [INTERVAL_ITEM_IDS.COMPLETE]: 'unseen',
    [INTERVAL_ITEM_IDS.TRANSFER]: 'unseen',
    [INTERVAL_ITEM_IDS.ORIENTATION]: 'retention',
    [INTERVAL_ITEM_IDS.BUILD_P8]: 'retention',
    [INTERVAL_ITEM_IDS.BUILD_P5]: 'retention',
    [INTERVAL_ITEM_IDS.BUILD_M3]: 'retention',
    [INTERVAL_ITEM_IDS.BUILD_m3]: 'retention',
    [INTERVAL_ITEM_IDS.CONTRAST_M3_m3]: 'retention',
    [INTERVAL_ITEM_IDS.IDENTIFY_P8]: 'guided'
  });
  const triadQualify = profileWith({
    [INTERVAL_ITEM_IDS.COMPLETE]: 'retention',
    [TRIAD_ITEM_IDS.COMPLETE]: 'unseen',
    [TRIAD_ITEM_IDS.TRANSFER]: 'unseen',
    [TRIAD_ITEM_IDS.ORIENTATION]: 'retention',
    [TRIAD_ITEM_IDS.BUILD_MAJOR]: 'retention',
    [TRIAD_ITEM_IDS.BUILD_MINOR]: 'retention',
    [TRIAD_ITEM_IDS.CONTRAST]: 'retention',
    [TRIAD_ITEM_IDS.IDENTIFY_MAJOR]: 'guided'
  });
  const triadDelayedCheck = profileWith({
    [INTERVAL_ITEM_IDS.COMPLETE]: 'retention',
    [TRIAD_ITEM_IDS.COMPLETE]: 'unseen',
    [TRIAD_ITEM_IDS.TRANSFER]: 'unseen',
    [TRIAD_ITEM_IDS.ORIENTATION]: 'retention',
    [TRIAD_ITEM_IDS.BUILD_MAJOR]: 'retention',
    [TRIAD_ITEM_IDS.BUILD_MINOR]: 'retention',
    [TRIAD_ITEM_IDS.CONTRAST]: 'retention',
    [TRIAD_ITEM_IDS.IDENTIFY_MAJOR]: 'qualifying'
  });
  const triadMinorQualify = profileWith({
    [INTERVAL_ITEM_IDS.COMPLETE]: 'retention',
    [TRIAD_ITEM_IDS.COMPLETE]: 'unseen',
    [TRIAD_ITEM_IDS.TRANSFER]: 'unseen',
    [TRIAD_ITEM_IDS.ORIENTATION]: 'retention',
    [TRIAD_ITEM_IDS.BUILD_MAJOR]: 'retention',
    [TRIAD_ITEM_IDS.BUILD_MINOR]: 'retention',
    [TRIAD_ITEM_IDS.CONTRAST]: 'retention',
    [TRIAD_ITEM_IDS.IDENTIFY_MAJOR]: 'retention',
    [TRIAD_ITEM_IDS.IDENTIFY_MINOR]: 'guided'
  });
  const inversionQualify = profileWith({
    [INTERVAL_ITEM_IDS.COMPLETE]: 'retention',
    [TRIAD_ITEM_IDS.COMPLETE]: 'retention',
    [INVERSION_ITEM_IDS.COMPLETE]: 'unseen',
    [INVERSION_ITEM_IDS.TRANSFER]: 'unseen',
    [INVERSION_ITEM_IDS.ORIENTATION]: 'retention',
    [INVERSION_ITEM_IDS.BUILD_FIRST]: 'retention',
    [INVERSION_ITEM_IDS.BUILD_SECOND]: 'retention',
    [INVERSION_ITEM_IDS.CONTRAST]: 'retention',
    [INVERSION_ITEM_IDS.IDENTIFY]: 'guided'
  });

  assert(createIntervalCurriculumState({ learningProgress: intervalQualify }).step === 'p8IdentifyQualify', 'Interval regression fixture does not reach Identify Qualify.');
  assert(createTriadCurriculumState({ learningProgress: triadQualify }).step === 'majorIdentifyQualify', 'Triad fixture does not reach Major Identify Qualify.');
  assert(createTriadCurriculumState({ learningProgress: triadDelayedCheck }).step === 'majorIdentifyDelayedCheck', 'Triad fixture does not reach the gradeable delayed check.');
  assert(createTriadCurriculumState({ learningProgress: triadMinorQualify }).step === 'minorIdentifyQualify', 'Triad fixture does not reach Minor Identify Qualify.');
  assert(createInversionCurriculumState(inversionQualify).step === 'inversionIdentifyQualify', 'Inversion fixture does not reach Identify Qualify.');
  assert(learning.isTriadModuleAvailable({ learningProgress: triadQualify }), 'The synthetic profile does not unlock the Triads module.');
  assert(learning.isInversionModuleAvailable({ learningProgress: inversionQualify }), 'The synthetic profile does not unlock Chord Inversions.');

  profiles = { intervalQualify, triadQualify, triadDelayedCheck, triadMinorQualify, inversionQualify };
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
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await cdp.evaluate(expression)) return;
    await delay(200);
  }
  const state = await cdp.evaluate(`JSON.stringify({url:location.href,body:document.body?.innerText?.slice(0,900)})`);
  throw new Error(`Timed out waiting for ${description}: ${state}`);
}

async function seedDatabase(cdp, learningProgress) {
  const payload = {
    cards: browserCards,
    reviewLogs: [],
    learningProgress: [...learningProgress.values()]
  };
  const seeded = await cdp.evaluate(`((data) => new Promise((resolve, reject) => {
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
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }))(${JSON.stringify(payload)})`);
  assert(seeded, 'Could not seed the isolated runtime profile.');
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'the reloaded production app');
  await delay(600);
}

async function openModule(cdp, profile, action, stageSelector, expectedStep, stepAttribute) {
  await seedDatabase(cdp, profile);
  const clickedTab = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('.top-nav-btn')].find(item => item.innerText.trim() === 'Программа');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clickedTab, 'Could not open Program.');
  await waitForPage(cdp, 'document.querySelector(".workspace-page[data-page=\\"curriculum\\"].active") !== null', 'Program');
  const moduleButton = await cdp.evaluate(`(() => {
    const button = document.querySelector('button[data-action="${action}"]');
    if (!button || button.disabled) return {
      clicked:false,
      found:Boolean(button),
      disabled:button?.disabled ?? null,
      label:button?.innerText.trim() || '',
      moduleText:document.querySelector('${action === 'start-triad-module' ? '[data-module="triads"]' : action === 'start-interval-module' ? '[data-module="intervals"]' : '[data-module="inversions"]'}')?.innerText || ''
    };
    button.click();
    return {clicked:true,label:button.innerText.trim()};
  })()`);
  assert(moduleButton.clicked, `Could not start the module using ${action}: ${JSON.stringify(moduleButton)}`);
  await waitForPage(cdp, `document.querySelector('${stageSelector}')?.dataset.${stepAttribute} === '${expectedStep}'`, expectedStep);
}

async function dispatchKey(cdp, key, code, virtualKeyCode) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode
  });
}

async function saveScreenshot(cdp, fileName) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  return { fileName, bytes: Buffer.from(result.data, 'base64') };
}

async function reviewLogCount(cdp) {
  return cdp.evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('reviewLogEvents', 'readonly');
      const countRequest = tx.objectStore('reviewLogEvents').count();
      countRequest.onsuccess = () => { db.close(); resolve(countRequest.result); };
      countRequest.onerror = () => reject(countRequest.error);
    };
  })`);
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

const fakeMidiScript = `(() => {
  const input = { id: 'runtime-integrity-fake-midi', name: 'Runtime integrity MIDI', manufacturer: 'Codex', state: 'connected', connection: 'open', type: 'input', onmidimessage: null };
  const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
  window.__runtimeIntegrityMidiInput = input;
  window.__runtimeIntegrityMidiNoteOn = note => input.onmidimessage?.({ data: new Uint8Array([0x90, note, 100]) });
})();`;

const screenshots = [];
try {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-runtime-integrity-'));
  profileDir = path.join(tempRoot, 'chrome-profile');
  portFile = path.join(profileDir, 'DevToolsActivePort');
  await mkdir(screenshotDir, { recursive: true });
  chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--window-size=1440,1000',
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const port = await waitForPortFile();
  const cdp = await connectPage(port);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: fakeMidiScript });
  await cdp.send('Page.navigate', { url: appUrl });
  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'production preview');
  for (let attempt = 0; attempt < 40 && browserCards.length === 0; attempt++) {
    browserCards = await readStore(cdp, 'cards');
    if (!browserCards.length) await delay(150);
  }
  assert(browserCards.some(card => card.id === 'triadIdentify:major'), 'The production app did not initialize its Major Identify card.');

  // Wrong button must show corrective feedback and keep the major stimulus active.
  await openModule(cdp, profiles.triadQualify, 'start-triad-module', '[data-testid="triad-stage"]', 'majorIdentifyQualify', 'triadStep');
  const initialStimulus = await cdp.evaluate(`(() => ({
    step:document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep,
    instruction:document.querySelector('[data-testid="triad-stage"] .first-run-task-desc')?.innerText || '',
    highlighted:['C4','E4','G4'].filter(id => document.querySelector('button[data-id="'+id+'"]')?.classList.contains('target')),
    buttons:[...document.querySelectorAll('[data-quality-id]')].map(button => ({quality:button.dataset.qualityId,label:button.innerText.trim()}))
  }))()`);
  assert(initialStimulus.step === 'majorIdentifyQualify', `Triad Identify did not open the major qualify stage: ${JSON.stringify(initialStimulus)}`);
  assert(initialStimulus.instruction.includes('три подсвеченные ноты') && initialStimulus.instruction.includes('1 / 2'), `The Identify instruction is unclear: ${JSON.stringify(initialStimulus)}`);
  assert(initialStimulus.highlighted.length === 3, `The major stimulus does not show exactly its three expected keys: ${JSON.stringify(initialStimulus)}`);
  assert(initialStimulus.buttons.some(item => item.quality === 'major' && item.label.includes('Мажорное')) && initialStimulus.buttons.some(item => item.quality === 'minor' && item.label.includes('Минорное')), `Major/Minor controls are missing: ${JSON.stringify(initialStimulus)}`);
  const baselineWrongCount = await reviewLogCount(cdp);
  await cdp.evaluate(`document.querySelector('button[data-quality-id="minor"]').click()`);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"triad-stage\\"]")?.dataset.triadStep === "majorIdentifyQualify" && document.querySelector(".first-run-feedback-text")?.innerText.includes("Неверно")', 'wrong-answer feedback');
  const wrongButton = await cdp.evaluate(`({step:document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || '',tone:document.querySelector('.first-run-feedback-text')?.className || ''})`);
  assert(wrongButton.feedback.includes('Мажорное трезвучие') && wrongButton.tone.includes('bad'), `Wrong Minor did not show clear corrective feedback: ${JSON.stringify(wrongButton)}`);
  assert(await reviewLogCount(cdp) === baselineWrongCount, 'A wrong Qualify answer incorrectly created an FSRS ReviewLog.');
  screenshots.push(await saveScreenshot(cdp, '02-triad-identify-wrong-feedback.png'));

  // The on-screen Major button must use the canonical action and advance exactly once.
  await openModule(cdp, profiles.triadQualify, 'start-triad-module', '[data-testid="triad-stage"]', 'majorIdentifyQualify', 'triadStep');
  await cdp.evaluate(`document.querySelector('button[data-quality-id="major"]').click()`);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"triad-stage\\"]")?.dataset.triadStep === "majorIdentifyDelayedCheck" && document.querySelector(".first-run-feedback-text")?.innerText.includes("Верно")', 'correct Major button transition');
  const correctButton = await cdp.evaluate(`({step:document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || '',tone:document.querySelector('.first-run-feedback-text')?.className || '',highlighted:[...document.querySelectorAll('.keyboard button.target')].map(button => button.dataset.id)})`);
  await delay(350);
  assert(await cdp.evaluate(`document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep === 'majorIdentifyDelayedCheck'`), 'One Major click advanced the Triad stage more than once.');
  assert(correctButton.feedback.includes('Верно!') && correctButton.tone.includes('good'), `Correct Major feedback is not visible: ${JSON.stringify(correctButton)}`);
  assert(correctButton.highlighted.length === 3, `The Identify stimulus is not visible after the correct answer: ${JSON.stringify(correctButton)}`);
  screenshots.push(await saveScreenshot(cdp, '01-triad-identify-major-correct.png'));

  await openModule(cdp, profiles.triadMinorQualify, 'start-triad-module', '[data-testid="triad-stage"]', 'minorIdentifyQualify', 'triadStep');
  await cdp.evaluate(`document.querySelector('button[data-quality-id="minor"]').click()`);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"triad-stage\\"]")?.dataset.triadStep === "minorIdentifyDelayedCheck" && document.querySelector(".first-run-feedback-text")?.innerText.includes("Верно")', 'correct Minor button transition');
  const correctMinorButton = await cdp.evaluate(`({step:document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);

  const keyboardRuns = [];
  for (const entry of [
    { label: 'Digit1', key: '1', code: 'Digit1', vkey: 49, expected: 'majorIdentifyDelayedCheck' },
    { label: 'Numpad1', key: '1', code: 'Numpad1', vkey: 97, expected: 'majorIdentifyDelayedCheck' },
    { label: 'Digit2', key: '2', code: 'Digit2', vkey: 50, expected: 'majorIdentifyQualify' },
    { label: 'Numpad2', key: '2', code: 'Numpad2', vkey: 98, expected: 'majorIdentifyQualify' }
  ]) {
    await openModule(cdp, profiles.triadQualify, 'start-triad-module', '[data-testid="triad-stage"]', 'majorIdentifyQualify', 'triadStep');
    await dispatchKey(cdp, entry.key, entry.code, entry.vkey);
    if (entry.expected === 'majorIdentifyDelayedCheck') {
      await waitForPage(cdp, `document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep === '${entry.expected}' && document.querySelector('.first-run-feedback-text')?.innerText.includes('Верно')`, `${entry.label} correct response`);
      await delay(300);
      assert(await cdp.evaluate(`document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep === '${entry.expected}'`), `${entry.label} advanced more than one stage.`);
    } else {
      await waitForPage(cdp, 'document.querySelector("[data-testid=\\"triad-stage\\"]")?.dataset.triadStep === "majorIdentifyQualify" && document.querySelector(".first-run-feedback-text")?.innerText.includes("Неверно")', `${entry.label} wrong response feedback`);
    }
    keyboardRuns.push({ input: entry.label, ...(await cdp.evaluate(`({step:document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`)) });
  }

  // MIDI pitches are stimulus playback, not an Identify answer channel.
  await openModule(cdp, profiles.triadQualify, 'start-triad-module', '[data-testid="triad-stage"]', 'majorIdentifyQualify', 'triadStep');
  const midiAttached = await cdp.evaluate('Boolean(window.__runtimeIntegrityMidiInput?.onmidimessage)');
  assert(midiAttached, 'The production MIDI controller did not attach to the isolated fake MIDI input.');
  const feedbackBeforeMidi = await cdp.evaluate('document.querySelector(".first-run-feedback-text")?.innerText || ""');
  await cdp.evaluate('window.__runtimeIntegrityMidiNoteOn(60)');
  await delay(250);
  const midiAfter = await cdp.evaluate(`({step:document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  assert(midiAfter.step === 'majorIdentifyQualify' && midiAfter.feedback === feedbackBeforeMidi, `MIDI answered Triad Identify unexpectedly: ${JSON.stringify(midiAfter)}`);

  // A single gradeable delayed-check answer may persist at most one review event.
  await openModule(cdp, profiles.triadDelayedCheck, 'start-triad-module', '[data-testid="triad-stage"]', 'majorIdentifyDelayedCheck', 'triadStep');
  const beforeGradeable = await reviewLogCount(cdp);
  await cdp.evaluate(`document.querySelector('button[data-quality-id="major"]').click()`);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"triad-stage\\"]")?.dataset.triadStep !== "majorIdentifyDelayedCheck"', 'gradeable Identify outcome');
  for (let attempt = 0; attempt < 30 && await reviewLogCount(cdp) < beforeGradeable + 1; attempt++) await delay(100);
  const afterGradeable = await reviewLogCount(cdp);
  assert(afterGradeable === beforeGradeable + 1, `One gradeable answer must add exactly one ReviewLog, got ${afterGradeable - beforeGradeable}.`);

  // Regression sanity: Interval Identify and Inversion Identify still use their selectAnswer routes.
  await openModule(cdp, profiles.intervalQualify, 'start-interval-module', '[data-testid="interval-stage"]', 'p8IdentifyQualify', 'intervalStep');
  await cdp.evaluate(`document.querySelector('button[data-interval-id="P8"]').click()`);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"interval-stage\\"]")?.dataset.intervalStep === "p8IdentifyDelayedCheck"', 'Interval Identify button response');
  await delay(250);
  const intervalButton = await cdp.evaluate(`({step:document.querySelector('[data-testid="interval-stage"]')?.dataset.intervalStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  assert(intervalButton.step === 'p8IdentifyDelayedCheck', `Interval Identify button did not advance: ${JSON.stringify(intervalButton)}`);

  await openModule(cdp, profiles.intervalQualify, 'start-interval-module', '[data-testid="interval-stage"]', 'p8IdentifyQualify', 'intervalStep');
  await dispatchKey(cdp, '1', 'Digit1', 49);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"interval-stage\\"]")?.dataset.intervalStep === "p8IdentifyDelayedCheck"', 'Interval Identify Digit1 response');
  const intervalKeyboard = await cdp.evaluate(`({step:document.querySelector('[data-testid="interval-stage"]')?.dataset.intervalStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);

  await openModule(cdp, profiles.inversionQualify, 'start-inversion-module', '[data-testid="inversion-stage"]', 'inversionIdentifyQualify', 'inversionStep');
  const inversionStep = await cdp.evaluate('document.querySelector("[data-testid=\\"inversion-stage\\"]")?.innerText.includes("Определите положение аккорда")');
  assert(inversionStep, 'Inversion Identify screen did not show its expected prompt.');
  await cdp.evaluate(`document.querySelector('button[data-inversion-id="first"]').click()`);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionIdentifyDelayedCheck"', 'Inversion Identify button response');
  const inversionButton = await cdp.evaluate(`({step:document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep,feedback:document.querySelector('.inversion-stage-wrap .first-run-feedback-text')?.innerText || ''})`);

  await openModule(cdp, profiles.inversionQualify, 'start-inversion-module', '[data-testid="inversion-stage"]', 'inversionIdentifyQualify', 'inversionStep');
  await dispatchKey(cdp, '2', 'Digit2', 50);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"inversion-stage\\"]")?.dataset.inversionStep === "inversionIdentifyDelayedCheck"', 'Inversion Identify Digit2 response');
  const inversionKeyboard = await cdp.evaluate(`({step:document.querySelector('[data-testid="inversion-stage"]')?.dataset.inversionStep,feedback:document.querySelector('.inversion-stage-wrap .first-run-feedback-text')?.innerText || ''})`);

  assert(cdp.runtimeExceptions.length === 0, `Production runtime exceptions: ${JSON.stringify(cdp.runtimeExceptions)}`);
  assert(cdp.consoleErrors.length === 0, `Production console errors: ${JSON.stringify(cdp.consoleErrors)}`);
  for (const screenshot of screenshots) {
    await writeFile(path.join(screenshotDir, screenshot.fileName), screenshot.bytes);
  }

  process.stdout.write(JSON.stringify({
    status: 'PASS',
    appUrl,
    triadIdentify: {
      initialStimulus,
      wrongButton,
      correctButton,
      correctMinorButton,
      keyboardRuns,
      midiIgnored: midiAfter,
      gradeableReviewLogDelta: afterGradeable - beforeGradeable
    },
    intervalIdentify: { button: intervalButton, keyboard: intervalKeyboard },
    inversionIdentify: { button: inversionButton, keyboard: inversionKeyboard },
    runtimeExceptions: cdp.runtimeExceptions,
    consoleErrors: cdp.consoleErrors,
    screenshots: screenshots.map(screenshot => path.relative(projectDir, path.join(screenshotDir, screenshot.fileName)))
  }, null, 2) + '\n');
} catch (error) {
  process.stderr.write(`Runtime-integrity production smoke failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
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
  if (resolvedTempRoot.startsWith(`${resolvedSystemTemp}${path.sep}`) && path.basename(resolvedTempRoot).startsWith('piano-trainer-runtime-integrity-')) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await rm(resolvedTempRoot, { recursive: true, force: true });
        break;
      } catch {
        if (attempt === 4) throw new Error(`Could not remove isolated Chrome profile ${resolvedTempRoot}.`);
        await delay(250);
      }
    }
  }
}


