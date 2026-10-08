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
const screenshotDir = path.join(projectDir, 'acceptance', 'm3l', 'screenshots');

const HAND_KEYS = {
  C: { bass: 'C3', triad: ['C4', 'E4', 'G4'] },
  'G/B': { bass: 'B2', triad: ['B3', 'D4', 'G4'] },
  Am: { bass: 'A2', triad: ['A3', 'C4', 'E4'] },
  F: { bass: 'F2', triad: ['F3', 'A3', 'C4'] }
};
const SEQUENCE = ['C', 'G/B', 'Am', 'F'];

const fakeMidiScript = `(() => {
  const input = {id:'m3l-fake-midi',name:'M3L acceptance MIDI',manufacturer:'Codex',state:'connected',connection:'open',type:'input',onmidimessage:null};
  const access = {inputs:new Map([[input.id,input]]),onstatechange:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});
  window.__m3lMidiInput = input;
  window.__m3lNoteOn = notes => notes.forEach(note => input.onmidimessage?.({data:new Uint8Array([0x90,note,100])}));
  window.__m3lNoteOff = notes => notes.forEach(note => input.onmidimessage?.({data:new Uint8Array([0x80,note,0])}));
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
      progress.set(id, {
        ...record,
        state: 'retention',
        modelCompleted: true,
        guidedSuccesses: 2,
        independentUnhintedSuccesses: 8,
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
        guided: sessionProfile(snapshot({})),
        alternating: sessionProfile(snapshot({ stage: 'alternating', leftIndex: 4, rightIndex: 4, simultaneousIndex: 4 })),
        failingAssessment: sessionProfile(snapshot({
          stage: 'transferAssessment',
          leftIndex: 4,
          rightIndex: 4,
          simultaneousIndex: 4,
          alternatingIndex: 4,
          barsPassed: 4,
          independentPassed: true,
          assessment: assessment({ trialIndex: 11, trialsCompleted: 11, correctFirstAttempts: 8, failedTrialIndexes: [0, 1, 4] })
        })),
        passedAssessment: sessionProfile(snapshot({
          stage: 'transferResult',
          leftIndex: 4,
          rightIndex: 4,
          simultaneousIndex: 4,
          alternatingIndex: 4,
          barsPassed: 4,
          independentPassed: true,
          assessment: assessment({ phase: 'passed', trialsCompleted: 12, correctFirstAttempts: 11, failedTrialIndexes: [2] })
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

async function waitFor(cdp, expression, description, attempts = 160) {
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

async function clickKeySequentially(cdp, keyIds, pauseMs = 140) {
  for (const keyId of keyIds) {
    await clickKeyboardKeys(cdp, [keyId]);
    await delay(pauseMs);
  }
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
      feedback: stage.querySelector('[data-testid="two-hand-feedback"]')?.innerText || ''
    } : null;
  })()`);
}

async function waitStageDataset(cdp, key, value, description) {
  await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.${key} === ${JSON.stringify(value)}`, description);
}

async function waitRunOpen(cdp) {
  await waitFor(cdp, `(() => { const s = document.querySelector(${JSON.stringify(stageSelector())}); return s && s.dataset.twoHandRunning === 'true' && s.dataset.twoHandCountIn === ''; })()`, 'open timing window');
}

async function waitRunClosed(cdp) {
  await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandRunning === 'false'`, 'closed timing window');
}

async function startRun(cdp) {
  await realClick(cdp, '[data-testid="two-hand-start-run"]');
  await waitRunOpen(cdp);
}

async function playSimultaneous(cdp, chordId, captureDuring) {
  const keys = HAND_KEYS[chordId];
  await startRun(cdp);
  if (captureDuring) await captureDuring();
  await clickKeyboardKeys(cdp, [keys.bass, ...keys.triad]);
  await waitRunClosed(cdp);
}

