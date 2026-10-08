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
const screenshotDir = path.join(projectDir, 'acceptance', 'm3l-rev1', 'screenshots');
const summaryPath = path.join(projectDir, 'acceptance', 'm3l-rev1', 'smoke-summary.json');

const HAND_KEYS = {
  C: { bass: 'C3', triad: ['C4', 'E4', 'G4'] },
  'G/B': { bass: 'B2', triad: ['B3', 'D4', 'G4'] },
  Am: { bass: 'A2', triad: ['A3', 'C4', 'E4'] },
  F: { bass: 'F2', triad: ['F3', 'A3', 'C4'] }
};
const MIDI_KEYS = {
  C: { bass: 48, triad: [60, 64, 67] },
  'G/B': { bass: 47, triad: [59, 62, 67] },
  Am: { bass: 45, triad: [57, 60, 64] },
  F: { bass: 41, triad: [53, 57, 60] }
};
const WRONG_TRIAD = [65, 69, 72];

const fakeMidiScript = `(() => {
  const input = {id:'m3l-fake-midi',name:'M3L acceptance MIDI',manufacturer:'Codex',state:'connected',connection:'open',type:'input',onmidimessage:null};
  const access = {inputs:new Map([[input.id,input]]),onstatechange:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});
  window.__m3lMidiInput = input;
  window.__m3lNoteOn = notes => notes.forEach(note => input.onmidimessage?.({data:new Uint8Array([0x90,note,100])}));
  window.__m3lNoteOff = notes => notes.forEach(note => input.onmidimessage?.({data:new Uint8Array([0x80,note,0])}));
  window.__m3lPlayNotesAt = (notes, onset, durationMs = 60) => new Promise(resolve => {
    const started = performance.now();
    const guard = setInterval(() => {
      if (performance.now() >= onset) {
        clearInterval(guard);
        window.__m3lNoteOn(notes);
        setTimeout(() => window.__m3lNoteOff(notes), durationMs);
        resolve(true);
      } else if (performance.now() - started > 20000) {
        clearInterval(guard);
        resolve(false);
      }
    }, 4);
  });
  window.__m3lPlaySequence = events => new Promise(resolve => {
    const started = performance.now();
    for (const event of events) {
      const delay = Math.max(0, event.at - performance.now());
      setTimeout(() => {
        window.__m3lNoteOn(event.notes);
        setTimeout(() => window.__m3lNoteOff(event.notes), event.durationMs ?? 60);
      }, delay);
    }
    const last = events.length ? Math.max(...events.map(event => event.at)) : performance.now();
    const done = setInterval(() => {
      if (performance.now() >= last + 120 || performance.now() - started > 30000) {
        clearInterval(done);
        resolve(true);
      }
    }, 10);
  });
  window.__m3lDisconnect = () => {
    input.state = 'disconnected';
    input.connection = 'closed';
    input.onmidimessage = null;
    access.onstatechange?.();
  };
  window.__m3lReconnect = () => {
    input.state = 'connected';
    input.connection = 'open';
    access.onstatechange?.();
  };
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
    const twoHand = await server.ssrLoadModule('/src/core/learning/twoHand.ts');
    const fixture = await server.ssrLoadModule('/tests/fixtures/stabilizationProfile.ts');
    const profile = fixture.createSanitizedStabilizationProfile();
    const progress = new Map(profile.learningProgress);
    const now = Date.now() - 10_000;
    const complete = id => {
      const record = learning.createInitialLearningProgress(id, now);
      progress.set(id, { ...record, state: 'retention', modelCompleted: true, guidedSuccesses: 2, independentUnhintedSuccesses: 8, updatedAt: now });
    };
    for (const id of [
      ...learning.FIRST_RUN_CF_ALL_ITEM_IDS,
      ...learning.WHITE_KEY_CURRICULUM_ALL_ITEM_IDS,
      ...learning.MILESTONE_3D_ALL_ITEM_IDS,
      bass.BASS_GRAND_ITEM_IDS.COMPLETE,
      intervals.INTERVAL_ITEM_IDS.COMPLETE,
      triads.TRIAD_ITEM_IDS.COMPLETE,
      inversions.INVERSION_ITEM_IDS.COMPLETE,
      harmony.HARMONY_ITEM_IDS.COMPLETE,
      chordRhythm.CHORD_RHYTHM_ITEM_IDS.COMPLETE
    ]) complete(id);

    assert(harmony.getHarmonyModuleStatus(progress) === 'completed', 'Synthetic profile does not complete Harmony.');
    assert(chordRhythm.getChordRhythmModuleStatus(progress) === 'completed', 'Synthetic profile does not complete Chord Rhythm.');
    assert(twoHand.getTwoHandModuleStatus(progress) === 'not_started', 'Synthetic profile unexpectedly reports Two-Hand progress.');

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
      ...overrides
    });
    const snapshot = (overrides = {}) => ({
      stage: 'handOrientation',
      chordIndex: 0,
      leftIndex: 0,
      rightIndex: 0,
      simultaneousIndex: 0,
      alternatingIndex: 0,
      barsPassed: 0,
      independentPassed: false,
      awaitingCorrective: false,
      trialHadWrong: false,
      assessment: assessment(),
      ...overrides
    });
    const base = new Map(progress);
    const sessionProfile = twoHandSnapshot => [...(() => {
      const next = new Map(base);
      const record = learning.createInitialLearningProgress(twoHand.TWO_HAND_ITEM_IDS.SESSION, now);
      next.set(record.id, { ...record, modelCompleted: true, twoHandSnapshot });
      return next.values();
    })()];
    const completedProfile = [...(() => {
      const next = new Map(base);
      const session = learning.createInitialLearningProgress(twoHand.TWO_HAND_ITEM_IDS.SESSION, now);
      next.set(session.id, {
        ...session,
        modelCompleted: true,
        twoHandSnapshot: snapshot({ stage: 'moduleComplete', assessment: assessment({ phase: 'passed', trialsCompleted: 12, correctFirstAttempts: 12 }) })
      });
      const done = learning.createInitialLearningProgress(twoHand.TWO_HAND_ITEM_IDS.COMPLETE, now);
      next.set(done.id, { ...done, state: 'retention', modelCompleted: true, guidedSuccesses: 2, independentUnhintedSuccesses: 5, updatedAt: now });
      return next.values();
    })()];

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
        orientation: sessionProfile(snapshot({})),
        rightHand: sessionProfile(snapshot({ stage: 'rightHand', leftIndex: 4 })),
        simultaneous: sessionProfile(snapshot({ stage: 'simultaneous', leftIndex: 4, rightIndex: 4 })),
        fourBar: sessionProfile(snapshot({ stage: 'fourBar', leftIndex: 4, rightIndex: 4, simultaneousIndex: 4, alternatingIndex: 4, chordIndex: 0 })),
        independent: sessionProfile(snapshot({ stage: 'independent', leftIndex: 4, rightIndex: 4, simultaneousIndex: 4, alternatingIndex: 4, independentPassed: false })),
        remediation: sessionProfile(snapshot({
          stage: 'transferRemediation',
          leftIndex: 4,
          rightIndex: 4,
          simultaneousIndex: 4,
          alternatingIndex: 4,
          barsPassed: 4,
          independentPassed: true,
          assessment: assessment({
            phase: 'remediation',
            trialIndex: 0,
            trialsCompleted: 12,
            correctFirstAttempts: 8,
            failedTrialIndexes: [0, 1, 2],
            remediationTrialIndexes: [0, 1, 2],
            remediationIndex: 0,
            remediationUsed: 1
          })
        })),
        failedTerminal: sessionProfile(snapshot({
          stage: 'transferResult',
          leftIndex: 4,
          rightIndex: 4,
          simultaneousIndex: 4,
          alternatingIndex: 4,
          barsPassed: 4,
          independentPassed: true,
          assessment: assessment({
            blockKind: 'retry',
            phase: 'failed',
            trialIndex: 0,
            trialsCompleted: 8,
            correctFirstAttempts: 2,
            failedTrialIndexes: [0, 1, 2, 3, 4, 5, 6, 7],
            remediationUsed: 3
          })
        })),
        completed: completedProfile
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

async function waitFor(cdp, expression, description, attempts = 200) {
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

async function readTwoHandSnapshot(cdp) {
  return cdp.evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('learningProgress', 'readonly');
      const row = tx.objectStore('learningProgress').get('advanced-two-hand:session');
      row.onsuccess = () => { db.close(); resolve(row.result?.twoHandSnapshot ?? null); };
      row.onerror = () => reject(row.error);
    };
  })`);
}

