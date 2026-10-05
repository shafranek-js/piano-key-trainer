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
const screenshotDir = path.join(projectDir, 'acceptance', 'stabilization', 'rev2', 'screenshots');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-rev2-browser-'));
const profileDir = path.join(tempRoot, 'chrome-profile');
const portFile = path.join(profileDir, 'DevToolsActivePort');
const execFileAsync = promisify(execFile);
const seed = JSON.parse(await readFile(path.join(projectDir, 'acceptance', 'stabilization', 'stabilization-profile.seed.json'), 'utf8'));
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

let intervalProfile;
let intervalCompleteProfile;
let triadProfile;
try {
  const learning = await learningServer.ssrLoadModule('/src/core/learning/index.ts');
  const intervals = await learningServer.ssrLoadModule('/src/core/learning/intervals.ts');
  const triads = await learningServer.ssrLoadModule('/src/core/learning/triads.ts');
  const { createInitialLearningProgress, isCoreCurriculumComplete, isBassGrandModuleComplete } = learning;
  const { INTERVAL_ITEM_IDS } = intervals;
  const { TRIAD_ITEM_IDS } = triads;
  const now = Date.now() - 60_000;
  const base = new Map(seed.learningProgress.map(record => [record.id, record]));

  assert(isCoreCurriculumComplete({ learningProgress: base }), 'The acceptance profile does not complete the core curriculum.');
  assert(isBassGrandModuleComplete(base), 'The acceptance profile does not complete Bass / Grand Staff.');

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
    return [...progress.values()];
  }

  intervalProfile = profileWith({
    [INTERVAL_ITEM_IDS.ORIENTATION]: 'retention',
    [INTERVAL_ITEM_IDS.BUILD_P8]: 'introduced'
  });
  intervalCompleteProfile = profileWith({
    [INTERVAL_ITEM_IDS.COMPLETE]: 'retention'
  });
  triadProfile = profileWith({
    [INTERVAL_ITEM_IDS.COMPLETE]: 'retention',
    [TRIAD_ITEM_IDS.ORIENTATION]: 'retention',
    [TRIAD_ITEM_IDS.BUILD_MAJOR]: 'introduced'
  });
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
  const state = await cdp.evaluate(`JSON.stringify({url:location.href,body:document.body?.innerText?.slice(0,700),errors:${JSON.stringify(cdp.runtimeExceptions)}})`);
  throw new Error(`Timed out waiting for ${description}: ${state}`);
}

async function saveScreenshot(cdp, fileName) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  await writeFile(path.join(screenshotDir, fileName), Buffer.from(result.data, 'base64'));
}

async function seedDatabase(cdp, learningProgress) {
  const payload = {
    cards: seed.cards,
    reviewLogs: seed.reviewLogs,
    learningProgress
  };
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
  assert(seeded, 'Could not seed the isolated production profile.');
  await cdp.evaluate(`sessionStorage.setItem('piano-trainer-active-page', 'curriculum')`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await delay(450);
  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'the reloaded production app');
  await delay(500);
}

async function clickProgram(cdp) {
  const clicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('.top-nav-btn')].find(item => item.innerText.trim() === 'Программа');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, 'Could not navigate to Program.');
  await waitForPage(cdp, 'document.querySelector(".workspace-page[data-page=\\"curriculum\\"].active") !== null', 'Program');
}

