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
const screenshotDir = path.join(projectDir, 'acceptance', 'm3j', 'screenshots');
const execFileAsync = promisify(execFile);
const VOICINGS = {
  C: ['C4', 'E4', 'G4'], G: ['G3', 'B3', 'D4'], 'G/B': ['B3', 'D4', 'G4'],
  Am: ['A3', 'C4', 'E4'], F: ['F3', 'A3', 'C4']
};
const MIDI_VOICINGS = {
  C: [60, 64, 67], G: [55, 59, 62], 'G/B': [59, 62, 67],
  Am: [57, 60, 64], F: [53, 57, 60]
};
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
    const intervals = await server.ssrLoadModule('/src/core/learning/intervals.ts');
    const triads = await server.ssrLoadModule('/src/core/learning/triads.ts');
    const bass = await server.ssrLoadModule('/src/core/learning/bassGrandStaff.ts');
    const inversions = await server.ssrLoadModule('/src/core/learning/chordInversions.ts');
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
      inversions.INVERSION_ITEM_IDS.COMPLETE
    ]) complete(id);

    assert(learning.isCoreCurriculumComplete({ learningProgress: progress }), 'Synthetic profile does not complete the six core phases.');
    const whiteKeyEntry = learning.evaluateCurriculumEntry({ learningProgress: [...progress.values()], reviewLogs: [] });
    assert(!whiteKeyEntry.shouldEnter, `Synthetic profile would re-enter the white-key curriculum after reload: ${JSON.stringify(whiteKeyEntry)}`);
    assert(bass.isBassGrandModuleComplete(progress), 'Synthetic profile does not complete Bass / Grand Staff.');
    assert(inversions.isInversionModuleComplete(progress), 'Synthetic profile does not complete the accepted M3I prerequisite.');

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
    return { learningProgress: [...progress.values()], cards, now };
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

async function seedDatabase(cdp, data) {
  const payload = {
    cards: data.cards,
    learningProgress: data.learningProgress,
    reviewLogs: data.reviewLogs ?? []
  };
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
      tx.objectStore('settings').put({key:'userSettings',value:{sessionPreset:'normal',level:'white',mode:'smart',autoAdvanceDelaySeconds:0,desiredRetention:0.9,maxIntervalDays:120,relearningSeconds:45,newPitchClassesPerSession:2,useLatencyGrading:true,notationClef:'treble'}});
      tx.oncomplete = () => {
        localStorage.setItem('piano-key-trainer-settings', JSON.stringify({sessionPreset:'normal',level:'white',mode:'smart',autoAdvanceDelaySeconds:0,desiredRetention:0.9,maxIntervalDays:120,relearningSeconds:45,newPitchClassesPerSession:2,useLatencyGrading:true,notationClef:'treble'}));
        db.close(); resolve(true);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }))(${JSON.stringify(payload)})`);
  assert(seeded, 'Could not seed the isolated synthetic browser profile.');
  const freshUrl = `${await cdp.evaluate('location.origin + location.pathname')}?m3jSeed=${Date.now()}`;
  await cdp.send('Page.navigate', { url: freshUrl });
  await waitFor(cdp, `location.href === ${JSON.stringify(freshUrl)} && document.readyState === 'complete' && document.querySelectorAll('.top-nav-btn').length === 9`, 'reloaded synthetic profile');
}

async function saveScreenshot(cdp, fileName) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  return { fileName, bytes: Buffer.from(result.data, 'base64') };
}

async function inspectAdvancedDockLayout(cdp, width, height, stageSelector) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const layout = await cdp.evaluate(`(() => {
    const stage = document.querySelector('.practice-stage-center');
    const workspace = document.querySelector('.workspace-page[data-page="practice"]');
    const dock = workspace?.querySelector(':scope > .keyboard-card');
    const card = stage?.querySelector(${JSON.stringify(stageSelector)});
    const feedback = card?.querySelector('[role="status"]');
    if (!stage || !workspace || !dock || !card) return { missing: true };
    stage.scrollTop = 0;
    const initial = {
      stageBottom: stage.getBoundingClientRect().bottom,
      cardBottom: card.getBoundingClientRect().bottom,
      feedbackBottom: feedback?.getBoundingClientRect().bottom ?? null,
      feedbackText: feedback?.innerText.trim() ?? '',
      lastControlBottom: [...card.querySelectorAll('button')].at(-1)?.getBoundingClientRect().bottom ?? null
    };
    stage.scrollTop = stage.scrollHeight;
    const dockRect = dock.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const feedbackRect = feedback?.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      keyboardTop: dockRect.top,
      keyboardBottom: dockRect.bottom,
      stageTop: stageRect.top,
      stageBottom: stageRect.bottom,
      stageScrollTop: stage.scrollTop,
      stageScrollHeight: stage.scrollHeight,
      stageClientHeight: stage.clientHeight,
      taskBottomAfterScroll: cardRect.bottom,
      feedbackBottomAfterScroll: feedback ? feedbackRect.bottom : null,
      lastControlBottomAfterScroll: [...card.querySelectorAll('button')].at(-1)?.getBoundingClientRect().bottom ?? null,
      feedbackText: initial.feedbackText,
      initialCardBottom: initial.cardBottom,
      initialFeedbackBottom: initial.feedbackBottom,
      initialLastControlBottom: initial.lastControlBottom,
      initialStageBottom: initial.stageBottom,
      horizontalOverflow: [document.documentElement, document.body, stage, card]
        .filter(element => element.scrollWidth > element.clientWidth + 1)
        .map(element => element.tagName + '.' + (element.className?.baseVal || element.className || '')),
      workspaceBottom: workspace.getBoundingClientRect().bottom
    };
  })()`);
  assert(!layout.missing, `Advanced-stage dock layout is missing its stage or keyboard at ${width}x${height}: ${stageSelector}`);
  assert(layout.keyboardBottom <= height + 1 && layout.keyboardBottom >= height - 40, `Piano dock is not visible at the viewport bottom at ${width}x${height}: ${JSON.stringify(layout)}`);
  assert(layout.stageBottom <= layout.keyboardTop + 1, `Task workspace overlaps the piano dock at ${width}x${height}: ${JSON.stringify(layout)}`);
  assert(layout.taskBottomAfterScroll <= layout.stageBottom + 1, `Task content cannot be scrolled fully above the piano dock at ${width}x${height}: ${JSON.stringify(layout)}`);
  assert(layout.lastControlBottomAfterScroll !== null && layout.lastControlBottomAfterScroll <= layout.stageBottom + 1, `Task controls cannot be scrolled fully above the piano dock at ${width}x${height}: ${JSON.stringify(layout)}`);
  if (stageSelector === '[data-testid="harmony-module-stage"]') {
    assert(layout.feedbackBottomAfterScroll !== null && layout.feedbackBottomAfterScroll <= layout.stageBottom + 1 && layout.feedbackText.length > 0, `Harmony feedback is not fully reachable above the piano dock at ${width}x${height}: ${JSON.stringify(layout)}`);
  }
  assert(layout.horizontalOverflow.length === 0, `Horizontal overflow at ${width}x${height}: ${JSON.stringify(layout)}`);
  return layout;
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

async function openProgram(cdp) {
  await cdp.evaluate(`(() => [...document.querySelectorAll('.top-nav-btn')].find(button => button.innerText.trim() === 'Программа')?.click())()`);
  await waitFor(cdp, `document.querySelector('[data-page="curriculum"].active') !== null`, 'Program page');
}

async function clickAnswer(cdp, answer) {
  const clicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('[data-testid="harmony-module-stage"] .answer-choice')]
      .find(candidate => candidate.querySelector('strong')?.innerText.trim() === ${JSON.stringify(answer)});
    button?.click(); return Boolean(button);
  })()`);
  if (!clicked) {
    const state = await cdp.evaluate(`(() => ({
      step:document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep,
      index:document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.quizIndex,
      text:document.querySelector('[data-testid="harmony-module-stage"]')?.innerText || '',
      choices:[...document.querySelectorAll('[data-testid="harmony-module-stage"] .answer-choice strong')].map(item => item.innerText.trim())
    }))()`);
    throw new Error(`Harmony answer button ${answer} was not available: ${JSON.stringify(state)}`);
  }
}