async function waitSnapshot(cdp, predicateExpression, description, attempts = 60) {
  let observed = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const snapshot = await readTwoHandSnapshot(cdp);
    if (snapshot && (await cdp.evaluate(`(snapshot => (${predicateExpression}))(${JSON.stringify(snapshot)})`))) return snapshot;
    observed = snapshot;
    await delay(100);
  }
  throw new Error(`Timed out waiting for snapshot: ${description}; observed=${JSON.stringify(observed)}`);
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
  const freshUrl = `${await cdp.evaluate('location.origin + location.pathname')}?m3lSeed=${Date.now()}`;
  await cdp.send('Page.navigate', { url: freshUrl });
  await waitFor(cdp, `location.href === ${JSON.stringify(freshUrl)} && document.readyState === 'complete' && document.querySelectorAll('.top-nav-btn').length === 9`, 'reloaded synthetic profile');
  await delay(500);
}

async function saveScreenshot(cdp, fileName) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(path.join(screenshotDir, fileName), Buffer.from(result.data, 'base64'));
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

async function clickKeyboardKeys(cdp, keyIds) {
  await cdp.evaluate(`(() => { for (const id of ${JSON.stringify(keyIds)}) document.querySelector('.keyboard button[data-id="' + id + '"]')?.click(); return true; })()`);
}

