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
const screenshotDir = path.join(projectDir, 'acceptance', 'm3k-rev1', 'screenshots');

const RHYTHM_CHORD_KEYS = {
  C: ['C4', 'E4', 'G4'],
  G: ['G3', 'B3', 'D4'],
  'G/B': ['B3', 'D4', 'G4'],
  Am: ['A3', 'C4', 'E4'],
  F: ['F3', 'A3', 'C4']
};
const WRONG_CHORD_ID = 'G';

const C_MAJOR_ROOT = [60, 64, 67];

const fakeMidiScript = `(() => {
  const input = {id:'m3k-fake-midi',name:'M3K acceptance MIDI',manufacturer:'Codex',state:'connected',connection:'open',type:'input',onmidimessage:null};
  const access = {inputs:new Map([[input.id,input]]),onstatechange:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});
  window.__m3kMidiInput = input;
  window.__m3kNoteOn = notes => notes.forEach(note => input.onmidimessage?.({data:new Uint8Array([0x90,note,100])}));
  window.__m3kNoteOff = notes => notes.forEach(note => input.onmidimessage?.({data:new Uint8Array([0x80,note,0])}));
  window.__m3kArmMidi = notes => new Promise(resolve => {
    const started = performance.now();
    const guard = setInterval(() => {
      if (performance.now() - started > 15000) {
        clearInterval(guard);
        window.__m3kOnTimingWindowOpen = null;
        resolve(false);
      }
    }, 250);
    window.__m3kOnTimingWindowOpen = () => {
      clearInterval(guard);
      window.__m3kOnTimingWindowOpen = null;
      window.__m3kNoteOn(notes);
      resolve(true);
    };
  });
  window.__m3kPlayAt = (notes, deltaMs) => new Promise(resolve => {
    const started = performance.now();
    const guard = setInterval(() => {
      const target = window.__m3kTimingTarget;
      if (target && performance.now() >= target.onset + deltaMs) {
        clearInterval(guard);
        window.__m3kNoteOn(notes);
        resolve(true);
      } else if (performance.now() - started > 15000) {
        clearInterval(guard);
        resolve(false);
      }
    }, 4);
  });
})();`;

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
        changeOnBeatOne: sessionSnapshot({ stage: 'changeOnBeatOne', sequenceIndex: 0, assessment: assessment() }),
        oneChordPerBar: sessionSnapshot({ stage: 'oneChordPerBar', sequenceIndex: 0, assessment: assessment() }),
        twoStrikes: sessionSnapshot({ stage: 'twoStrikes', sequenceIndex: 0, assessment: assessment() }),
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
      const names = ['cards','reviewLogEvents','learningProgress','settings'];
      const tx = db.transaction(names, 'readwrite');
      for (const name of ['cards','reviewLogEvents','learningProgress']) {
        const store = tx.objectStore(name); store.clear();
        for (const row of (data[name] ?? [])) store.put(row);
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
  await delay(500);
}

async function waitForMidi(cdp) {
  await waitFor(cdp, `Boolean(window.__m3kMidiInput?.onmidimessage)`, 'fake Web MIDI connection');
}

async function midiOn(cdp, notes) {
  await cdp.evaluate(`window.__m3kNoteOn(${JSON.stringify(notes)})`);
}

async function midiOff(cdp, notes) {
  await cdp.evaluate(`window.__m3kNoteOff(${JSON.stringify(notes)})`);
}