async function inspectSemanticAnswer(cdp, expectedPrompt, requireFeedback = false) {
  const state = await cdp.evaluate(`(() => {
    const card = document.querySelector('[data-testid="harmony-module-stage"], [data-testid="harmony-review-stage"]');
    const prompt = card?.querySelector('[data-testid="harmony-semantic-prompt"]');
    const options = card?.querySelector('[data-testid="harmony-semantic-options"], [data-semantic-options="true"]');
    const feedback = card?.querySelector('[data-testid="harmony-feedback"]');
    const visible = element => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const promptRect = prompt?.getBoundingClientRect();
    const optionsRect = options?.getBoundingClientRect();
    const feedbackRect = feedback?.getBoundingClientRect();
    const taskRect = card?.closest('.practice-stage-center')?.getBoundingClientRect();
    const withinTaskWorkspace = rect => Boolean(rect && taskRect && rect.top >= taskRect.top - 1 && rect.bottom <= taskRect.bottom + 1);
    return {
      prompt: prompt?.innerText.trim() || '',
      promptVisible: visible(prompt),
      optionsVisible: visible(options),
      choices: [...(options?.querySelectorAll('.answer-choice strong') || [])].map(item => item.innerText.trim()),
      feedback: feedback?.innerText.trim() || '',
      feedbackVisible: visible(feedback),
      promptAboveOptions: Boolean(promptRect && optionsRect && promptRect.bottom <= optionsRect.top + 1),
      feedbackBelowOptions: Boolean(feedbackRect && optionsRect && feedbackRect.top >= optionsRect.bottom - 1),
      promptFullyInWorkspace: withinTaskWorkspace(promptRect),
      optionsFullyInWorkspace: withinTaskWorkspace(optionsRect),
      feedbackFullyInWorkspace: withinTaskWorkspace(feedbackRect)
    };
  })()`);
  assert(state.promptVisible && state.prompt.length > 0, `Semantic question is missing or hidden: ${JSON.stringify(state)}`);
  if (expectedPrompt) assert(state.prompt === expectedPrompt, `Unexpected canonical semantic prompt. Expected ${JSON.stringify(expectedPrompt)}, received ${JSON.stringify(state.prompt)}.`);
  assert(state.optionsVisible && state.choices.length >= 2, `Semantic answer choices are missing or hidden: ${JSON.stringify(state)}`);
  assert(state.promptAboveOptions, `Semantic answer options are not placed after the question: ${JSON.stringify(state)}`);
  assert(state.promptFullyInWorkspace && state.optionsFullyInWorkspace, `The semantic question or options are outside the visible task workspace: ${JSON.stringify(state)}`);
  if (requireFeedback) {
    assert(state.feedbackVisible && state.feedback.length > 0 && state.feedbackBelowOptions && state.feedbackFullyInWorkspace, `Corrective feedback is missing or not below the semantic choices inside the workspace: ${JSON.stringify(state)}`);
  }
  return state;
}

async function inspectProgressionPrompt(cdp, expectedPrompt) {
  const state = await cdp.evaluate(`(() => {
    const prompt = document.querySelector('[data-testid="harmony-progression-prompt"]');
    const rect = prompt?.getBoundingClientRect();
    const workspace = document.querySelector('.practice-stage-center')?.getBoundingClientRect();
    return {
      prompt: prompt?.innerText.trim() || '',
      visible: Boolean(prompt && rect && getComputedStyle(prompt).display !== 'none' && rect.width > 0 && rect.height > 0 && workspace && rect.top >= workspace.top - 1 && rect.bottom <= workspace.bottom + 1)
    };
  })()`);
  assert(state.visible && state.prompt === expectedPrompt, `Canonical progression prompt is missing or hidden. Expected ${JSON.stringify(expectedPrompt)}, received ${JSON.stringify(state)}.`);
  return state;
}

async function pressDigit(cdp, digit) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: String(digit), code: `Digit${digit}`, windowsVirtualKeyCode: 48 + digit, nativeVirtualKeyCode: 48 + digit });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: String(digit), code: `Digit${digit}`, windowsVirtualKeyCode: 48 + digit, nativeVirtualKeyCode: 48 + digit });
}