function stageSelector() {
  return '[data-testid="two-hand-stage"]';
}

async function stageInfo(cdp) {
  return cdp.evaluate(`(() => {
    const stage = document.querySelector(${JSON.stringify(stageSelector())});
    return stage ? {
      stage: stage.dataset.twoHandStage,
      pattern: stage.dataset.twoHandPattern,
      chord: stage.dataset.twoHandChord,
      running: stage.dataset.twoHandRunning,
      countIn: stage.dataset.twoHandCountIn,
      beat: stage.dataset.twoHandBeat,
      bar: stage.dataset.twoHandBar,
      hints: stage.dataset.twoHandHints,
      awaiting: stage.dataset.twoHandAwaiting,
      tone: stage.dataset.twoHandFeedbackTone,
      instruction: stage.querySelector('[data-testid="two-hand-instruction"]')?.innerText || '',
      parts: [...stage.querySelectorAll('[data-testid="two-hand-parts"] strong')].map(item => item.innerText.trim()),
      feedback: stage.querySelector('[data-testid="two-hand-feedback"]')?.innerText || ''
    } : null;
  })()`);
}

async function waitStage(cdp, stage, description = stage) {
  await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandStage === ${JSON.stringify(stage)}`, description);
}

async function waitRunOpen(cdp) {
  const opened = await cdp.evaluate(`new Promise(resolve => {
    const started = performance.now();
    const check = () => {
      const stage = document.querySelector(${JSON.stringify(stageSelector())});
      if (stage && stage.dataset.twoHandRunning === 'true' && stage.dataset.twoHandCountIn === '') { resolve(true); return; }
      if (performance.now() - started > 12000) { resolve(false); return; }
      requestAnimationFrame(check);
    };
    check();
  })`);
  assert(opened, 'Timed out waiting for the open timing window.');
}

async function waitRunClosed(cdp) {
  await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandRunning === 'false'`, 'closed timing window');
}

async function startRunAndOpen(cdp) {
  await realClick(cdp, '[data-testid="two-hand-start-run"]');
  await waitRunOpen(cdp);
}