async function gestureStart(cdp, notes) {
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, 'prepare state for MIDI gesture');
  await midiOn(cdp, notes);
  await waitFor(cdp, `document.querySelector('[data-testid="rhythm-timing-state"]')?.innerText.includes('Отпустите')`, 'release hint after start gesture');
  await midiOff(cdp, notes);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'countIn'`, 'count-in after full gesture release');
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

async function waitChordOutcome(cdp, description) {
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="rhythm-timing-result"]')) && document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.timingWindow === 'closed'`, description);
  return cdp.evaluate(`(() => ({
    timing:document.querySelector('[data-testid="rhythm-timing-result"]')?.innerText || '',
    chord:document.querySelector('[data-testid="rhythm-chord-result"]')?.innerText || '',
    played:document.querySelector('[data-testid="rhythm-played-label"]')?.innerText || '',
    expected:document.querySelector('[data-testid="rhythm-expected-label"]')?.innerText || '',
    feedback:document.querySelector('[data-testid="chord-rhythm-stage"] .rhythm-feedback')?.innerText || '',
    bar:document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.changeBar ?? null,
    playNow:document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.playNow ?? null,
    timingAcceptedAttr:document.querySelector('[data-testid="rhythm-timing-result"]')?.dataset.timingAccepted ?? null,
    timingHasBad:document.querySelector('[data-testid="rhythm-timing-result"] strong')?.classList.contains('bad') ?? null,
    timingHasGood:document.querySelector('[data-testid="rhythm-timing-result"] strong')?.classList.contains('good') ?? null,
    attempts:(window.__m3kRecentAttempts || []).slice(-3),
    trace:window.__m3kRecentAttempts?.at(-1) ?? null
  }))()`);
}