async function startModule(cdp, action, stageSelector, expectedStep) {
  await clickProgram(cdp);
  const started = await cdp.evaluate(`(() => {
    const button = document.querySelector('button[data-action="${action}"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert(started, `Could not start module with ${action}.`);
  const dataKey = stageSelector.includes('triad') ? 'triadStep' : 'intervalStep';
  await waitForPage(cdp, `document.querySelector('${stageSelector}')?.dataset.${dataKey} === '${expectedStep}'`, `${expectedStep} stage`);
}

const fakeMidiScript = `(() => {
  const input = { id: 'rev2-fake-midi', name: 'Rev2 acceptance MIDI', manufacturer: 'Codex', state: 'connected', connection: 'open', type: 'input', onmidimessage: null };
  const inputs = new Map([['rev2-fake-midi', input]]);
  const access = { inputs, onstatechange: null };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
  window.__rev2MidiInput = input;
  window.__rev2MidiNoteOn = note => input.onmidimessage?.({ data: new Uint8Array([0x90, note, 100]) });
  window.__rev2MidiNoteOff = note => input.onmidimessage?.({ data: new Uint8Array([0x80, note, 0]) });
})();`;

try {
  await mkdir(screenshotDir, { recursive: true });
  chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
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
  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'the production app');

  const globalNext = await cdp.evaluate(`
    [...document.querySelectorAll('.hero-toolbar button')]
      .some(button => button.innerText.trim() === 'Следующее задание')
  `);
  assert(!globalNext, 'The removed global next-question action is visible in production.');

  const serviceWorker = await cdp.evaluate(`navigator.serviceWorker?.ready.then(registration => new Promise(resolve => {
    const worker = registration.active;
    const result = () => ({ scope: registration.scope, script: worker?.scriptURL || '', state: worker?.state || '' });
    if (!worker || worker.state === 'activated' || worker.state === 'redundant') return resolve(result());
    const timer = setTimeout(() => resolve(result()), 5000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' || worker.state === 'redundant') {
        clearTimeout(timer);
        resolve(result());
      }
    });
  }))`);
  assert(serviceWorker?.scope === 'http://127.0.0.1:4173/piano-key-trainer/', `Unexpected service worker scope: ${JSON.stringify(serviceWorker)}`);
  assert(serviceWorker.script.endsWith('/piano-key-trainer/sw.js'), `Unexpected service worker script: ${serviceWorker.script}`);
  assert(serviceWorker.state === 'activated', `The generated service worker is not activated: ${JSON.stringify(serviceWorker)}`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await delay(700);
  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'the service-worker-controlled app');

  // Exact P8 Guided C4 -> C5 screen route.
  await seedDatabase(cdp, intervalProfile);
  await startModule(cdp, 'start-interval-module', '[data-testid="interval-stage"]', 'p8BuildGuided');
  const p8Guided = await cdp.evaluate(`(() => {
    const stage = document.querySelector('[data-testid="interval-stage"]');
    const root = document.querySelector('button[data-id="C4"]');
    const target = document.querySelector('button[data-id="C5"]');
    return {
      step: stage?.dataset.intervalStep,
      instruction: stage?.querySelector('.first-run-task-desc')?.innerText || '',
      hint: stage?.querySelector('[data-testid="interval-input-hint"]')?.innerText || '',
      rootAnchor: root?.classList.contains('interval-anchor-key'),
      rootBadge: root?.querySelector('.interval-anchor-badge')?.innerText,
      targetAnchor: target?.classList.contains('interval-anchor-key'),
      targetIsAnswerTarget: target?.classList.contains('target')
    };
  })()`);
  assert(p8Guided.step === 'p8BuildGuided', `The P8 fixture opened the wrong stage: ${JSON.stringify(p8Guided)}`);
  assert(p8Guided.instruction.includes('C4 уже задана') && p8Guided.instruction.includes('C4 → ?'), `The build instruction is ambiguous: ${JSON.stringify(p8Guided)}`);
  assert(p8Guided.hint.includes('Нажмите только верхнюю ноту'), `The build-only input hint is missing: ${JSON.stringify(p8Guided)}`);
  assert(p8Guided.rootAnchor && p8Guided.rootBadge === 'ОПОРА' && !p8Guided.targetAnchor, `Root and answer do not have distinct roles: ${JSON.stringify(p8Guided)}`);
  await saveScreenshot(cdp, '04-interval-p8-guided-single-target.png');

  await cdp.evaluate(`document.querySelector('button[data-id="C5"]').click()`);
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"interval-stage\\"]")?.dataset.intervalStep === "p8BuildQualify"', 'the screen-piano P8 transition');
  const screenFeedback = await cdp.evaluate(`({step:document.querySelector('[data-testid="interval-stage"]')?.dataset.intervalStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  assert(screenFeedback.step === 'p8BuildQualify' && screenFeedback.feedback.includes('Верно!'), `Screen C5 did not produce the correct one-stage transition: ${JSON.stringify(screenFeedback)}`);
  await delay(250);
  assert(await cdp.evaluate(`document.querySelector('[data-testid="interval-stage"]')?.dataset.intervalStep === 'p8BuildQualify'`), 'One screen target click advanced more than one stage.');

  // PC note shortcut must dispatch the same C5 target through the canonical reducer.
  await seedDatabase(cdp, intervalProfile);
  await startModule(cdp, 'start-interval-module', '[data-testid="interval-stage"]', 'p8BuildGuided');
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'c',
    code: 'KeyC',
    windowsVirtualKeyCode: 67,
    nativeVirtualKeyCode: 67
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'c',
    code: 'KeyC',
    windowsVirtualKeyCode: 67,
    nativeVirtualKeyCode: 67
  });
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"interval-stage\\"]")?.dataset.intervalStep === "p8BuildQualify"', 'the PC-key P8 transition');
  const pcFeedback = await cdp.evaluate(`({step:document.querySelector('[data-testid="interval-stage"]')?.dataset.intervalStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  assert(pcFeedback.step === screenFeedback.step && pcFeedback.feedback.includes('Верно!'), `PC C5 did not match the screen result: ${JSON.stringify(pcFeedback)}`);

  // Fake Web MIDI C5 is routed into the same keyPress reducer action.
  await seedDatabase(cdp, intervalProfile);
  await startModule(cdp, 'start-interval-module', '[data-testid="interval-stage"]', 'p8BuildGuided');
  assert(await cdp.evaluate('Boolean(window.__rev2MidiInput?.onmidimessage)'), 'The production MIDI controller did not attach to the fake MIDI input.');
  await cdp.evaluate('window.__rev2MidiNoteOn(72)');
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"interval-stage\\"]")?.dataset.intervalStep === "p8BuildQualify"', 'the MIDI C5 P8 transition');
  const midiFeedback = await cdp.evaluate(`({step:document.querySelector('[data-testid="interval-stage"]')?.dataset.intervalStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  assert(midiFeedback.step === screenFeedback.step && midiFeedback.feedback.includes('Верно!'), `MIDI C5 did not match the screen result: ${JSON.stringify(midiFeedback)}`);
  await cdp.evaluate('window.__rev2MidiNoteOff(72)');

  // Triad Guided screen route: supplied C4, add only E4 + G4.
  await seedDatabase(cdp, triadProfile);
  await startModule(cdp, 'start-triad-module', '[data-testid="triad-stage"]', 'majorBuildGuided');
  const triadGuided = await cdp.evaluate(`(() => ({
    step:document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep,
    instruction:document.querySelector('[data-testid="triad-stage"] .first-run-task-desc')?.innerText || '',
    count:document.querySelector('[data-testid="triad-selection-count"]')?.innerText || '',
    rootAnchor:document.querySelector('button[data-id="C4"]')?.classList.contains('interval-anchor-key'),
    rootBadge:document.querySelector('button[data-id="C4"] .interval-anchor-badge')?.innerText || ''
  }))()`);
  assert(triadGuided.step === 'majorBuildGuided', `The triad fixture opened the wrong stage: ${JSON.stringify(triadGuided)}`);
  assert(triadGuided.instruction.includes('C4 уже дана') && triadGuided.instruction.includes('C4 + ? + ?'), `The guided triad instruction is ambiguous: ${JSON.stringify(triadGuided)}`);
  assert(triadGuided.count === '0' && triadGuided.rootAnchor && triadGuided.rootBadge === 'ОПОРА', `Guided triad root/count roles are incorrect: ${JSON.stringify(triadGuided)}`);
  await saveScreenshot(cdp, '05-triad-major-guided-two-missing-notes.png');

  await cdp.evaluate(`document.querySelector('button[data-id="E4"]').click()`);
  assert(await cdp.evaluate(`document.querySelector('[data-testid="triad-selection-count"]')?.innerText === '1'`), 'Screen E4 did not update the Guided 1/2 note count.');
  await cdp.evaluate(`document.querySelector('button[data-id="G4"]').click()`);
  assert(await cdp.evaluate(`document.querySelector('[data-testid="triad-selection-count"]')?.innerText === '2'`), 'Screen G4 did not update the Guided 2/2 note count.');
  const submitTwoNotes = await cdp.evaluate(`(() => {
    const button = document.querySelector('button[data-action="triad-submit-chord"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert(submitTwoNotes, 'The Guided screen submission did not accept two added notes.');
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"triad-stage\\"]")?.dataset.triadStep === "majorBuildQualify"', 'the screen Guided Triad transition');
  const triadScreenFeedback = await cdp.evaluate(`({step:document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  assert(triadScreenFeedback.feedback.includes('Верно!'), `Guided screen chord did not show correct feedback: ${JSON.stringify(triadScreenFeedback)}`);

  // Guided MIDI: E4 alone reports 1/2; E4 + G4 advances without another C4 press.
  await seedDatabase(cdp, triadProfile);
  await startModule(cdp, 'start-triad-module', '[data-testid="triad-stage"]', 'majorBuildGuided');
  assert(await cdp.evaluate('Boolean(window.__rev2MidiInput?.onmidimessage)'), 'The fake MIDI input is unavailable for the triad scenario.');
  await cdp.evaluate('window.__rev2MidiNoteOn(64)');
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"triad-midi-progress\\"]")?.innerText.includes("1 из 2")', 'the partial Guided MIDI note indicator');
  await cdp.evaluate('window.__rev2MidiNoteOn(67)');
  await waitForPage(cdp, 'document.querySelector("[data-testid=\\"triad-stage\\"]")?.dataset.triadStep === "majorBuildQualify"', 'the Guided MIDI Triad transition');
  const triadMidiFeedback = await cdp.evaluate(`({step:document.querySelector('[data-testid="triad-stage"]')?.dataset.triadStep,feedback:document.querySelector('.first-run-feedback-text')?.innerText || ''})`);
  assert(triadMidiFeedback.feedback.includes('Верно!'), `Guided MIDI E4 + G4 did not show correct feedback: ${JSON.stringify(triadMidiFeedback)}`);
  await cdp.evaluate('window.__rev2MidiNoteOff(64); window.__rev2MidiNoteOff(67)');

  // Production completion card: wide desktop plus a narrow tablet viewport.
  await seedDatabase(cdp, intervalCompleteProfile);
  await startModule(cdp, 'start-interval-module', '[data-testid="interval-stage"]', 'moduleComplete');
  const completionState = await cdp.evaluate(`(() => {
    const card = document.querySelector('.graduation-checklist-card');
    const list = card?.querySelector('.graduation-items');
    const rect = card?.getBoundingClientRect();
    const rows = [...(list?.querySelectorAll('li') || [])].map(item => {
      const r = item.getBoundingClientRect();
      const text = item.querySelector('.graduation-item-copy');
      const tr = text?.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrollWidth:text?.scrollWidth,clientWidth:text?.clientWidth,textRight:tr?.right};
    });
    return {card:rect && {left:rect.left,right:rect.right,width:rect.width},list:list && {scrollWidth:list.scrollWidth,clientWidth:list.clientWidth},rows,columns:getComputedStyle(list).gridTemplateColumns};
  })()`);
  assert(completionState.card && completionState.rows.length === 6, `Intervals completion card is missing content: ${JSON.stringify(completionState)}`);
  assert(completionState.list.scrollWidth <= completionState.list.clientWidth, `Completion list overflows at desktop width: ${JSON.stringify(completionState)}`);
  assert(completionState.rows.every(row => row.left >= completionState.card.left && row.right <= completionState.card.right && row.scrollWidth <= row.clientWidth && row.textRight <= completionState.card.right), `A completion row overflows its card: ${JSON.stringify(completionState)}`);
  for (let left = 0; left < completionState.rows.length; left++) {
    for (let right = left + 1; right < completionState.rows.length; right++) {
      const a = completionState.rows[left];
      const b = completionState.rows[right];
      const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      assert(!overlaps, `Completion items overlap: ${JSON.stringify({ left, right, a, b })}`);
    }
  }
  await saveScreenshot(cdp, '06-intervals-completion-summary-responsive.png');

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 800,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  });
  await delay(350);
  const tabletState = await cdp.evaluate(`(() => {
    const card = document.querySelector('.graduation-checklist-card');
    const list = card?.querySelector('.graduation-items');
    const r = card?.getBoundingClientRect();
    const rows = [...(list?.querySelectorAll('li') || [])].map(item => {
      const row = item.getBoundingClientRect();
      const text = item.querySelector('.graduation-item-copy');
      const textRect = text?.getBoundingClientRect();
      return {left:row.left,right:row.right,top:row.top,bottom:row.bottom,scrollWidth:text?.scrollWidth,clientWidth:text?.clientWidth,textRight:textRect?.right};
    });
    return {viewport:innerWidth,card:r && {left:r.left,right:r.right},list:list && {scrollWidth:list.scrollWidth,clientWidth:list.clientWidth},rows};
  })()`);
  assert(tabletState.card && tabletState.card.left >= 0 && tabletState.card.right <= tabletState.viewport, `Completion card exceeds the tablet viewport: ${JSON.stringify(tabletState)}`);
  assert(tabletState.list.scrollWidth <= tabletState.list.clientWidth, `Completion list overflows at tablet width: ${JSON.stringify(tabletState)}`);
  assert(tabletState.rows.every(row => row.left >= tabletState.card.left && row.right <= tabletState.card.right && row.scrollWidth <= row.clientWidth && row.textRight <= tabletState.card.right), `A tablet completion row overflows its card: ${JSON.stringify(tabletState)}`);

  assert(cdp.runtimeExceptions.length === 0, `Production runtime exceptions: ${JSON.stringify(cdp.runtimeExceptions)}`);
  process.stdout.write(JSON.stringify({
    status: 'PASS',
    appUrl,
    serviceWorker,
    interval: { screen: screenFeedback, pc: pcFeedback, midi: midiFeedback, guidedPrompt: p8Guided },
    triad: { guidedScreen: triadGuided, screen: triadScreenFeedback, midi: triadMidiFeedback },
    completionCard: { desktop: completionState, tablet: tabletState },
    runtimeExceptions: cdp.runtimeExceptions,
    consoleErrors: cdp.consoleErrors,
    screenshots: [
      'acceptance/stabilization/rev2/screenshots/04-interval-p8-guided-single-target.png',
      'acceptance/stabilization/rev2/screenshots/05-triad-major-guided-two-missing-notes.png',
      'acceptance/stabilization/rev2/screenshots/06-intervals-completion-summary-responsive.png'
    ]
  }, null, 2) + '\n');
} catch (error) {
  process.stderr.write(`Production interaction smoke failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
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
  if (resolvedTempRoot.startsWith(`${resolvedSystemTemp}${path.sep}`) && path.basename(resolvedTempRoot).startsWith('piano-trainer-rev2-browser-')) {
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