async function playAlternating(cdp, chordId, captureDuring) {
  const keys = HAND_KEYS[chordId];
  await startRun(cdp);
  await clickKeyboardKeys(cdp, [keys.bass]);
  if (captureDuring) await captureDuring();
  await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandBeat === '2'`, 'third beat for chord');
  await clickKeyboardKeys(cdp, [...keys.triad]);
  await waitRunClosed(cdp);
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

const results = [];

async function scenario(name, fn) {
  await fn();
  results.push(name);
  console.log(`PASS ${name}`);
}

try {
  await mkdir(screenshotDir, { recursive: true });
  const synthetic = await createSyntheticProfile();
  const previewPort = await findFreePort();
  preview = spawn(process.execPath, [previewEntry, 'preview', '--strictPort', '--port', String(previewPort), '--host', '127.0.0.1'], {
    cwd: projectDir,
    stdio: 'ignore'
  });
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-m3l-'));
  profileDir = path.join(tempRoot, 'chrome-profile');
  portFile = path.join(profileDir, 'DevToolsActivePort');
  await mkdir(profileDir, { recursive: true });
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

  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.guided });

  await scenario('M3L-01 module unlock, orientation and MIDI notice', async () => {
    await startTwoHandModule(cdp);
    await waitStageDataset(cdp, 'twoHandStage', 'handOrientation', 'hand orientation stage');
    const info = await stageInfo(cdp);
    assert(info.chord === 'C', `Orientation shows unexpected chord ${info?.chord}`);
    const midiText = await cdp.evaluate(`document.querySelector('[data-testid="two-hand-midi-status"]')?.innerText || ''`);
    assert(midiText.length > 0, 'MIDI status note is missing.');
    await saveScreenshot(cdp, '01-m3l-hand-orientation.png');
  });

  await scenario('M3L-02 guided left hand follows the four-voicing sequence including G/B bass B2', async () => {
    await realClick(cdp, '[data-testid="two-hand-continue"]');
    await waitStageDataset(cdp, 'twoHandStage', 'leftHand', 'left hand stage');
    for (const chordId of SEQUENCE) {
      const before = await stageInfo(cdp);
      assert(before.chord === chordId, `Left-hand guided chord should be ${chordId}, got ${before.chord}`);
      await clickKeySequentially(cdp, [HAND_KEYS[chordId].bass]);
      await delay(180);
    }
    await waitStageDataset(cdp, 'twoHandStage', 'rightHand', 'right hand stage');
    for (const chordId of SEQUENCE) {
      const before = await stageInfo(cdp);
      assert(before.chord === chordId, `Right-hand guided chord should be ${chordId}, got ${before.chord}`);
      await clickKeyboardKeys(cdp, HAND_KEYS[chordId].triad);
      await delay(220);
    }
    await waitStageDataset(cdp, 'twoHandStage', 'simultaneous', 'simultaneous stage');
  });

  await scenario('M3L-03 simultaneous run records one persisted attempt', async () => {
    await playSimultaneous(cdp, 'C', async () => { await saveScreenshot(cdp, '02-m3l-simultaneous-play.png'); });
    const info = await stageInfo(cdp);
    assert(info.stage === 'simultaneous', `Expected to stay on simultaneous drills, got ${info.stage}`);
    const stored = await readStore(cdp, 'learningProgress');
    const session = stored.find(row => row.id === 'advanced-two-hand:session');
    assert(session?.twoHandSnapshot, 'Two-hand session snapshot was not persisted.');
    assert(session.twoHandSnapshot.stage === 'simultaneous', `Persisted stage should be simultaneous, got ${session.twoHandSnapshot.stage}`);
    const logsBeforeReload = await readStore(cdp, 'reviewLogEvents');
    void logsBeforeReload;
  });

  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.alternating });

  await scenario('M3L-04 reload resumes alternating stage from snapshot', async () => {
    await startTwoHandModule(cdp);
    await waitStageDataset(cdp, 'twoHandStage', 'alternating', 'restored alternating stage');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-parts"]'))`, 'parts panel after reload');
  });

  await scenario('M3L-05 bass on beat 1 and chord on beat 3 stay within M3K windows', async () => {
    await playAlternating(cdp, 'C', async () => { await saveScreenshot(cdp, '03-m3l-bass-beat1-chord-beat3.png'); });
    const info = await stageInfo(cdp);
    assert(info.stage === 'alternating', `Expected to stay on alternating drills, got ${info.stage}`);
    assert(info.feedback.includes('Верно'), `Alternating feedback should confirm a correct attempt, got: ${info.feedback}`);
  });

  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.failingAssessment });

  await scenario('M3L-06 assessment failure opens bounded remediation and returns to retry block', async () => {
    await startTwoHandModule(cdp);
    await waitStageDataset(cdp, 'twoHandStage', 'transferAssessment', 'restored assessment');
    await saveScreenshot(cdp, '04-m3l-assessment.png');
    await playAlternating(cdp, 'Am');
    await waitStageDataset(cdp, 'twoHandStage', 'transferRemediation', 'remediation after failed block');
    await realClick(cdp, '[data-testid="two-hand-start-run"]');
    await waitRunOpen(cdp);
    await clickKeyboardKeys(cdp, [HAND_KEYS.Am.bass, ...HAND_KEYS.Am.triad]);
    await waitRunClosed(cdp);
    for (let index = 0; index < 3; index++) {
      const nextVisible = await cdp.evaluate(`Boolean(document.querySelector('[data-testid="two-hand-remediation-next"]'))`);
      if (!nextVisible) break;
      await realClick(cdp, '[data-testid="two-hand-remediation-next"]');
      await delay(200);
    }
    await waitStageDataset(cdp, 'twoHandStage', 'transferAssessment', 'retry assessment block');
    const logs = await readStore(cdp, 'reviewLogEvents');
    const uniqueIds = new Set(logs.map(row => row.reviewEventId).filter(Boolean));
    assert(uniqueIds.size === logs.length, 'Duplicate review event identities detected after assessment run.');
  });

  await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.passedAssessment });

  await scenario('M3L-07 passed assessment completes the module and enables daily practice gate', async () => {
    await startTwoHandModule(cdp);
    await waitStageDataset(cdp, 'twoHandStage', 'transferResult', 'restored passed assessment');
    await realClick(cdp, '[data-testid="two-hand-complete-module"]');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-continue-practice"]'))`, 'module complete actions');
    const stored = await readStore(cdp, 'learningProgress');
    const complete = stored.find(row => row.id === 'advanced-two-hand:complete');
    assert(complete?.state === 'retention', 'Module completion was not persisted as retention.');
    await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.completed });
    await openProgram(cdp);
    const selected = await cdp.evaluate(`(() => { const card = document.querySelector('[data-stage-id="two_hand"]'); card?.click(); return Boolean(card); })()`);
    assert(selected, 'two_hand roadmap stage missing after completion.');
    await waitFor(cdp, `(() => { const detail = document.querySelector('[data-testid="two-hand-stage"]') || document.querySelector('.roadmap-detail, .roadmap-detail-card, .roadmap-panel'); return true; })()`, 'roadmap detail');
  });

  await scenario('M3L-08 no runtime exceptions, duplicate events or console errors', async () => {
    const duplicates = await cdp.evaluate(`new Promise((resolve, reject) => {
      const request = indexedDB.open('PianoTrainerDB');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('reviewLogEvents', 'readonly');
        const rows = tx.objectStore('reviewLogEvents').getAll();
        rows.onsuccess = () => {
          const ids = rows.result.map(row => row.reviewEventId).filter(Boolean);
          db.close();
          resolve(ids.length - new Set(ids).size);
        };
        rows.onerror = () => reject(rows.error);
      };
    })`);
    assert(duplicates === 0, `Found ${duplicates} duplicate review events.`);
    assert(cdp.runtimeExceptions.length === 0, `Runtime exceptions: ${cdp.runtimeExceptions.join(' | ')}`);
    const fatalConsole = cdp.consoleErrors.filter(message => !message.includes('favicon'));
    assert(fatalConsole.length === 0, `Console errors: ${fatalConsole.join(' | ')}`);
  });

  await writeFile(path.join(projectDir, 'acceptance', 'm3l', 'smoke-summary.json'), JSON.stringify({ scenarios: results }, null, 2));
  console.log(`M3L smoke passed: ${results.length} scenarios.`);
} catch (error) {
  console.error('M3L smoke failed:', error);
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { preview?.kill(); } catch {}
  if (tempRoot) { try { await rm(tempRoot, { recursive: true, force: true }); } catch {} }
  if (portFile) { try { await rm(portFile, { force: true }); } catch {} }
}