async function runRhythmTrial(cdp, chordId) {  const keys = RHYTHM_CHORD_KEYS[chordId];
  await cdp.evaluate(`(() => { for (const id of ${JSON.stringify(keys)}) document.querySelector('.keyboard button[data-id="' + id + '"]')?.click(); return true; })()`);
  await waitFor(cdp, `document.querySelector('[data-testid="rhythm-selected-count"]')?.innerText.includes('3 из 3')`, 'three rhythm keys selected');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="rhythm-start-run"]'))`, 'rhythm start action');
  for (let attempt = 0; attempt < 5; attempt++) {
    await realClick(cdp, '[data-testid="rhythm-start-run"]');
    await delay(250);
    if (await cdp.evaluate(`document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'countIn'`)) break;
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: fakeMidiScript });
  await cdp.send('Page.navigate', { url: previewUrl });
  await waitFor(cdp, `document.querySelectorAll('.top-nav-btn').length === 9`, 'production application');

  // ===== Rev1: hands-free MIDI start + beginner timing acceptance =====

  // 1. MIDI start gesture on changeOnBeatOne: any key starts, countdown waits for full release,
  //    and the gesture is never graded. The whole C → G/B change runs without a mouse click.
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.changeOnBeatOne });
  await waitForMidi(cdp);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'changeOnBeatOne'`, 'changeOnBeatOne stage');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, 'pre-count-in state');
  const prepareHint = await cdp.evaluate(`document.querySelector('[data-testid="rhythm-timing-state"]')?.innerText || ''`);
  assert(prepareHint.includes('MIDI'), `MIDI start hint is missing: ${prepareHint}`);
  screenshots.push(await saveScreenshot(cdp, '01-midi-start-ready.png'));

  const tracesBeforeGesture = await cdp.evaluate('window.__m3kAttemptCount ?? 0');
  await midiOn(cdp, [48]);
  await waitFor(cdp, `document.querySelector('[data-testid="rhythm-timing-state"]')?.innerText.includes('Отпустите')`, 'release hint after start gesture');
  await delay(250);
  assert(await cdp.evaluate(`document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`), 'Countdown must not start before full release.');
  assert((await cdp.evaluate('window.__m3kAttemptCount ?? 0')) === tracesBeforeGesture, 'Start gesture must not be evaluated musically.');
  await midiOff(cdp, [48]);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'countIn'`, 'count-in after full release');
  const gestureFirst = await cdp.evaluate(`window.__m3kPlayAt(${JSON.stringify([48, 52, 55])}, 0)`);
  assert(gestureFirst, 'Bar 1 C was not played inside the window.');
  await midiOff(cdp, [48, 52, 55]);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.changeBar === '1'`, 'second bar armed after gesture start');
  const gestureSecond = await cdp.evaluate(`window.__m3kPlayAt(${JSON.stringify([59, 62, 67])}, 0)`);
  assert(gestureSecond, 'Bar 2 G/B was not played inside the window.');
  const gestureChange = await waitChordOutcome(cdp, 'gesture change outcome');
  assert(gestureChange.feedback.includes('Такт 1 · C: ✓') && gestureChange.feedback.includes('Такт 2 · G/B: ✓') && gestureChange.feedback.includes('Смена: ✓ засчитана'),
    `Gesture-driven change exercise failed: ${gestureChange.feedback}`);
  assert(gestureChange.trace?.startMethod === 'midi_gesture' && gestureChange.trace?.startGestureFirstNote === 48,
    `Start gesture diagnostics missing: ${JSON.stringify(gestureChange.trace)}`);
  assert(gestureChange.trace?.timingBand === 'on_time' && gestureChange.trace?.timingAccepted === true,
    `Gesture change must be accepted on time: ${JSON.stringify(gestureChange.trace)}`);
  await midiOff(cdp, [59, 62, 67]);
  await delay(150);

  // 2. Exactly one countdown per gesture; MIDI during the count-in does not restart it.
  await gestureStart(cdp, [50]);
  await midiOn(cdp, [62]);
  await delay(200);
  await midiOff(cdp, [62]);
  assert(await cdp.evaluate(`document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'countIn'`), 'MIDI during count-in must not restart the countdown.');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, 'prepare after expired gesture run', 120);

  // 3. Arbitrary start notes (F#4, A2, D5) behave identically; no special C note.
  for (const note of [66, 45, 74]) {
    await gestureStart(cdp, [note]);
    assert(await cdp.evaluate(`document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'countIn'`), `Start gesture with note ${note} did not begin a countdown.`);
    await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, `prepare after note ${note} run`, 120);
  }

  // 4. A chord as start gesture: registered only as transport, countdown waits for full release.
  const tracesBeforeChordGesture = await cdp.evaluate('window.__m3kAttemptCount ?? 0');
  await midiOn(cdp, C_MAJOR_ROOT);
  await waitFor(cdp, `document.querySelector('[data-testid="rhythm-timing-state"]')?.innerText.includes('Отпустите')`, 'release hint after chord gesture');
  await delay(250);
  assert(await cdp.evaluate(`document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`), 'Chord gesture must wait for full release.');
  await midiOff(cdp, C_MAJOR_ROOT);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'countIn'`, 'count-in after chord gesture release');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, 'prepare after chord gesture run', 120);
  assert((await cdp.evaluate('window.__m3kAttemptCount ?? 0')) === tracesBeforeChordGesture, 'Chord start gesture created a musical evaluation.');

  // 5. Ten gesture starts → release → countdown → successful answer (race/double-start guard).
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.oneChordPerBar });
  await waitForMidi(cdp);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'oneChordPerBar'`, 'oneChordPerBar stage');
  const gestureNotes = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64];
  for (let index = 0; index < gestureNotes.length; index++) {
    const tracesBefore = await cdp.evaluate('window.__m3kAttemptCount ?? 0');
    await gestureStart(cdp, [gestureNotes[index]]);
    const played = await cdp.evaluate(`window.__m3kArmMidi(${JSON.stringify(C_MAJOR_ROOT)})`);
    assert(played, `Gesture run ${index + 1}: chord was not played in the window.`);
    const outcome = await waitChordOutcome(cdp, `gesture run ${index + 1}`);
    assert(outcome.trace?.chordCorrect === true && outcome.trace?.timingAccepted === true, `Gesture run ${index + 1} failed: ${JSON.stringify(outcome.trace)}`);
    assert((await cdp.evaluate('window.__m3kAttemptCount ?? 0')) === tracesBefore + 1, `Gesture run ${index + 1}: exactly one evaluation per gesture expected.`);
    await midiOff(cdp, C_MAJOR_ROOT);
    await delay(120);
  }

  // 6. PLAY NOW is decoupled from the ±300 ms acceptance window: acceptance opens early
  // (grading), the visual cue appears exactly at the canonical target onset.
  // 6a. Before the grace window: acceptance closed, cue hidden, an immediate note is too_early.
  await gestureStart(cdp, [50]);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'armed' && document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.timingWindow === 'closed'`, 'armed before the grace window');
  assert(await cdp.evaluate(`document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.playNow === 'hidden'`),
    'PLAY NOW must be hidden before the grace window opens.');
  const preWindow = await cdp.evaluate(`({ remaining: (window.__m3kTimingTarget?.onset ?? 0) - performance.now() })`);
  assert(preWindow.remaining > 300, `Pre-window check must run more than 300 ms before the target: ${JSON.stringify(preWindow)}`);
  const preWindowTraces = await cdp.evaluate('window.__m3kAttemptCount ?? 0');
  const earlyPlayed = await cdp.evaluate(`window.__m3kPlayAt(${JSON.stringify(C_MAJOR_ROOT)}, -500)`);
  assert(earlyPlayed, 'Pre-window chord was not played.');
  await waitFor(cdp, `(window.__m3kAttemptCount ?? 0) > ${preWindowTraces}`, 'pre-window evaluation');
  const earlyOutcome = await waitChordOutcome(cdp, 'pre-window too_early outcome');
  assert(earlyOutcome.trace?.timingBand === 'too_early' && earlyOutcome.trace?.timingAccepted === false,
    `Immediate pre-window note must be too_early: ${JSON.stringify(earlyOutcome.trace)}`);
  assert(earlyOutcome.timingAcceptedAttr === 'failed' && earlyOutcome.timingHasBad === true,
    `Pre-window timing must render as failed: ${JSON.stringify({ attr: earlyOutcome.timingAcceptedAttr, bad: earlyOutcome.timingHasBad })}`);
  assert(earlyOutcome.playNow === 'hidden', 'PLAY NOW became visible before the grace window.');
  await midiOff(cdp, C_MAJOR_ROOT);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, 'prepare after pre-window check', 120);

  // 6b. Grace window: acceptance open but no cue; an early chord is still accepted and unprompted.
  await gestureStart(cdp, [50]);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.timingWindow === 'open'`, 'acceptance window open');
  const graceState = await cdp.evaluate(`(() => ({
    remaining: (window.__m3kTimingTarget?.onset ?? 0) - performance.now(),
    playNow: document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.playNow ?? null,
    label: document.querySelector('[data-testid="rhythm-timing-state"]')?.innerText || '',
    acceptOpenAt: window.__m3kTimingWindowOpenAt ?? null,
    onset: window.__m3kTimingTarget?.onset ?? null
  }))()`);
  assert(graceState.remaining > 0, `Grace-window check must run before the target: ${JSON.stringify(graceState)}`);
  assert(graceState.playNow === 'hidden', `PLAY NOW must stay hidden during the grace window: ${JSON.stringify(graceState)}`);
  assert(graceState.label.includes('Приготовьтесь'), `Grace window must show «Приготовьтесь…»: ${JSON.stringify(graceState)}`);
  assert(typeof graceState.acceptOpenAt === 'number' && Math.abs(graceState.acceptOpenAt - (graceState.onset - 300)) < 80,
    `Acceptance window must open at target - 300 ms: ${JSON.stringify(graceState)}`);
  const graceTraces = await cdp.evaluate('window.__m3kAttemptCount ?? 0');
  const gracePlayed = await cdp.evaluate(`window.__m3kPlayAt(${JSON.stringify(C_MAJOR_ROOT)}, -250)`);
  assert(gracePlayed, 'Grace-window chord was not played.');
  await waitFor(cdp, `(window.__m3kAttemptCount ?? 0) > ${graceTraces}`, 'grace-window evaluation');
  const graceOutcome = await waitChordOutcome(cdp, 'grace-window early outcome');
  assert(graceOutcome.trace?.timingBand === 'early' && graceOutcome.trace?.timingAccepted === true,
    `Early chord in the grace window must be accepted: ${JSON.stringify(graceOutcome.trace)}`);
  assert(graceOutcome.timingAcceptedAttr === 'accepted' && graceOutcome.timingHasBad === false,
    `Accepted early timing must not render as failed: ${JSON.stringify({ attr: graceOutcome.timingAcceptedAttr, bad: graceOutcome.timingHasBad })}`);
  await midiOff(cdp, C_MAJOR_ROOT);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, 'prepare after grace-window check', 120);

  // 6c. Canonical target onset: cue becomes visible together with the active beat and is bounded.
  await gestureStart(cdp, [50]);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.playNow === 'visible'`, 'PLAY NOW visible at target onset');
  const cueState = await cdp.evaluate(`(() => ({
    onset: window.__m3kTimingTarget?.onset ?? null,
    shownAt: window.__m3kPlayNowShownAt ?? null,
    activeBeat: document.querySelector('[data-testid="rhythm-beat-indicator"] .active')?.innerText.trim() ?? null,
    acceptanceOpen: document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.timingWindow ?? null,
    label: document.querySelector('[data-testid="rhythm-timing-state"]')?.innerText || ''
  }))()`);
  assert(typeof cueState.onset === 'number' && typeof cueState.shownAt === 'number',
    `Cue diagnostics missing: ${JSON.stringify(cueState)}`);
  assert(Math.abs(cueState.shownAt - cueState.onset) < 80,
    `PLAY NOW must switch at the canonical target onset: ${JSON.stringify(cueState)}`);
  assert(cueState.activeBeat === '1', `Active beat circle must show beat 1 with the cue: ${JSON.stringify(cueState)}`);
  assert(cueState.acceptanceOpen === 'open', `Acceptance window must still be open at the target: ${JSON.stringify(cueState)}`);
  assert(cueState.label.includes('ИГРАЙТЕ СЕЙЧАС'), `Target onset must show ИГРАЙТЕ СЕЙЧАС: ${JSON.stringify(cueState)}`);
  const cueTraces = await cdp.evaluate('window.__m3kAttemptCount ?? 0');
  const cuePlayed = await cdp.evaluate(`window.__m3kPlayAt(${JSON.stringify(C_MAJOR_ROOT)}, 0)`);
  assert(cuePlayed, 'Target-onset chord was not played.');
  await waitFor(cdp, `(window.__m3kAttemptCount ?? 0) > ${cueTraces}`, 'target-onset evaluation');
  const boundaryOutcome = await waitChordOutcome(cdp, 'target-onset outcome');
  assert(boundaryOutcome.trace?.timingBand === 'on_time' && boundaryOutcome.trace?.timingAccepted === true,
    `Chord at the target onset must be accepted on time: ${JSON.stringify(boundaryOutcome.trace)}`);
  assert(boundaryOutcome.timingAcceptedAttr === 'accepted' && boundaryOutcome.timingHasBad === false,
    `Accepted timing must not render as failed: ${JSON.stringify({ attr: boundaryOutcome.timingAcceptedAttr, bad: boundaryOutcome.timingHasBad })}`);
  await midiOff(cdp, C_MAJOR_ROOT);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, 'prepare after target-onset check', 120);

  // 7. Beginner timing acceptance: 0 → Точ, -250 → принято (рано), +250 → принято (поздно), +350 → отказ.
  const timingCases = [
    { delta: 0, band: 'on_time', label: 'Точно', accepted: true },
    { delta: -250, band: 'early', label: 'Немного рано — засчитано', accepted: true, screenshot: '02-accepted-early.png' },
    { delta: 250, band: 'late', label: 'Немного поздно — засчитано', accepted: true, screenshot: '03-accepted-late.png' },
    { delta: 350, band: 'missed', label: 'Слишком поздно', accepted: false }
  ];
  for (const timingCase of timingCases) {
    await gestureStart(cdp, [48]);
    const tracesBefore = await cdp.evaluate('window.__m3kAttemptCount ?? 0');
    const played = await cdp.evaluate(`window.__m3kPlayAt(${JSON.stringify(C_MAJOR_ROOT)}, ${timingCase.delta})`);
    assert(played, `Timing case ${timingCase.delta} ms: chord was not played.`);
    await waitFor(cdp, `(window.__m3kAttemptCount ?? 0) > ${tracesBefore}`, `evaluation for ${timingCase.delta} ms`);
    const outcome = await waitChordOutcome(cdp, `timing ${timingCase.delta} ms`);
    assert(outcome.trace?.timingBand === timingCase.band && outcome.trace?.timingAccepted === timingCase.accepted,
      `Timing case ${timingCase.delta} ms: ${JSON.stringify(outcome.trace)}`);
    assert(outcome.feedback.includes(timingCase.label), `Timing case ${timingCase.delta} ms: feedback missing "${timingCase.label}": ${outcome.feedback}`);
    if (timingCase.accepted) {
      assert(outcome.timingAcceptedAttr === 'accepted' && outcome.timingHasBad === false,
        `Accepted timing ${timingCase.delta} ms must not render as failed: ${JSON.stringify({ attr: outcome.timingAcceptedAttr, bad: outcome.timingHasBad })}`);
    } else {
      assert(outcome.timingAcceptedAttr === 'failed' && outcome.timingHasBad === true,
        `Failed timing ${timingCase.delta} ms must render as failed: ${JSON.stringify({ attr: outcome.timingAcceptedAttr, bad: outcome.timingHasBad })}`);
    }
    if (timingCase.screenshot) screenshots.push(await saveScreenshot(cdp, timingCase.screenshot));
    await midiOff(cdp, C_MAJOR_ROOT);
    await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, `prepare after ${timingCase.delta} ms case`, 120);
  }

  // 8. twoStrikes: two distinct MIDI attacks of the same chord in one question.
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.twoStrikes });
  await waitForMidi(cdp);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'twoStrikes'`, 'twoStrikes stage');
  await gestureStart(cdp, [50]);
  const strikesBefore = await cdp.evaluate('window.__m3kAttemptCount ?? 0');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.timingWindow === 'open'`, 'strike 1 window');
  const strikeOne = await cdp.evaluate(`window.__m3kPlayAt(${JSON.stringify(C_MAJOR_ROOT)}, 0)`);
  assert(strikeOne, 'Strike 1 was not played.');
  await midiOff(cdp, C_MAJOR_ROOT);
  await waitFor(cdp, `(window.__m3kAttemptCount ?? 0) > ${strikesBefore}`, 'strike 1 evaluation');
  await waitFor(cdp, `document.querySelector('[data-testid="rhythm-strike-progress"]')?.innerText.includes('Удар 2 из 2')`, 'second strike progress');
  const strikeQuestionId = await cdp.evaluate('window.__m3kRecentAttempts?.at(-1)?.questionInstanceId ?? null');
  // Beat 2 is the current musical position: the strike-2 cue must not be visible yet.
  await delay(300);
  const beatTwoState = await cdp.evaluate(`(() => ({
    playNow: document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.playNow ?? null,
    label: document.querySelector('[data-testid="rhythm-timing-state"]')?.innerText || '',
    progress: document.querySelector('[data-testid="rhythm-strike-progress"]')?.innerText || '',
    activeBeat: document.querySelector('[data-testid="rhythm-beat-indicator"] .active')?.innerText.trim() ?? null
  }))()`);
  assert(beatTwoState.playNow === 'hidden', `Strike-2 cue must stay hidden during beat 2: ${JSON.stringify(beatTwoState)}`);
  assert(!beatTwoState.label.includes('ИГРАЙТЕ СЕЙЧАС'), `Strike-2 PLAY NOW must not appear during beat 2: ${JSON.stringify(beatTwoState)}`);
  assert(beatTwoState.progress.includes('Удар 2 из 2'), `Strike progress must announce beat 3: ${JSON.stringify(beatTwoState)}`);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.playNow === 'visible'`, 'strike 2 cue at beat 3', 120);
  const strikeTwoCue = await cdp.evaluate(`(() => ({
    label: document.querySelector('[data-testid="rhythm-timing-state"]')?.innerText || '',
    activeBeat: document.querySelector('[data-testid="rhythm-beat-indicator"] .active')?.innerText.trim() ?? null,
    onset: window.__m3kTimingTarget?.onset ?? null,
    shownAt: window.__m3kPlayNowShownAt ?? null
  }))()`);
  assert(strikeTwoCue.label.includes('Удар 2 из 2 · ИГРАЙТЕ СЕЙЧАС'), `Beat 3 must show «Удар 2 из 2 · ИГРАЙТЕ СЕЙЧАС»: ${JSON.stringify(strikeTwoCue)}`);
  assert(strikeTwoCue.activeBeat === '3', `Beat 3 must be the active beat with the strike-2 cue: ${JSON.stringify(strikeTwoCue)}`);
  assert(typeof strikeTwoCue.onset === 'number' && typeof strikeTwoCue.shownAt === 'number' && Math.abs(strikeTwoCue.shownAt - strikeTwoCue.onset) < 80,
    `Strike-2 cue must switch at the beat-3 onset: ${JSON.stringify(strikeTwoCue)}`);
  const strikeTwo = await cdp.evaluate(`window.__m3kPlayAt(${JSON.stringify(C_MAJOR_ROOT)}, 0)`);
  assert(strikeTwo, 'Strike 2 was not played.');
  await midiOff(cdp, C_MAJOR_ROOT);
  await waitFor(cdp, `(window.__m3kAttemptCount ?? 0) > ${strikesBefore + 1}`, 'strike 2 evaluation');
  const twoStrikesOutcome = await waitChordOutcome(cdp, 'twoStrikes success');
  assert(twoStrikesOutcome.feedback.includes('Оба удара приняты'), `twoStrikes did not complete: ${twoStrikesOutcome.feedback}`);
  assert(twoStrikesOutcome.trace?.questionInstanceId === strikeQuestionId && Boolean(strikeQuestionId),
    `Both strikes must share one question: ${JSON.stringify({ first: strikeQuestionId, second: twoStrikesOutcome.trace?.questionInstanceId })}`);
  assert((await cdp.evaluate('window.__m3kAttemptCount ?? 0')) === strikesBefore + 2, 'twoStrikes must produce exactly two evaluations.');
  const strikeLogs = await readStore(cdp, 'reviewLogEvents');
  assert(strikeLogs.length === 0, `twoStrikes module assessment must not write ReviewLogs: ${JSON.stringify(strikeLogs)}`);

  // 8b. Holding the chord after strike 1 must surface a release prompt, not a silent lock.
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, 'prepare for held strike test', 120);
  await gestureStart(cdp, [50]);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.timingWindow === 'open'`, 'held strike 1 window');
  const heldStrikeOne = await cdp.evaluate(`window.__m3kPlayAt(${JSON.stringify(C_MAJOR_ROOT)}, 0)`);
  assert(heldStrikeOne, 'Held strike 1 was not played.');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.releaseRequired === 'true'`, 'release required after held strike 1');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.playNow === 'hidden'`, 'PLAY NOW suppressed while keys are held');
  const heldUi = await cdp.evaluate(`(() => ({
    releaseHint: document.querySelector('[data-testid="rhythm-release-hint"]')?.innerText || '',
    progress: document.querySelector('[data-testid="rhythm-strike-progress"]')?.innerText || ''
  }))()`);
  assert(heldUi.releaseHint.includes('Отпустите клавиши'), `Release prompt missing while holding: ${JSON.stringify(heldUi)}`);
  assert(heldUi.progress.includes('Удар 2 из 2'), `Strike progress missing while holding: ${JSON.stringify(heldUi)}`);
  await midiOff(cdp, C_MAJOR_ROOT);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.releaseRequired === 'false'`, 'release cleared after note-off');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmPhase === 'prepare'`, 'prepare after held strike run', 160);

  // 9. Advanced-module exclusivity and screen-piano corrective reload (stabilization preservation).
  await startRoadmapModule(cdp, 'intervals', '[data-testid="interval-stage"]');
  assert(await cdp.evaluate(`!document.querySelector('[data-testid="m3k-module-stage"]')`), 'Starting Intervals left a stale Chord Rhythm module mounted.');
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.liveAssessment });
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferAssessment'`, 'live assessment');
  await runRhythmTrial(cdp, WRONG_CHORD_ID);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"] .rhythm-feedback.bad') !== null`, 'failed trial feedback');
  await delay(400);
  const persistedCorrective = (await readStore(cdp, 'learningProgress')).find(record => record.id === 'advanced-chord-rhythm:session');
  assert(persistedCorrective?.chordRhythmSnapshot?.assessment?.pendingCorrective === true, `Pending corrective was not persisted: ${JSON.stringify(persistedCorrective?.chordRhythmSnapshot)}`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferAssessment'`, 'corrective state after reload');
  await runRhythmTrial(cdp, 'C');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"] .rhythm-feedback.good')?.innerText.includes('Исправлено')`, 'corrective completion');
  const logsAfterCorrective = await readStore(cdp, 'reviewLogEvents');
  assert(logsAfterCorrective.length === 0, `Module assessment unexpectedly wrote FSRS review logs: ${JSON.stringify(logsAfterCorrective)}`);

  // 5. Failed attempt buffering: bounded assessment -> remediation -> fresh retry is preserved.
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.failingAssessment });
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferAssessment'`, 'failing assessment trial 12');
  await runRhythmTrial(cdp, WRONG_CHORD_ID);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"] .rhythm-feedback.bad') !== null`, 'failed trial feedback');
  await runRhythmTrial(cdp, 'F');
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferResult'`, 'failed assessment result');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="rhythm-start-remediation"]'))`, 'remediation action');
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

  // 6. Terminal failed retry keeps both exits.
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.failedRetry });
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferResult'`, 'failed retry result');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="rhythm-return-to-learning"]'))`, 'return-to-learning action');
  assert(await cdp.evaluate(`Boolean(document.querySelector('[data-testid="rhythm-exit-to-program"]'))`), 'Failed retry has no Program exit.');
  await cdp.evaluate(`document.querySelector('[data-testid="rhythm-return-to-learning"]')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'oneChordPerBar'`, 'targeted guided rhythm step');

  // 7. Passed assessment completes and exits into normal practice without a reload.
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.passedAssessment });
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'transferResult'`, 'passed assessment result');
  await cdp.evaluate(`document.querySelector('[data-testid="rhythm-complete-module"]')?.click()`);
  await waitFor(cdp, `document.querySelector('[data-testid="chord-rhythm-stage"]')?.dataset.rhythmStep === 'moduleComplete'`, 'module completion');
  const completionRecords = (await readStore(cdp, 'learningProgress')).filter(record => record.id.startsWith('advanced-chord-rhythm:'));
  assert(completionRecords.some(record => record.id === 'advanced-chord-rhythm:complete' && record.state === 'retention'), `Module completion was not persisted: ${JSON.stringify(completionRecords.map(record => [record.id, record.state]))}`);
  await cdp.evaluate(`document.querySelector('[data-testid="rhythm-continue-practice"]')?.click()`);
  await waitFor(cdp, `!document.querySelector('[data-testid="m3k-module-stage"]')`, 'Chord Rhythm module exit');
  await waitFor(cdp, `document.querySelector('[data-page="practice"].active') !== null`, 'practice page after exit');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="daily-rhythm-stage"]')) || Boolean(document.querySelector('.card-stage-wrap')) || Boolean(document.querySelector('.session-complete-stage-wrap'))`, 'normal practice lifecycle after exit');

  const runtimeExceptions = cdp.runtimeExceptions;
  const consoleErrors = cdp.consoleErrors.filter(message => !message.includes('favicon'));
  assert(runtimeExceptions.length === 0, `Runtime exceptions: ${runtimeExceptions.join(' | ')}`);
  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);

  await mkdir(screenshotDir, { recursive: true });
  for (const shot of screenshots) {
    await writeFile(path.join(screenshotDir, shot.fileName), shot.bytes);
  }
  console.info(`M3K Rev1 smoke passed with ${screenshots.length} screenshots.`);
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