async function startRunAndArm(cdp) {
  await realClick(cdp, '[data-testid="two-hand-start-run"]');
  await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandCountIn === '1'`, 'last count-in beat');
  return cdp.evaluate('({ timing: window.__m3lTimingTarget, targets: window.__m3lPhraseTargets })');
}

async function playSequence(cdp, events) {
  const played = await cdp.evaluate(`window.__m3lPlaySequence(${JSON.stringify(events).replace(/"TARGET_(\d)_ONSET"/g, 'window.__m3lPhraseTargets[$1].onset').replace(/"TARGET_(\d)_CHORD"/g, 'window.__m3lPhraseTargets[$1].chordOnset')})`);
  assert(played, 'Scheduled MIDI sequence did not play.');
}

async function midiPlay(cdp, notes, onsetExpression) {
  const played = await cdp.evaluate(`window.__m3lPlayNotesAt(${JSON.stringify(notes)}, ${onsetExpression})`);
  assert(played, `MIDI notes ${JSON.stringify(notes)} were not played at ${onsetExpression}.`);
}

async function lastAttempt(cdp) {
  return cdp.evaluate('window.__m3lLastAttempt ?? null');
}

async function openProgram(cdp) {
  await cdp.evaluate(`(() => [...document.querySelectorAll('.top-nav-btn')].find(button => button.innerText.trim() === 'Программа')?.click())()`);
  await waitFor(cdp, `document.querySelector('[data-page="curriculum"].active') !== null`, 'Program page');
}

async function startTwoHandModule(cdp) {
  await openProgram(cdp);
  const selected = await cdp.evaluate(`(() => {
    const card = document.querySelector('[data-stage-id="two_hand"]');
    card?.click();
    return Boolean(card);
  })()`);
  assert(selected, 'Program stage two_hand is missing.');
  await waitFor(cdp, `Boolean(document.querySelector('.roadmap-action-btn'))`, 'two_hand module action');
  await cdp.evaluate('document.querySelector(".roadmap-action-btn")?.click()');
  await waitFor(cdp, `Boolean(document.querySelector(${JSON.stringify(stageSelector())}))`, 'two-hand stage');
}

async function seedAndStartModule(cdp, synthetic, profileName) {
  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles[profileName] });
  await startTwoHandModule(cdp);
}

const scenarioResults = [];
const evidence = {
  failedAssessmentReturnToLearning: false,
  wrongRemediationNextBlocked: false,
  correctRemediationNextAvailable: false,
  fourBarsOneCountInContinuous: false,
  independentNoNoteHints: false,
  wrongBassClassification: false,
  delayedExtraNoteNoFalseSuccess: false,
  midiDisconnectSafeCancel: false,
  assessmentTwelveTrialsRealInput: false,
  p0RightHandCorrectionMidi: false,
  p0RightHandCorrectionScreen: false,
  p0FreshCorrectFirstAttempt: false,
  p0PersistenceUnchanged: false
};

async function scenario(name, fn) {
  await fn();
  scenarioResults.push(name);
  console.log(`PASS ${name}`);
}

try {
  await mkdir(screenshotDir, { recursive: true });
  const synthetic = await createSyntheticProfile();
  const previewPort = await findFreePort();
  preview = spawn(process.execPath, [previewEntry, 'preview', '--strictPort', '--port', String(previewPort), '--host', '127.0.0.1'], {
    cwd: projectDir, stdio: 'ignore', windowsHide: true
  });
  const previewUrl = `http://127.0.0.1:${previewPort}${appRoute}`;
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

  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-m3l-rev1-'));
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
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelectorAll('.top-nav-btn').length === 9`, 'initial app load');
  await waitFor(cdp, `Boolean(window.__m3lMidiInput)`, 'fake MIDI availability');
  await delay(600);

  await scenario('M3L-P0-A wrong right-hand triad via MIDI then correct chord advances exactly once', async () => {
    await seedAndStartModule(cdp, synthetic, 'rightHand');
    await waitStage(cdp, 'rightHand', 'guided right hand stage');
    const beforeLogs = await readStore(cdp, 'reviewLogEvents');
    const cVoicing = HAND_KEYS.C;
    await cdp.evaluate(`window.__m3lNoteOn(${JSON.stringify(WRONG_TRIAD)})`);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandAwaiting === 'true'`, 'awaiting corrective after wrong MIDI triad');
    await cdp.evaluate(`window.__m3lNoteOff(${JSON.stringify(WRONG_TRIAD)})`);
    await delay(120);
    await cdp.evaluate(`window.__m3lNoteOn(${JSON.stringify(MIDI_KEYS.C.triad)})`);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandChord === 'G/B'`, 'progression to G/B after MIDI correction');
    const info = await stageInfo(cdp);
    assert(info.awaiting === 'false', 'Corrective state did not clear after correct MIDI chord.');
    assert(info.tone === 'good', `Expected good feedback tone, got ${info.tone}.`);
    assert(info.chord === 'G/B', `Expected exactly one advance to G/B, got ${info.chord}.`);
    const snapshot = await waitSnapshot(cdp, 'snapshot.rightIndex === 1', 'rightIndex 1 after one MIDI correction');
    assert(snapshot?.rightIndex === 1, `Expected rightIndex 1 after one correction, got ${snapshot?.rightIndex}.`);
    const afterLogs = await readStore(cdp, 'reviewLogEvents');
    assert(afterLogs.length === beforeLogs.length, 'Guided correction must not create review log entries.');
    evidence.p0RightHandCorrectionMidi = true;
    evidence.p0PersistenceUnchanged = true;
    void cVoicing;
  });

  await scenario('M3L-P0-B on-screen wrong triad then correct chord and a fresh correct first attempt', async () => {
    await clickKeyboardKeys(cdp, ['F4', 'A4', 'C5']);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandAwaiting === 'true'`, 'awaiting corrective after wrong screen triad');
    await clickKeyboardKeys(cdp, ['B3', 'D4', 'G4']);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandChord === 'Am'`, 'progression to Am after screen correction');
    let snapshot = await waitSnapshot(cdp, 'snapshot.rightIndex === 2', 'rightIndex 2 after screen correction');
    assert(snapshot?.rightIndex === 2, `Expected rightIndex 2 after screen correction, got ${snapshot?.rightIndex}.`);
    evidence.p0RightHandCorrectionScreen = true;

    await clickKeyboardKeys(cdp, ['A3', 'C4', 'E4']);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandChord === 'F'`, 'progression to F on fresh first attempt');
    await clickKeyboardKeys(cdp, ['F3', 'A3', 'C4']);
    await waitStage(cdp, 'simultaneous', 'simultaneous stage after fresh correct first attempt');
    snapshot = await waitSnapshot(cdp, 'snapshot.rightIndex === 4', 'rightIndex 4 after fresh attempts');
    assert(snapshot?.rightIndex === 4, `Expected rightIndex 4 after fresh attempts, got ${snapshot?.rightIndex}.`);
    evidence.p0FreshCorrectFirstAttempt = true;
  });

  await scenario('M3L-01 four bars play continuously after one count-in', async () => {
    await seedAndStartModule(cdp, synthetic, 'fourBar');
    await waitStage(cdp, 'fourBar', 'four-bar stage');
    const armed = await startRunAndArm(cdp);
    const targets = armed.targets;
    assert(Array.isArray(targets) && targets.length === 4, `Expected 4 phrase targets, got ${JSON.stringify(targets)}.`);
    assert(targets[1].onset - targets[0].onset === 4000, 'Bars must be four 60 BPM beats apart.');
    assert(targets[0].chordOnset - targets[0].onset === 2000, 'Chord must land on beat 3 of each bar.');
    assert(targets[3].chordOnset - targets[0].onset === 14000, 'Phrase must span four contiguous bars.');
    await saveScreenshot(cdp, '01-m3l-rev1-four-bar-continuous.png');
    const phraseEvents = [];
    for (let barIndex = 0; barIndex < 4; barIndex++) {
      const keys = MIDI_KEYS[['C', 'G/B', 'Am', 'F'][barIndex]];
      phraseEvents.push({ notes: [keys.bass], at: `TARGET_${barIndex}_ONSET`, durationMs: 60 });
      phraseEvents.push({ notes: keys.triad, at: `TARGET_${barIndex}_CHORD`, durationMs: 60 });
    }
    await playSequence(cdp, phraseEvents);
    await waitRunClosed(cdp);
    const phraseResults = await cdp.evaluate('window.__m3lPhraseResults ?? null');
    console.log('phrase results:', JSON.stringify(phraseResults));
    await waitStage(cdp, 'independent', 'independent stage after continuous phrase');
    evidence.fourBarsOneCountInContinuous = true;
  });

  await scenario('M3L-02 independent phrase hides note hints and stays continuous', async () => {
    const info = await stageInfo(cdp);
    assert(info.hints === 'false', 'Independent stage must hide note hints.');
    assert(info.parts.every(part => part === '—'), `Independent parts must hide note lists, got ${JSON.stringify(info.parts)}.`);
    assert(!/[A-G]\d/.test(info.instruction), `Independent instruction must not list exact keys: ${info.instruction}`);
    await saveScreenshot(cdp, '02-m3l-rev1-independent-no-hints.png');
    evidence.independentNoNoteHints = true;
    await startRunAndArm(cdp);
    const independentEvents = [];
    for (let barIndex = 0; barIndex < 4; barIndex++) {
      const keys = MIDI_KEYS[['C', 'G/B', 'Am', 'F'][barIndex]];
      independentEvents.push({ notes: [keys.bass], at: `TARGET_${barIndex}_ONSET`, durationMs: 60 });
      independentEvents.push({ notes: keys.triad, at: `TARGET_${barIndex}_CHORD`, durationMs: 60 });
    }
    await playSequence(cdp, independentEvents);
    await waitRunClosed(cdp);
    await waitStage(cdp, 'transferAssessment', 'assessment after independent phrase');
  });

  await scenario('M3L-03 complete 12 assessment trials through the real MIDI pipeline', async () => {
    for (let trial = 0; trial < 12; trial++) {
      const info = await stageInfo(cdp);
      assert(info.stage === 'transferAssessment', `Trial ${trial + 1}: expected assessment stage, got ${info.stage}.`);
      const chordId = info.chord;
      const keys = MIDI_KEYS[chordId];
      assert(keys, `Trial ${trial + 1}: unknown chord ${chordId}.`);
      const armed = await startRunAndArm(cdp);
      const timing = armed.timing;
      assert(timing && Number.isFinite(timing.onset), `Trial ${trial + 1}: timing target missing.`);
      const events = info.pattern === 'simultaneous'
        ? [
            { notes: [keys.bass], at: timing.onset, durationMs: 60 },
            { notes: keys.triad, at: timing.onset + 20, durationMs: 60 }
          ]
        : [
            { notes: [keys.bass], at: timing.onset, durationMs: 60 },
            { notes: keys.triad, at: timing.chordOnset, durationMs: 60 }
          ];
      await playSequence(cdp, events);
      await waitRunClosed(cdp);
      const attempt = await lastAttempt(cdp);
      assert(attempt?.correct === true, `Trial ${trial + 1} not graded correct: ${JSON.stringify(attempt)}.`);
      if (trial === 5) await saveScreenshot(cdp, '03-m3l-rev1-assessment-midi.png');
    }
    await waitStage(cdp, 'transferResult', 'assessment result');
    const snapshot = await readTwoHandSnapshot(cdp);
    assert(snapshot?.assessment?.phase === 'passed', `Assessment should pass after 12 correct MIDI trials, got ${snapshot?.assessment?.phase}.`);
    assert(snapshot?.assessment?.correctFirstAttempts === 12, `Expected 12 first-attempt successes, got ${snapshot?.assessment?.correctFirstAttempts}.`);
    await realClick(cdp, '[data-testid="two-hand-complete-module"]');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-continue-practice"]'))`, 'module complete actions');
    const stored = await readStore(cdp, 'learningProgress');
    assert(stored.find(row => row.id === 'advanced-two-hand:complete')?.state === 'retention', 'Module completion retention record missing.');
    evidence.assessmentTwelveTrialsRealInput = true;
  });

  await scenario('M3L-04 wrong LH bass is classified as wrong bass, not missing left hand', async () => {
    await seedAndStartModule(cdp, synthetic, 'simultaneous');
    await waitStage(cdp, 'simultaneous', 'simultaneous stage');
    const wrongBassArmed = await startRunAndArm(cdp);
    await playSequence(cdp, [
      { notes: [38], at: wrongBassArmed.timing.onset, durationMs: 60 },
      { notes: MIDI_KEYS.C.triad, at: wrongBassArmed.timing.onset + 20, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    const attempt = await lastAttempt(cdp);
    assert(attempt?.outcome === 'wrong_bass', `Expected wrong_bass, got ${JSON.stringify(attempt)}.`);
    assert(attempt?.bassCorrect === false, 'Wrong bass must be reported as an incorrect bass.');
    evidence.wrongBassClassification = true;
  });

  await scenario('M3L-05 delayed extra note cannot receive false success', async () => {
    await seedAndStartModule(cdp, synthetic, 'simultaneous');
    const extraArmed = await startRunAndArm(cdp);
    await playSequence(cdp, [
      { notes: [MIDI_KEYS.C.bass], at: extraArmed.timing.onset, durationMs: 60 },
      { notes: MIDI_KEYS.C.triad, at: extraArmed.timing.onset + 20, durationMs: 60 },
      { notes: [72], at: extraArmed.timing.onset + 250, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    const attempt = await lastAttempt(cdp);
    assert(attempt?.correct === false, `Delayed extra note must not pass, got ${JSON.stringify(attempt)}.`);
    assert(attempt?.outcome === 'extra_note', `Expected extra_note, got ${JSON.stringify(attempt)}.`);
    evidence.delayedExtraNoteNoFalseSuccess = true;
  });

  await scenario('M3L-06 MIDI disconnect cancels the attempt without grading', async () => {
    await seedAndStartModule(cdp, synthetic, 'simultaneous');
    await cdp.evaluate('window.__m3lLastAttempt = null');
    await startRunAndArm(cdp);
    const beforeLogs = await readStore(cdp, 'reviewLogEvents');
    await cdp.evaluate('window.__m3lDisconnect()');
    await waitRunClosed(cdp);
    const info = await stageInfo(cdp);
    assert(info.tone === 'warn', `Disconnect should show a warning, got ${info.tone}.`);
    assert((await lastAttempt(cdp)) === null, 'Interrupted attempt must not be graded.');
    const afterLogs = await readStore(cdp, 'reviewLogEvents');
    assert(afterLogs.length === beforeLogs.length, 'Disconnect must not create review entries.');
    await cdp.evaluate('window.__m3lReconnect()');
    evidence.midiDisconnectSafeCancel = true;
  });

  await scenario('M3L-07 failed assessment returns to learning with history preserved', async () => {
    await seedAndStartModule(cdp, synthetic, 'failedTerminal');
    await waitStage(cdp, 'transferResult', 'terminal failed result');
    await realClick(cdp, '[data-testid="two-hand-return-to-learning"]');
    await waitStage(cdp, 'simultaneous', 'return to learning stages');
    const snapshot = await waitSnapshot(
      cdp,
      'snapshot.assessment?.phase === "failed" && snapshot.independentPassed === false',
      'terminal failure recovery snapshot with preserved history'
    );
    assert(snapshot?.assessment?.phase === 'failed', 'Historical failed assessment must be preserved.');
    assert(snapshot?.assessment?.trialsCompleted === 8, `Historical trial outcomes must be preserved, got ${snapshot?.assessment?.trialsCompleted}.`);
    assert(snapshot?.independentPassed === false, 'Learning progress must restart after terminal failure.');
    const stored = await readStore(cdp, 'learningProgress');
    assert(!stored.some(row => row.id === 'advanced-two-hand:complete'), 'Terminal failure must not mark the module complete.');
    evidence.failedAssessmentReturnToLearning = true;
  });

  await scenario('M3L-08 remediation gate blocks Next after a wrong item and maps failed trial positions', async () => {
    await seedAndStartModule(cdp, synthetic, 'remediation');
    await waitStage(cdp, 'transferRemediation', 'remediation stage');
    let info = await stageInfo(cdp);
    assert(info.chord === 'C', `First remediation item should target failed trial 0 (C), got ${info.chord}.`);
    assert(await cdp.evaluate(`!document.querySelector('[data-testid="two-hand-remediation-next"]')`), 'Next must be hidden before the item is corrected.');

    const firstItemArmed = await startRunAndArm(cdp);
    await playSequence(cdp, [
      { notes: [38], at: firstItemArmed.timing.onset, durationMs: 60 },
      { notes: WRONG_TRIAD, at: firstItemArmed.timing.onset + 20, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandAwaiting === 'true'`, 'awaiting corrective after wrong remediation');
    info = await stageInfo(cdp);
    assert(info.chord === 'C', `Wrong remediation must keep the same item, got ${info.chord}.`);
    assert(await cdp.evaluate(`!document.querySelector('[data-testid="two-hand-remediation-next"]')`), 'Next must stay hidden after a wrong remediation attempt.');
    await saveScreenshot(cdp, '04-m3l-rev1-remediation-gate.png');
    evidence.wrongRemediationNextBlocked = true;

    const correctiveArmed = await startRunAndArm(cdp);
    await playSequence(cdp, [
      { notes: [MIDI_KEYS.C.bass], at: correctiveArmed.timing.onset, durationMs: 60 },
      { notes: MIDI_KEYS.C.triad, at: correctiveArmed.timing.onset + 20, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    const correctiveAttempt = await lastAttempt(cdp);
    assert(correctiveAttempt?.correct === true, `Correct remediation attempt failed: ${JSON.stringify(correctiveAttempt)}.`);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandCorrected === 'true'`, 'remediation item corrected');
    const nextButton = await cdp.evaluate(`Boolean(document.querySelector('[data-testid="two-hand-remediation-next"]'))`);
    assert(nextButton, 'Next must appear after the current remediation item is corrected.');
    evidence.correctRemediationNextAvailable = true;
    await realClick(cdp, '[data-testid="two-hand-remediation-next"]');
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandChord === 'G/B'`, 'second remediation item (failed trial 1)');

    const secondKeys = MIDI_KEYS['G/B'];
    const secondArmed = await startRunAndArm(cdp);
    await playSequence(cdp, [
      { notes: [secondKeys.bass], at: secondArmed.timing.onset, durationMs: 60 },
      { notes: secondKeys.triad, at: secondArmed.timing.chordOnset, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    const secondAttempt = await lastAttempt(cdp);
    assert(secondAttempt?.correct === true, `Second remediation item failed: ${JSON.stringify(secondAttempt)}.`);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandCorrected === 'true'`, 'second remediation item corrected');
    await realClick(cdp, '[data-testid="two-hand-remediation-next"]');
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandChord === 'Am'`, 'third remediation item (failed trial 2)');

    const thirdKeys = MIDI_KEYS.Am;
    const thirdInfo = await stageInfo(cdp);
    const thirdArmed = await startRunAndArm(cdp);
    const thirdChordAt = thirdInfo.pattern === 'simultaneous' ? thirdArmed.timing.onset + 20 : thirdArmed.timing.chordOnset;
    await playSequence(cdp, [
      { notes: [thirdKeys.bass], at: thirdArmed.timing.onset, durationMs: 60 },
      { notes: thirdKeys.triad, at: thirdChordAt, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    const thirdAttempt = await lastAttempt(cdp);
    assert(thirdAttempt?.correct === true, `Third remediation item failed: ${JSON.stringify(thirdAttempt)}.`);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandCorrected === 'true'`, 'third remediation item corrected');
    await realClick(cdp, '[data-testid="two-hand-remediation-next"]');
    await waitStage(cdp, 'transferAssessment', 'retry assessment after remediation');
  });

  await scenario('M3L-09 shared metronome count-in 4-3-2-1, play cue and restart integrity', async () => {
    await seedAndStartModule(cdp, synthetic, 'simultaneous');
    await waitStage(cdp, 'simultaneous', 'simultaneous stage');
    await cdp.evaluate('window.__m3lLastAttempt = null; window.__m3lAttemptCount = 0; window.__m3lClockTrace = [];');
    await realClick(cdp, '[data-testid="two-hand-start-run"]');
    let timing = null;
    for (const value of ['4', '3', '2', '1']) {
      await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandCountIn === '${value}'`, `count-in ${value}`);
      if (value === '3') {
        // Count-in input must never grade or complete the exercise.
        await cdp.evaluate(`window.__m3lNoteOn(${JSON.stringify([MIDI_KEYS.C.bass])})`);
        await delay(80);
        await cdp.evaluate(`window.__m3lNoteOff(${JSON.stringify([MIDI_KEYS.C.bass])})`);
      }
      if (value === '1') timing = await cdp.evaluate('window.__m3lTimingTarget');
    }
    assert(timing && Number.isFinite(timing.onset), 'Timing target missing after count-in.');
    await playSequence(cdp, [
      { notes: [MIDI_KEYS.C.bass], at: timing.onset, durationMs: 60 },
      { notes: MIDI_KEYS.C.triad, at: timing.onset + 20, durationMs: 60 }
    ]);
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-play-cue"]'))`, 'visible play cue');
    assert((await cdp.evaluate('window.__m3lAttemptCount ?? 0')) === 0, 'Count-in MIDI input must not be graded.');
    assert((await lastAttempt(cdp)) === null, 'Count-in must not produce an attempt result.');
    await waitRunClosed(cdp);
    const attempt = await lastAttempt(cdp);
    assert(attempt?.correct === true, `Beat 1 performance must succeed: ${JSON.stringify(attempt)}.`);
    assert((await cdp.evaluate('window.__m3lAttemptCount ?? 0')) === 1, 'Exactly one evaluation per run.');
    const firstTrace = await cdp.evaluate('window.__m3lClockTrace ?? []');
    assert(firstTrace.length === 5, `Expected four count-in beats plus the first playable beat, got ${firstTrace.length}.`);
    assert(firstTrace.slice(0, 4).every(item => item.countIn) && firstTrace[4].accent === true && firstTrace[4].playable === true,
      `Clock trace must show four count-in beats and an accented first playable beat: ${JSON.stringify(firstTrace)}.`);

    // Restart must reset the trace and never duplicate evaluations.
    const lateArmed = await startRunAndArm(cdp);
    const lateChord = (await stageInfo(cdp)).chord;
    const lateKeys = MIDI_KEYS[lateChord];
    assert(lateKeys, `Late attempt: unknown chord ${lateChord}.`);
    await waitFor(cdp, `(window.__m3lClockTrace ?? []).length === 5`, 'restarted clock trace');
    await playSequence(cdp, [
      { notes: [lateKeys.bass], at: lateArmed.timing.onset + 450, durationMs: 60 },
      { notes: lateKeys.triad, at: lateArmed.timing.onset + 470, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    const lateAttempt = await lastAttempt(cdp);
    assert(lateAttempt?.correct === false, 'Attempt outside the timing window must be rejected.');
    assert(['timing_failed', 'both_correct_poor_sync'].includes(lateAttempt?.outcome), `Expected a timing rejection, got ${JSON.stringify(lateAttempt)}.`);
    assert((await cdp.evaluate('window.__m3lAttemptCount ?? 0')) === 1, 'Restart must not duplicate evaluations.');
    evidence.metronomeCountInValues = firstTrace.filter(item => item.countIn).map(item => item.countInValue);
    evidence.metronomeFirstPlayableAccent = firstTrace[4].accent === true;
    evidence.metronomeLateRejected = lateAttempt?.outcome ?? null;
  });

  await scenario('M3L-10 integrity: no duplicate events, exceptions or console errors', async () => {
    const logs = await readStore(cdp, 'reviewLogEvents');
    const ids = logs.map(row => row.reviewEventId).filter(Boolean);
    assert(ids.length - new Set(ids).size === 0, 'Duplicate review event identities detected.');
    assert(cdp.runtimeExceptions.length === 0, `Runtime exceptions: ${cdp.runtimeExceptions.join(' | ')}`);
    const fatalConsole = cdp.consoleErrors.filter(message => !message.includes('favicon'));
    assert(fatalConsole.length === 0, `Console errors: ${fatalConsole.join(' | ')}`);
  });

  await writeFile(summaryPath, JSON.stringify({ scenarios: scenarioResults, evidence }, null, 2));
  console.log(`M3L Rev1 smoke passed: ${scenarioResults.length} scenarios.`);
} catch (error) {
  console.error('M3L Rev1 smoke failed:', error);
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { preview?.kill(); } catch {}
  if (tempRoot) { try { await rm(tempRoot, { recursive: true, force: true }); } catch {} }
  if (portFile) { try { await rm(portFile, { force: true }); } catch {} }
}