async function clickPianoChord(cdp, keyIds, submitSelector = '[data-testid="harmony-submit-chord"]') {
  for (const [index, keyId] of keyIds.entries()) {
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
    await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"] .input-count')?.innerText.includes(${JSON.stringify(`${index + 1} из 3 нот выбрано`)})`, `screen chord key ${index + 1}/${keyIds.length}`);
  }
  const state = await cdp.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(submitSelector)});
    return {ready:Boolean(button && !button.disabled),disabled:button?.disabled,stage:document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep,sequenceIndex:document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex,count:document.querySelector('[data-testid="harmony-module-stage"] .input-count')?.innerText || ''};
  })()`);
  assert(state.ready, `Three screen piano keys did not enable chord submission: ${JSON.stringify({ keyIds, state })}`);
  await cdp.evaluate(`document.querySelector(${JSON.stringify(submitSelector)})?.click()`);
}

async function playModuleSequence(cdp, chords, step, finalStep) {
  for (let index = 0; index < chords.length; index++) {
    await clickPianoChord(cdp, VOICINGS[chords[index]]);
    if (index < chords.length - 1) {
      await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === ${JSON.stringify(step)} && document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex === ${JSON.stringify(String(index + 1))}`, `${step} chord ${index + 2}/${chords.length}`);
    } else {
      await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === ${JSON.stringify(finalStep)}`, `${step} completion`);
    }
  }
}

async function playAssessmentSequence(cdp, chords, nextTrialText) {
  await playModuleSequence(cdp, chords, 'transferAssessment', nextTrialText ? 'transferAssessment' : 'transferResult');
  if (nextTrialText) await waitFor(cdp, `document.querySelector('.assessment-meter')?.innerText.includes(${JSON.stringify(nextTrialText)})`, `assessment position ${nextTrialText}`);
}

async function noteOn(cdp, notes) {
  await cdp.evaluate(`window.__m3jNoteOn(${JSON.stringify(notes)})`);
}

async function noteOff(cdp, notes) {
  await cdp.evaluate(`window.__m3jNoteOff(${JSON.stringify(notes)})`);
}

const fakeMidiScript = `(() => {
  const input = {id:'m3j-fake-midi',name:'M3J acceptance MIDI',manufacturer:'Codex',state:'connected',connection:'open',type:'input',onmidimessage:null};
  const access = {inputs:new Map([[input.id,input]]),onstatechange:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});
  window.__m3jMidiInput = input;
  window.__m3jNoteOn = notes => notes.forEach(note => input.onmidimessage?.({data:new Uint8Array([0x90,note,100])}));
  window.__m3jNoteOff = notes => notes.forEach(note => input.onmidimessage?.({data:new Uint8Array([0x80,note,0])}));
  window.__m3jDiagnosticExport = null;
  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {
    if (blob?.type === 'application/json') blob.text().then(text => { try { window.__m3jDiagnosticExport = JSON.parse(text); } catch {} });
    return createObjectURL(blob);
  };
})();`;

async function captureDiagnostics(cdp) {
  await cdp.evaluate(`(() => [...document.querySelectorAll('.top-nav-btn')].find(button => button.innerText.trim() === 'Диагностика')?.click())()`);
  await waitFor(cdp, `document.querySelector('[data-page="diagnostics"].active')`, 'Diagnostics page');
  await cdp.evaluate(`document.querySelector('[data-testid="download-diagnostics-json"]')?.click()`);
  await waitFor(cdp, `Boolean(window.__m3jDiagnosticExport)`, 'diagnostics JSON snapshot');
  return cdp.evaluate('window.__m3jDiagnosticExport');
}

const screenshots = [];
const semanticQuestionChecks = [];
let correctiveTransferEvidence;
let dailySemanticEvidence;
let evidence;

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

  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-m3j-smoke-'));
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: fakeMidiScript });
  await cdp.send('Page.navigate', { url: previewUrl });
  await waitFor(cdp, `document.querySelectorAll('.top-nav-btn').length === 9`, 'production application');
  await seedDatabase(cdp, synthetic);

  await openProgram(cdp);
  await waitFor(cdp, `document.querySelector('[data-stage-id="harmony"]')?.dataset.stageStatus === 'available' && document.querySelector('[data-stage-id="harmony"]')?.classList.contains('is-current')`, 'hydrated #10 Harmony prerequisite status');
  const roadmapBefore = await cdp.evaluate(`(() => ({
    title:document.querySelector('[data-stage-id="harmony"] .step-card-title')?.innerText || '',
    status:document.querySelector('[data-stage-id="harmony"]')?.dataset.stageStatus || '',
    current:document.querySelector('[data-stage-id="harmony"]')?.classList.contains('is-current') || false,
    description:document.querySelector('.roadmap-detail-panel')?.innerText || '',
    action:document.querySelector('.roadmap-action-btn')?.innerText || ''
  }))()`);
  assert(roadmapBefore.title === 'Гармония и сопровождение' && roadmapBefore.status === 'available' && roadmapBefore.current, `Program did not show #10 as the current available stage: ${JSON.stringify(roadmapBefore)}`);
  assert(roadmapBefore.description.includes('I–V–vi–IV') && roadmapBefore.action.includes('Начать'), `Harmony Program card is missing a description or CTA: ${JSON.stringify(roadmapBefore)}`);
  screenshots.push(await saveScreenshot(cdp, '01-program-harmony-current.png'));

  const advancedModuleLayouts = [];
  for (const module of [
    { stageId: 'bass_clef', name: 'Bass / Grand Staff', selector: '.advanced-notation-stage' },
    { stageId: 'intervals', name: 'Intervals', selector: '[data-testid="interval-stage"]' },
    { stageId: 'triads', name: 'Triads', selector: '[data-testid="triad-stage"]' },
    { stageId: 'inversions', name: 'Chord Inversions', selector: '[data-testid="inversion-stage"]' }
  ]) {
    await startRoadmapModule(cdp, module.stageId, module.selector);
    advancedModuleLayouts.push({
      module: module.name,
      ...await inspectAdvancedDockLayout(cdp, 1366, 768, module.selector)
    });
  }

  await startRoadmapModule(cdp, 'harmony', '[data-testid="harmony-module-stage"]');
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'orientation'`, 'Harmony orientation');
  const orientation = await cdp.evaluate(`(() => {
    const stage = document.querySelector('[data-testid="harmony-module-stage"]');
    return {
      chords:[...stage.querySelectorAll('[data-testid="harmony-progression"] [data-chord]')].map(item => item.dataset.chord),
      functions:[...stage.querySelectorAll('.roman-map b')].map(item => item.innerText.trim()),
      explanation:stage.innerText.includes('Римская цифра показывает')
    };
  })()`);
  assert(JSON.stringify(orientation.chords) === JSON.stringify(['C', 'G', 'Am', 'F']) && JSON.stringify(orientation.functions) === JSON.stringify(['C', 'G', 'Am', 'F']) && orientation.explanation, `Beginner orientation is incomplete: ${JSON.stringify(orientation)}`);
  screenshots.push(await saveScreenshot(cdp, '02-harmony-orientation.png'));
  await cdp.evaluate(`document.querySelector('[data-testid="harmony-continue"]')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'functionIdentify'`, 'function identification');
  semanticQuestionChecks.push({ task: 'function identification', ...await inspectSemanticAnswer(cdp, 'Какой аккорд имеет функцию I (тоника) в C major?') });
  await pressDigit(cdp, 1);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"] .feedback.good')?.innerText.includes('Верно')`, 'semantic Digit1 response');
  const pcNoteBefore = await cdp.evaluate(`document.querySelector('[data-testid="harmony-module-stage"]')?.innerText || ''`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67 });
  await delay(120);
  const pcNoteAfter = await cdp.evaluate(`document.querySelector('[data-testid="harmony-module-stage"]')?.innerText || ''`);
  assert(pcNoteAfter === pcNoteBefore, 'PC note-key input unexpectedly changed a semantic Harmony task.');
  for (const [index, answer] of ['V', 'Am', 'IV', 'G', 'vi', 'F', 'I'].entries()) {
    semanticQuestionChecks.push({ task: `function identification ${index + 2}`, ...await inspectSemanticAnswer(cdp) });
    await clickAnswer(cdp, answer);
    if (index < 6) await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.quizIndex === ${JSON.stringify(String(index + 2))}`, `function answer ${answer}`);
    else await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'rootProgression'`, `final function answer ${answer}`);
  }
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'rootProgression'`, 'root-position progression');
  assert(await cdp.evaluate(`Boolean(window.__m3jMidiInput?.onmidimessage)`), 'Fake Web MIDI did not connect to the production input handler.');

  const rootSequence = ['C', 'G', 'Am', 'F'];
  await clickPianoChord(cdp, VOICINGS.C);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex === '1'`, 'screen C chord');
  await noteOn(cdp, MIDI_VOICINGS.G);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex === '2'`, 'MIDI G chord');
  await noteOn(cdp, MIDI_VOICINGS.Am);
  await delay(160);
  assert(await cdp.evaluate(`document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex === '2'`), 'MIDI evaluated another chord before the first chord was fully released.');
  await noteOff(cdp, [...MIDI_VOICINGS.G, ...MIDI_VOICINGS.Am]);
  await noteOn(cdp, MIDI_VOICINGS.Am);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex === '3'`, 'MIDI re-armed after full release');
  await noteOff(cdp, MIDI_VOICINGS.Am);
  await clickPianoChord(cdp, VOICINGS.F);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'smoothModel'`, 'root-position progression completion');
  const rootSemantics = await cdp.evaluate(`({sequence:${JSON.stringify(rootSequence)},step:document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep,feedback:document.querySelector('[data-testid="harmony-module-stage"]')?.innerText.includes('Верно')})`);

  const smoothModel = await cdp.evaluate(`(() => {
    const stage = document.querySelector('[data-testid="harmony-module-stage"]');
    return {
      chords:[...stage.querySelectorAll('[data-testid="harmony-progression"] [data-chord]')].map(item => item.dataset.chord),
      bass:[...stage.querySelectorAll('.bass-walk span')].map(item => item.innerText.trim()),
      explanation:stage.querySelector('.theory-note')?.innerText || ''
    };
  })()`);
  assert(JSON.stringify(smoothModel.chords) === JSON.stringify(['C', 'G/B', 'Am']) && JSON.stringify(smoothModel.bass) === JSON.stringify(['C', 'B', 'A']) && smoothModel.explanation.includes('Обращение оставляет тот же аккорд G major') && smoothModel.explanation.includes('переход может стать плавнее'), `G/B voice-leading explanation is missing: ${JSON.stringify(smoothModel)}`);
  screenshots.push(await saveScreenshot(cdp, '03-smooth-bass-transition.png'));
  await cdp.evaluate(`document.querySelector('[data-testid="harmony-module-stage"] button.btn.primary')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'smoothComparison'`, 'root and inversion comparison');
  await cdp.evaluate(`document.querySelector('[data-testid="harmony-module-stage"] button.btn.primary')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'inversionChoice'`, 'guided G/B selection');
  semanticQuestionChecks.push({ task: 'smoother inversion choice', ...await inspectSemanticAnswer(cdp, 'Сейчас звучит C major. Как удобнее перейти к G major?') });
  await clickAnswer(cdp, 'G/B');
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'nextChord'`, 'next-chord recognition');
  semanticQuestionChecks.push({ task: 'next chord recognition', ...await inspectSemanticAnswer(cdp) });
  await clickAnswer(cdp, 'F');
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.innerText.includes('I → V → ? → IV')`, 'Roman numeral next-chord question');
  await clickAnswer(cdp, 'vi');
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'guidedSequence'`, 'guided progression');
  const gByBScreen = await cdp.evaluate(`({step:document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep,prompt:document.querySelector('[data-testid="harmony-module-stage"]')?.innerText.includes('Сыграйте все 3 ноты одновременно')})`);
  await playModuleSequence(cdp, ['C', 'G/B', 'Am', 'F'], 'guidedSequence', 'independentSequence');

  await clickPianoChord(cdp, VOICINGS.C);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex === '1'`, 'independent chord 1/4');
  await clickPianoChord(cdp, VOICINGS['G/B']);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex === '2'`, 'independent chord 2/4');
  const layoutChecks = [];
  for (const [width, height] of [[1920, 1080], [1920, 900], [1366, 768]]) {
    layoutChecks.push(await inspectAdvancedDockLayout(cdp, width, height, '[data-testid="harmony-module-stage"]'));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate('document.querySelector(".practice-stage-center")?.scrollTo({ top: document.querySelector(".practice-stage-center").scrollHeight })');
  await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  screenshots.push(await saveScreenshot(cdp, '04-independent-progression-3-of-4.png'));
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'independentSequence' && document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex === '2'`, 'mid-progression restore at 3/4');
  const independentUi = await cdp.evaluate(`({step:document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep,progress:document.querySelector('[data-testid="harmony-module-stage"] .progression-position')?.innerText || '',selectionCount:[...document.querySelectorAll('[data-testid="harmony-module-stage"] .input-count')].length})`);
  assert(independentUi.progress === '3 из 4' && independentUi.selectionCount === 0, `Independent progression did not reload at 3/4 with cleared selection: ${JSON.stringify(independentUi)}`);
  await clickPianoChord(cdp, VOICINGS.Am);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex === '3'`, 'independent chord 3/4 after reload');
  await clickPianoChord(cdp, VOICINGS.F);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'memorySequence'`, 'independent progression complete');
  const memoryHintCount = await cdp.evaluate(`document.querySelectorAll('[data-testid="harmony-module-stage"] .voicing-hint').length`);
  assert(memoryHintCount === 0, 'Memory stage still shows chord voicing notes.');
  await playModuleSequence(cdp, ['C', 'G/B', 'Am', 'F'], 'memorySequence', 'transferAssessment');
  await waitFor(cdp, `document.querySelector('.assessment-meter')?.innerText.includes('1 из 12')`, 'bounded 12-trial transfer assessment');

  const initialTrials = [
    { kind: 'answer', answer: 'V', prompt: 'G = какая функция в C major?' },
    { kind: 'answer', answer: 'F', prompt: 'C → G/B → Am → ?' },
    { kind: 'progression', prompt: 'Сыграйте C → G → Am → F', chords: ['C', 'G', 'Am', 'F'], wrong: true },
    { kind: 'answer', answer: 'Am', prompt: 'Какой аккорд имеет функцию vi в C major?' },
    { kind: 'answer', answer: 'G/B', wrong: 'G', prompt: 'Для плавного перехода C → G выберите изученный вариант G major.' },
    { kind: 'progression', prompt: 'Сыграйте C → G/B → Am → F', chords: ['C', 'G/B', 'Am', 'F'] },
    { kind: 'answer', answer: 'F', wrong: 'C', prompt: 'Какой аккорд является IV в C major?' },
    { kind: 'answer', answer: 'vi', prompt: 'I → V → ? → IV' },
    { kind: 'progression', prompt: 'Сыграйте Am → F → C → G', chords: ['Am', 'F', 'C', 'G'] },
    { kind: 'answer', answer: 'C', prompt: 'Какой аккорд имеет функцию I (тоника) в C major?' },
    { kind: 'answer', answer: 'C', prompt: 'F → G → C → ?' },
    { kind: 'progression', prompt: 'Сыграйте F → G → C', chords: ['F', 'G', 'C'] }
  ];
  for (let index = 0; index < initialTrials.length; index++) {
    const trial = initialTrials[index];
    const nextLabel = `${Math.min(index + 2, 12)} из 12`;
    if (trial.kind === 'answer') {
      const transferQuestion = await inspectSemanticAnswer(cdp, trial.prompt);
      semanticQuestionChecks.push({ task: `transfer trial ${index + 1}`, ...transferQuestion });
      if (trial.wrong) {
        await clickAnswer(cdp, trial.wrong);
        await waitFor(cdp, `document.querySelector('[data-testid="harmony-feedback"]')?.innerText.includes('Первая попытка этой задачи засчитана как ошибка')`, `corrective feedback for transfer trial ${index + 1}`);
        const correctedUi = await inspectSemanticAnswer(cdp, trial.prompt, true);
        assert(JSON.stringify(correctedUi.choices) === JSON.stringify(transferQuestion.choices), `Corrective response changed the choices for transfer trial ${index + 1}.`);
        if (index === 6) {
          await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
          await cdp.evaluate('document.querySelector(".practice-stage-center")?.scrollTo({ top: document.querySelector(".practice-stage-center").scrollHeight })');
          await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
          correctiveTransferEvidence = await inspectSemanticAnswer(cdp, trial.prompt, true);
          screenshots.push(await saveScreenshot(cdp, '05-transfer-question-corrective-feedback.png'));
        }
      }
      await clickAnswer(cdp, trial.answer);
      if (index < initialTrials.length - 1) await waitFor(cdp, `document.querySelector('.assessment-meter')?.innerText.includes(${JSON.stringify(nextLabel)})`, `initial assessment trial ${index + 2}`);
    } else {
      semanticQuestionChecks.push({ task: `transfer trial ${index + 1} progression`, ...await inspectProgressionPrompt(cdp, trial.prompt) });
      if (trial.wrong) {
        await clickPianoChord(cdp, VOICINGS.G);
        await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.sequenceIndex === '0' && Boolean(document.querySelector('[data-testid="harmony-module-stage"] .feedback.bad'))`, 'wrong progression chord feedback');
        await inspectProgressionPrompt(cdp, trial.prompt);
      }
      await playAssessmentSequence(cdp, trial.chords, index < initialTrials.length - 1 ? nextLabel : null);
    }
    if (index < initialTrials.length - 1) {
      const meter = await cdp.evaluate(`document.querySelector('.assessment-meter')?.innerText || ''`);
      assert(!/\b(?:13|14|15|16)\s+из\s+12\b/.test(meter), `Assessment counter exceeded its fixed total: ${meter}`);
    }
  }
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'transferResult'`, 'failed initial assessment result');
  const failedAssessment = await cdp.evaluate(`({text:document.querySelector('[data-testid="harmony-module-stage"]')?.innerText || '',meter:document.querySelector('.assessment-meter')?.innerText || ''})`);
  assert(failedAssessment.text.includes('75%') && failedAssessment.text.includes('9 из 12') && failedAssessment.text.includes('80%') && failedAssessment.text.includes('Закрепить слабые места'), `The 9/12 failure result is incomplete: ${JSON.stringify(failedAssessment)}`);
  const failedRecord = (await readStore(cdp, 'learningProgress')).find(record => record.id === 'advanced-harmony:transfer');
  assert(failedRecord?.transferAssessment?.trialsCompleted === 12 && failedRecord.transferAssessment.correctFirstAttempts === 9 && failedRecord.transferAssessment.phase === 'result', `Failed assessment was not persisted as 9/12: ${JSON.stringify(failedRecord?.transferAssessment)}`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'transferResult' && document.querySelector('[data-testid="harmony-module-stage"]')?.innerText.includes('9 из 12')`, 'failed result after reload');
  await cdp.evaluate(`document.querySelector('[data-testid="harmony-start-remediation"]')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'transferRemediation'`, 'focused remediation block');
  const remedialQuestions = [
    { kind: 'progression', prompt: 'Сыграйте C → G → Am → F', chords: ['C', 'G', 'Am', 'F'] },
    { kind: 'answer', answer: 'G/B', prompt: 'Для плавного перехода C → G выберите изученный вариант G major.' },
    { kind: 'answer', answer: 'F', prompt: 'Какой аккорд является IV в C major?' }
  ];
  for (const [index, task] of remedialQuestions.entries()) {
    if (task.kind === 'answer') {
      semanticQuestionChecks.push({ task: `remediation ${index + 1}`, ...await inspectSemanticAnswer(cdp, task.prompt) });
      await clickAnswer(cdp, task.answer);
    }
    else {
      semanticQuestionChecks.push({ task: `remediation ${index + 1} progression`, ...await inspectProgressionPrompt(cdp, task.prompt) });
      await playModuleSequence(cdp, task.chords, 'transferRemediation', 'transferRemediation');
    }
    if (index < remedialQuestions.length - 1) {
      await waitFor(cdp, `document.querySelector('.assessment-meter')?.innerText.includes(${JSON.stringify(`${index + 2} из ${remedialQuestions.length}`)})`, `remediation step ${index + 2}`);
    }
  }
  await waitFor(cdp, `document.querySelector('.assessment-meter')?.innerText.includes('1 из 8')`, 'fresh bounded eight-trial retry');
  const retryStart = await cdp.evaluate(`({meter:document.querySelector('.assessment-meter')?.innerText || '',step:document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep,record:document.querySelector('[data-testid="harmony-module-stage"]')?.innerText.includes('Повторная проверка')})`);
  assert(retryStart.meter.includes('1 из 8') && retryStart.record, `Retry was not a fresh eight-trial block: ${JSON.stringify(retryStart)}`);

  const retryTrials = [
    { kind: 'answer', answer: 'G', prompt: 'Какой аккорд является V в C major?' },
    { kind: 'answer', answer: 'vi', prompt: 'I → V → ? → IV' },
    { kind: 'progression', prompt: 'Сыграйте C → G/B → Am → F', chords: ['C', 'G/B', 'Am', 'F'] },
    { kind: 'answer', answer: 'vi', prompt: 'Am = какая функция в C major?' },
    { kind: 'answer', answer: 'G/B', prompt: 'Для перехода C → G выберите более плавный изученный вариант.' },
    { kind: 'progression', prompt: 'Сыграйте Am → F → C → G', chords: ['Am', 'F', 'C', 'G'] },
    { kind: 'answer', answer: 'F', prompt: 'C → G/B → Am → ?' },
    { kind: 'progression', prompt: 'Сыграйте F → G → C', chords: ['F', 'G', 'C'] }
  ];
  for (let index = 0; index < retryTrials.length; index++) {
    const trial = retryTrials[index];
    const nextLabel = `${Math.min(index + 2, 8)} из 8`;
    if (trial.kind === 'answer') {
      semanticQuestionChecks.push({ task: `retry trial ${index + 1}`, ...await inspectSemanticAnswer(cdp, trial.prompt) });
      await clickAnswer(cdp, trial.answer);
      if (index < retryTrials.length - 1) await waitFor(cdp, `document.querySelector('.assessment-meter')?.innerText.includes(${JSON.stringify(nextLabel)})`, `retry trial ${index + 2}`);
    } else {
      semanticQuestionChecks.push({ task: `retry trial ${index + 1} progression`, ...await inspectProgressionPrompt(cdp, trial.prompt) });
      await playAssessmentSequence(cdp, trial.chords, index < retryTrials.length - 1 ? nextLabel : null);
    }
    if (index < retryTrials.length - 1) {
      const meter = await cdp.evaluate(`document.querySelector('.assessment-meter')?.innerText || ''`);
      assert(!/\b(?:9|10|11|12)\s+из\s+8\b/.test(meter), `Retry counter exceeded its fixed total: ${meter}`);
    }
  }
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'transferResult' && document.querySelector('[data-testid="harmony-module-stage"]')?.innerText.includes('100%')`, 'passed retry result');
  const retryRecord = (await readStore(cdp, 'learningProgress')).find(record => record.id === 'advanced-harmony:transfer');
  assert(retryRecord?.transferAssessment?.phase === 'passed' && retryRecord.transferAssessment.trialsCompleted === 8 && retryRecord.transferAssessment.correctFirstAttempts === 8, `Retry did not persist independently as 8/8: ${JSON.stringify(retryRecord?.transferAssessment)}`);
  await cdp.evaluate(`document.querySelector('[data-testid="harmony-finish-assessment"]')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-module-stage"]')?.dataset.harmonyStep === 'moduleComplete'`, 'module completion');
  const completionUi = await cdp.evaluate(`document.querySelector('[data-testid="harmony-module-stage"]')?.innerText || ''`);
  assert(completionUi.includes('Функции аккордов') && completionUi.includes('Последовательности') && completionUi.includes('Плавные переходы'), `Module completion summary is missing learner outcomes: ${completionUi}`);
  const completeRecord = (await readStore(cdp, 'learningProgress')).find(record => record.id === 'advanced-harmony:complete');
  assert(completeRecord?.state === 'retention', 'Harmony completion record was not persisted.');
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(cdp, `document.querySelectorAll('.top-nav-btn').length === 9`, 'application after completed module reload');
  const reloadedCompleteRecord = (await readStore(cdp, 'learningProgress')).find(record => record.id === 'advanced-harmony:complete');
  assert(reloadedCompleteRecord?.state === 'retention', 'Harmony completion record did not survive reload.');
  await cdp.evaluate(`(() => [...document.querySelectorAll('.top-nav-btn')].find(button => button.innerText.trim() === 'Программа')?.click())()`);
  await waitFor(cdp, `document.querySelector('[data-page="curriculum"].active') && document.querySelector('[data-stage-id="harmony"]')?.dataset.stageStatus === 'completed'`, 'completed Harmony Program stage');
  const roadmapAfter = await cdp.evaluate(`({harmony:document.querySelector('[data-stage-id="harmony"]')?.dataset.stageStatus,inversions:document.querySelector('[data-stage-id="inversions"]')?.dataset.stageStatus,current:document.querySelector('[data-stage-id="harmony"]')?.classList.contains('is-current')})`);
  assert(roadmapAfter.harmony === 'completed' && roadmapAfter.inversions === 'completed', `Program did not preserve the completed #10 state: ${JSON.stringify(roadmapAfter)}`);
  screenshots.push(await saveScreenshot(cdp, '06-program-harmony-completed.png'));

  const storedLearningProgress = await readStore(cdp, 'learningProgress');
  const storedCards = await readStore(cdp, 'cards');
  const dailyNow = Date.now();
  const scheduledIds = new Set(['harmonyProgressionPlay:C-G/B-Am-F', 'harmonyFunctionIdentify:I']);
  const dailyCards = storedCards.map(card => {
    if (!scheduledIds.has(card.id)) return card;
    const progression = card.id.startsWith('harmonyProgressionPlay:');
    return {
      ...card,
      memoryState: 'review', stability: 3, difficulty: 5,
      dueAt: dailyNow - (progression ? 60_000 : 30_000),
      lastReviewAt: dailyNow - 86_400_000,
      firstSeenAt: dailyNow - 90 * 86_400_000,
      reps: 4, lapses: 0, lastGrade: 3,
      stats: { trials: 4, firstCorrect: 4, firstWrong: 0, hints: 0, recentScheduledSuccesses: 4, scheduledSuccesses: 4, practiceTrials: 0 }
    };
  });
  assert(dailyCards.some(card => card.id === 'harmonyProgressionPlay:C-G/B-Am-F') && dailyCards.some(card => card.id === 'harmonyFunctionIdentify:I'), 'Synthetic scheduled Harmony cards were not initialized.');
  await seedDatabase(cdp, { cards: dailyCards, learningProgress: storedLearningProgress });
  await cdp.evaluate(`(() => [...document.querySelectorAll('.top-nav-btn')].find(button => button.innerText.trim() === 'Тренировка')?.click())()`);
  await waitFor(cdp, `document.querySelector('[data-page="practice"].active') && document.querySelector('[data-testid="harmony-review-stage"]')?.dataset.reviewCardId === 'harmonyProgressionPlay:C-G/B-Am-F'`, 'scheduled Harmony progression review');
  const scheduledUi = await cdp.evaluate(`({card:document.querySelector('[data-testid="harmony-review-stage"]')?.dataset.reviewCardId,contract:document.querySelector('[data-testid="harmony-review-stage"]')?.innerText.includes('удерживайте три клавиши вместе'),step:document.querySelector('[data-testid="harmony-review-stage"]')?.dataset.reviewStep})`);
  assert(scheduledUi.contract && scheduledUi.step === '0', `Daily Harmony progression input contract is unclear: ${JSON.stringify(scheduledUi)}`);

  for (let index = 0; index < ['C', 'G/B', 'Am', 'F'].length; index++) {
    const chord = ['C', 'G/B', 'Am', 'F'][index];
    await noteOn(cdp, MIDI_VOICINGS[chord]);
    await waitFor(cdp, `document.querySelector('[data-testid="harmony-review-stage"]')?.dataset.reviewStep === ${JSON.stringify(String(index + 1))} || (document.querySelector('[data-testid="harmony-review-stage"]')?.dataset.reviewStep === '4' && Boolean(document.querySelector('[data-testid="harmony-review-next"]')))`, `Daily MIDI progression ${index + 1}/4`);
    if (index === 1) {
      const midiGByB = await cdp.evaluate(`({feedback:document.querySelector('[data-testid="harmony-review-stage"]')?.innerText.includes('Верно: G/B'),step:document.querySelector('[data-testid="harmony-review-stage"]')?.dataset.reviewStep})`);
      assert(midiGByB.feedback && midiGByB.step === '2', `Daily MIDI G/B did not share the successful screen chord evaluation: ${JSON.stringify({ screen: gByBScreen, midi: midiGByB })}`);
      await noteOn(cdp, MIDI_VOICINGS.Am);
      await delay(150);
      assert(await cdp.evaluate(`document.querySelector('[data-testid="harmony-review-stage"]')?.dataset.reviewStep === '2'`), 'Daily MIDI accepted the next chord before full release.');
      await noteOff(cdp, [...MIDI_VOICINGS['G/B'], ...MIDI_VOICINGS.Am]);
      continue;
    }
    await noteOff(cdp, MIDI_VOICINGS[chord]);
  }
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="harmony-review-next"]'))`, 'visible Daily Practice next-task control');
  const reviewLogsBeforeNext = (await readStore(cdp, 'reviewLogs')).filter(log => log.cardId === 'harmonyProgressionPlay:C-G/B-Am-F');
  const progressedCard = (await readStore(cdp, 'cards')).find(card => card.id === 'harmonyProgressionPlay:C-G/B-Am-F');
  assert(reviewLogsBeforeNext.length === 1 && reviewLogsBeforeNext[0].firstCorrect && progressedCard?.dueAt > Date.now(), `One Harmony progression did not persist one successful FSRS transition before the next task: ${JSON.stringify({ reviewLogsBeforeNext, dueAt: progressedCard?.dueAt })}`);
  await cdp.evaluate(`document.querySelector('[data-testid="harmony-review-next"]')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="harmony-review-stage"]')?.dataset.reviewCardId === 'harmonyFunctionIdentify:I'`, 'next due Harmony semantic card after saved progression');
  const finalDailyLogs = (await readStore(cdp, 'reviewLogs')).filter(log => log.cardId === 'harmonyProgressionPlay:C-G/B-Am-F');
  assert(finalDailyLogs.length === 1, `Correct progression or replay created more than one ReviewLog: ${finalDailyLogs.length}`);
  dailySemanticEvidence = await inspectSemanticAnswer(cdp);
  const diagnostic = await captureDiagnostics(cdp);
  const transitions = diagnostic.schedulerTrace.reviewTransitions || [];
  const traces = diagnostic.schedulerTrace.recentTraces || [];
  const transition = transitions.find(item => item.cardId === 'harmonyProgressionPlay:C-G/B-Am-F');
  const sourceTrace = traces.find(item => item.activationId === transition?.activationId);
  const nextTrace = traces.at(-1);
  assert(transition?.persisted && transition.persistenceStatus === 'saved', `Scheduler diagnostics do not mark the Harmony review saved: ${JSON.stringify(transition)}`);
  assert(sourceTrace?.questionInstanceId === transition.questionInstanceId && nextTrace?.previousReviewTransitionId === transition.transitionId, 'The next scheduler decision is not linked to the persisted Harmony progression review.');
  const harmonyDiagnostic = diagnostic.curriculum.advancedModules.harmony;
  assert(harmonyDiagnostic.harmonyCards?.length === 6 && harmonyDiagnostic.harmonyCards.every(card => card.eligibleForDailyPractice), 'Diagnostics do not show all retention-gated Harmony cards eligible after completion.');

  assert(cdp.runtimeExceptions.length === 0, `Production runtime exceptions: ${JSON.stringify(cdp.runtimeExceptions)}`);
  assert(cdp.consoleErrors.length === 0, `Production console errors: ${JSON.stringify(cdp.consoleErrors)}`);
  await mkdir(screenshotDir, { recursive: true });
  for (const screenshot of screenshots) await writeFile(path.join(screenshotDir, screenshot.fileName), screenshot.bytes);
  evidence = {
    status: 'PASS',
    appUrl: previewUrl,
    roadmap: { before: roadmapBefore, after: roadmapAfter },
    orientation: 'C → G → Am → F; C=I, G=V, Am=vi, F=IV',
    input: {
      rootProgression: rootSemantics,
      screenGByB: gByBScreen,
      midiGByB: { outcome: 'correct', fullReleaseRequired: true },
      midiPrematureNextChordIgnored: true,
      pcNoteKeys: 'ignored on semantic Harmony tasks',
      semanticDigit1: 'C answered through canonical selectAnswer',
      advancedModuleDockLayout: advancedModuleLayouts
    },
    semanticQuestionFlow: {
      checks: semanticQuestionChecks,
      correctiveTransferTrial: correctiveTransferEvidence,
      dailyPracticeSemantic: dailySemanticEvidence,
      screenshot: 'acceptance/m3j/screenshots/05-transfer-question-corrective-feedback.png'
    },
    persistence: {
      midProgressionReload: independentUi,
      harmonyDockLayout: layoutChecks,
      failedAssessmentAfterReload: { trials: 12, correctFirstAttempts: 9 },
      completionAfterReload: reloadedCompleteRecord.state
    },
    assessment: {
      initial: { total: 12, correctFirstAttempts: 9, accuracy: 0.75, phase: 'result' },
      remediation: remedialQuestions.length,
      retry: { total: 8, correctFirstAttempts: 8, accuracy: 1, phase: retryRecord.transferAssessment.phase }
    },
    dailyPractice: {
      task: scheduledUi.card,
      input: 'MIDI full chords; exact G/B matched screen-piano outcome',
      reviewLogCount: finalDailyLogs.length,
      firstCorrect: finalDailyLogs[0].firstCorrect,
      dueAtAfter: progressedCard.dueAt,
      persistedBeforeNextDecision: true,
      transitionId: transition.transitionId,
      nextCard: nextTrace.selected
    },
    diagnostics: {
      harmonyStatus: harmonyDiagnostic.status,
      available: harmonyDiagnostic.available,
      learningGates: harmonyDiagnostic.learningGates,
      newHarmonyCards: harmonyDiagnostic.harmonyCards.length,
      dailyPracticeEligible: harmonyDiagnostic.harmonyCards.filter(card => card.eligibleForDailyPractice).length,
      transfer: { phase: harmonyDiagnostic.transferPhase, blockKind: harmonyDiagnostic.transferBlockKind }
    },
    runtimeExceptions: cdp.runtimeExceptions,
    consoleErrors: cdp.consoleErrors,
    screenshots: screenshots.map(item => path.relative(projectDir, path.join(screenshotDir, item.fileName)))
  };
  await writeFile(path.join(projectDir, 'acceptance', 'm3j', 'production-smoke.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`M3J production smoke failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (chrome && chrome.exitCode === null) {
    const browserExited = new Promise(resolve => chrome.once('exit', resolve));
    try { await execFileAsync('taskkill.exe', ['/PID', String(chrome.pid), '/T', '/F'], { windowsHide: true }); } catch {}
    await Promise.race([browserExited, delay(3000)]);
  }
  if (preview && preview.exitCode === null) {
    preview.kill();
    await Promise.race([new Promise(resolve => preview.once('exit', resolve)), delay(3000)]);
  }
  if (tempRoot) {
    const resolvedTempRoot = path.resolve(tempRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    if (resolvedTempRoot.startsWith(`${resolvedSystemTemp}${path.sep}`) && path.basename(resolvedTempRoot).startsWith('piano-trainer-m3j-smoke-')) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try { await rm(resolvedTempRoot, { recursive: true, force: true }); break; }
        catch {
          if (attempt === 4) throw new Error(`Could not remove isolated Chrome profile ${resolvedTempRoot}.`);
          await delay(250);
        }
      }
    }
  }
}
