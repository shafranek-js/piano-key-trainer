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
const screenshotDir = path.join(projectDir, 'acceptance', 'm3l-rev3', 'screenshots');
const summaryPath = path.join(projectDir, 'acceptance', 'm3l-rev3', 'smoke-summary.json');

const ORIGINAL_REQUIRED = { min: 41, max: 67, span: 27 };
const MICROLAB_RANGE = { min: 48, max: 72 };
const HAND_KEYS = {
  C: { bass: 'C3', triad: ['C4', 'E4', 'G4'] },
  'G/B': { bass: 'B3', triad: ['D4', 'G4', 'B4'] },
  Am: { bass: 'A3', triad: ['C4', 'E4', 'A4'] },
  F: { bass: 'F3', triad: ['A3', 'C4', 'F4'] }
};
const MIDI_KEYS = {
  C: { bass: 48, triad: [60, 64, 67] },
  'G/B': { bass: 59, triad: [62, 67, 71] },
  Am: { bass: 57, triad: [60, 64, 69] },
  F: { bass: 53, triad: [57, 60, 65] }
};
const WRONG_TRIAD = [65, 69, 72];

const fakeMidiScript = `(() => {
  const input = {id:'m3l-fake-midi',name:'Arturia MicroLab mk3',manufacturer:'Arturia',state:'connected',connection:'open',type:'input',onmidimessage:null};
  const access = {inputs:new Map([[input.id,input]]),onstatechange:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});
  window.__m3lMidiInput = input;
  window.__m3lNoteOn = notes => notes.forEach(note => input.onmidimessage?.({data:new Uint8Array([0x90,note,100])}));
  window.__m3lNoteOff = notes => notes.forEach(note => input.onmidimessage?.({data:new Uint8Array([0x80,note,0])}));
  window.__m3lNoteOnFrom = (portId, notes) => {
    const target = access.inputs.get(portId);
    notes.forEach(note => target?.onmidimessage?.({data:new Uint8Array([0x90,note,100])}));
  };
  window.__m3lNoteOffFrom = (portId, notes) => {
    const target = access.inputs.get(portId);
    notes.forEach(note => target?.onmidimessage?.({data:new Uint8Array([0x80,note,0])}));
  };
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
  window.__m3lAddSecondDevice = () => {
    const second = {id:'m3l-second-device',name:'Generic USB Keyboard',manufacturer:'Generic',state:'connected',connection:'open',type:'input',onmidimessage:null};
    access.inputs.set(second.id, second);
    access.onstatechange?.();
    return second.id;
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
  newPitchClassesPerSession: 2, useLatencyGrading: true, notationClef: 'treble',
  midiCalibration: {
    deviceId: 'm3l-fake-midi',
    deviceName: 'Arturia MicroLab mk3',
    minNote: 48,
    maxNote: 72,
    physicalKeyCount: 25,
    calibratedAt: 1_800_000_000_000
  }
};

const { midiCalibration: _ignoredCalibration, ...settingsBaseWithoutCalibration } = baseSettings;
const settingsWithoutCalibration = { ...settingsBaseWithoutCalibration, midiCalibration: null };
const PORT_A = 'm3l-fake-midi';
const PORT_B = 'm3l-second-device';

async function seedDatabase(cdp, data, settingsPayload = baseSettings) {
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
      tx.objectStore('settings').put({key:'userSettings',value:${JSON.stringify(settingsPayload)}});
      tx.oncomplete = () => {
        localStorage.setItem('piano-key-trainer-settings', ${JSON.stringify(JSON.stringify(settingsPayload))});
        localStorage.setItem('piano-trainer-settings', ${JSON.stringify(JSON.stringify(settingsPayload))});
        db.close(); resolve(true);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }))(${JSON.stringify(payload)})`);
  assert(seeded, 'Could not seed the isolated synthetic browser profile.');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try {
      localStorage.setItem('piano-trainer-settings', ${JSON.stringify(JSON.stringify(settingsPayload))});
      localStorage.setItem('piano-key-trainer-settings', ${JSON.stringify(JSON.stringify(settingsPayload))});
    } catch (error) {}`
  });
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

async function startRunAndArm(cdp, countInValue = '1') {
  await realClick(cdp, '[data-testid="two-hand-start-run"]');
  await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandCountIn === '${countInValue}'`, 'last count-in beat');
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

async function midiFrom(cdp, portId, events) {
  await cdp.evaluate(`new Promise(resolve => {
    const events = ${JSON.stringify(events)};
    for (const event of events) {
      setTimeout(() => {
        const port = event.port ?? ${JSON.stringify(portId)};
        if (event.type === 'off') window.__m3lNoteOffFrom(port, event.notes);
        else window.__m3lNoteOnFrom(port, event.notes);
      }, Math.max(0, event.at - performance.now()));
    }
    const last = events.length ? Math.max(...events.map(event => event.at)) : performance.now();
    const done = setInterval(() => { if (performance.now() >= last + 250) { clearInterval(done); resolve(true); } }, 10);
  })`);
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
  await waitFor(cdp, `Boolean(document.querySelector('[data-stage-id="two_hand"]'))`, 'two_hand roadmap card');
  const selected = await cdp.evaluate(`(() => {
    const card = document.querySelector('[data-stage-id="two_hand"]');
    card?.click();
    return Boolean(card);
  })()`);
  assert(selected, 'Program stage two_hand is missing.');
  try {
    await waitFor(cdp, `Boolean(document.querySelector('.roadmap-action-btn'))`, 'two_hand module action', 25);
  } catch {
    await cdp.evaluate('document.querySelector(`[data-stage-id="two_hand"]`)?.click()');
    await waitFor(cdp, `Boolean(document.querySelector('.roadmap-action-btn'))`, 'two_hand module action (retry)', 40);
  }
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
    await clickKeyboardKeys(cdp, HAND_KEYS['G/B'].triad);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandChord === 'Am'`, 'progression to Am after screen correction');
    let snapshot = await waitSnapshot(cdp, 'snapshot.rightIndex === 2', 'rightIndex 2 after screen correction');
    assert(snapshot?.rightIndex === 2, `Expected rightIndex 2 after screen correction, got ${snapshot?.rightIndex}.`);
    evidence.p0RightHandCorrectionScreen = true;

    await clickKeyboardKeys(cdp, HAND_KEYS.Am.triad);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandChord === 'F'`, 'progression to F on fresh first attempt');
    await clickKeyboardKeys(cdp, HAND_KEYS.F.triad);
    await waitStage(cdp, 'simultaneous', 'simultaneous stage after fresh correct first attempt');
    snapshot = await waitSnapshot(cdp, 'snapshot.rightIndex === 4', 'rightIndex 4 after fresh attempts');
    assert(snapshot?.rightIndex === 4, `Expected rightIndex 4 after fresh attempts, got ${snapshot?.rightIndex}.`);
    evidence.p0FreshCorrectFirstAttempt = true;
  });

  await scenario('M3L-01 four bars play continuously after one count-in', async () => {
    await seedAndStartModule(cdp, synthetic, 'fourBar');
    await waitStage(cdp, 'fourBar', 'four-bar stage');
    const armed = await startRunAndArm(cdp, '3');
    const targets = armed.targets;
    assert(Array.isArray(targets) && targets.length === 4, `Expected 4 phrase targets, got ${JSON.stringify(targets)}.`);
    assert(targets[1].onset - targets[0].onset === 4000, 'Bars must be four 60 BPM beats apart.');
    assert(targets[0].chordOnset - targets[0].onset === 2000, 'Chord must land on beat 3 of each bar.');
    assert(targets[3].chordOnset - targets[0].onset === 14000, 'Phrase must span four contiguous bars.');
    const arrangement = await cdp.evaluate('window.__m3lArrangement');
    assert(arrangement?.kind === 'compact', `Expected compact arrangement on the 25-key device, got ${arrangement?.kind}.`);
    const allPhraseNotes = Object.values(arrangement.voicings).flatMap(voicing => [voicing.bassMidi, ...voicing.triadMidi]);
    assert(allPhraseNotes.every(note => note >= MICROLAB_RANGE.min && note <= MICROLAB_RANGE.max),
      `Every bar must fit one 25-key range, got ${JSON.stringify(allPhraseNotes)}.`);
    evidence.originalVsAdapted = {
      original: ORIGINAL_REQUIRED,
      adaptedSpan: Math.max(...allPhraseNotes) - Math.min(...allPhraseNotes) + 1,
      range: MICROLAB_RANGE
    };
    evidence.compactVoicings = arrangement.voicings;
    await saveScreenshot(cdp, '02-m3l-rev3-compact-four-bars.png');
    const phraseEvents = [];
    for (let barIndex = 0; barIndex < 4; barIndex++) {
      const keys = MIDI_KEYS[['C', 'G/B', 'Am', 'F'][barIndex]];
      phraseEvents.push({ notes: [keys.bass], at: `TARGET_${barIndex}_ONSET`, durationMs: 60 });
      phraseEvents.push({ notes: keys.triad, at: `TARGET_${barIndex}_CHORD`, durationMs: 60 });
    }
    await playSequence(cdp, phraseEvents);
    await waitRunClosed(cdp);
    const phraseResults = await cdp.evaluate('window.__m3lPhraseResults ?? null');
    const phraseDebug = await cdp.evaluate('window.__m3lPhraseDebug ?? null');
    evidence.continuousPhraseTrace = phraseDebug;
    assert(Array.isArray(phraseResults) && phraseResults.every(result => result?.correct === true),
      `Every compact bar must be graded correct before reaching independent: ${JSON.stringify({ phraseResults, phraseDebug })}`);
    await waitStage(cdp, 'independent', 'independent stage after continuous phrase');
    evidence.fourBarsOneCountInContinuous = true;
  });

  await scenario('M3L-02 independent phrase hides note hints and stays continuous', async () => {
    const info = await stageInfo(cdp);
    assert(info.hints === 'false', 'Independent stage must hide note hints.');
    assert(info.parts.every(part => part === '—'), `Independent parts must hide note lists, got ${JSON.stringify(info.parts)}.`);
    assert(!/[A-G]\d/.test(info.instruction), `Independent instruction must not list exact keys: ${info.instruction}`);
    
    evidence.independentNoNoteHints = true;
    await startRunAndArm(cdp, '3');
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
      const armed = await startRunAndArm(cdp, '3');
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
      if (trial === 5) await saveScreenshot(cdp, '03-m3l-rev3-assessment-midi.png');
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
      { notes: [50], at: wrongBassArmed.timing.onset, durationMs: 60 },
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
      { notes: [50], at: firstItemArmed.timing.onset, durationMs: 60 },
      { notes: WRONG_TRIAD, at: firstItemArmed.timing.onset + 20, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    await waitFor(cdp, `document.querySelector(${JSON.stringify(stageSelector())})?.dataset.twoHandAwaiting === 'true'`, 'awaiting corrective after wrong remediation');
    info = await stageInfo(cdp);
    assert(info.chord === 'C', `Wrong remediation must keep the same item, got ${info.chord}.`);
    assert(await cdp.evaluate(`!document.querySelector('[data-testid="two-hand-remediation-next"]')`), 'Next must stay hidden after a wrong remediation attempt.');
    await saveScreenshot(cdp, '04-m3l-rev3-remediation-gate.png');
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

  await scenario('M3L-10 device profile, calibration trace, compact range and input selection', async () => {
    await seedAndStartModule(cdp, synthetic, 'simultaneous');
    await waitStage(cdp, 'simultaneous', 'simultaneous stage');
    const deviceLabel = await cdp.evaluate(`document.querySelector('[data-testid="two-hand-device-label"]')?.innerText || ''`);
    assert(deviceLabel.includes('MicroLab') && deviceLabel.includes('25'), `Device label must show the MicroLab and 25 keys: ${deviceLabel}`);
    const rangeText = await cdp.evaluate(`document.querySelector('[data-testid="two-hand-range"]')?.innerText || ''`);
    assert(rangeText.includes('C3') && rangeText.includes('C5'), `Calibrated range must show C3–C5: ${rangeText}`);
    const adaptation = await cdp.evaluate(`document.querySelector('[data-testid="two-hand-adaptation"]')?.innerText || ''`);
    assert(adaptation.length > 0, 'Compact adaptation notice must be visible.');
    await saveScreenshot(cdp, '01-m3l-rev3-device-range.png');
    evidence.deviceProfile = { label: deviceLabel, range: rangeText, source: 'known-profile+calibration' };

    // Calibration workflow captures raw notes, including notes outside the virtual C2–C6 piano.
    await realClick(cdp, '[data-testid="two-hand-calibrate"]');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-calibration"]'))`, 'calibration panel');
    await cdp.evaluate('window.__m3lNoteOn([30])');
    await delay(120);
    await cdp.evaluate('window.__m3lNoteOff([30])');
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-calibration"]')?.innerText.includes('прав') || document.querySelector('[data-testid="two-hand-calibration"]')?.innerText.includes('Справа')`, 'leftmost captured prompt');
    await cdp.evaluate('window.__m3lNoteOn([96])');
    await delay(120);
    await cdp.evaluate('window.__m3lNoteOff([96])');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-calibration-range"]'))`, 'calibration range display');
    const calibrationRange = await cdp.evaluate(`document.querySelector('[data-testid="two-hand-calibration-range"]')?.innerText || ''`);
    assert(calibrationRange.includes('30') && calibrationRange.includes('96'), `Raw out-of-virtual-range notes must be captured: ${calibrationRange}`);
    evidence.calibrationTrace = { left: 30, right: 96, displayed: calibrationRange };
    await realClick(cdp, '[data-testid="two-hand-calibration-cancel"]');
    await waitFor(cdp, `!document.querySelector('[data-testid="two-hand-calibration"]')`, 'calibration cancelled');

    // Multiple devices: an explicit selection appears and switching keeps the flow safe.
    await cdp.evaluate('window.__m3lAddSecondDevice()');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-device-select"]'))`, 'device selection list');
    const optionCount = await cdp.evaluate(`document.querySelectorAll('[data-testid="two-hand-device-select"] option').length`);
    assert(optionCount === 2, `Expected two selectable MIDI devices, got ${optionCount}.`);
    const secondId = await cdp.evaluate(`(() => {
      const select = document.querySelector('[data-testid="two-hand-device-select"]');
      const option = [...select.options].find(item => item.value === 'm3l-second-device');
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return option.value;
    })()`);
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-device-label"]')?.innerText.includes('Generic')`, 'second device selected');
    await cdp.evaluate(`(() => {
      const select = document.querySelector('[data-testid="two-hand-device-select"]');
      const option = [...select.options].find(item => item.value === 'm3l-fake-midi');
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-device-label"]')?.innerText.includes('MicroLab')`, 'first device reselected');
    evidence.multiDeviceSelection = { optionCount, secondId };

    // Physical case: while the exercise is open, the player calibrates a C2–C4 keyboard.
    // The open exercise must be re-planned to playable voicings without a dead end.
    await realClick(cdp, '[data-testid="two-hand-calibrate"]');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-calibration"]'))`, 'second calibration panel');
    await cdp.evaluate('window.__m3lNoteOn([36])');
    await delay(120);
    await cdp.evaluate('window.__m3lNoteOff([36])');
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-calibration"]')?.innerText.includes('прав') || document.querySelector('[data-testid="two-hand-calibration"]')?.innerText.includes('Справа')`, 'C2 captured');
    await cdp.evaluate('window.__m3lNoteOn([60])');
    await delay(120);
    await cdp.evaluate('window.__m3lNoteOff([60])');
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-calibration-range"]')?.innerText.includes('36') && document.querySelector('[data-testid="two-hand-calibration-range"]')?.innerText.includes('60')`, 'C4 captured');
    await waitFor(cdp, `window.__m3lArrangement?.voicings?.['G/B']?.bassKeyId === 'B2'`, 're-planned C2–C4 voicings');
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-stage"]')?.dataset.twoHandArrangement === 'compact'`, 'compact arrangement after re-plan');
    const replanned = await cdp.evaluate('window.__m3lArrangement');
    assert([...replanned.voicings['G/B'].triadKeyIds].join(',') === 'D3,G3,B3',
      `Expected C2–C4 G/B voicing D3–G3–B3, got ${JSON.stringify(replanned.voicings['G/B'])}.`);
    const replannedNotes = Object.values(replanned.voicings).flatMap(voicing => [voicing.bassMidi, ...voicing.triadMidi]);
    assert(replannedNotes.every(note => note >= 36 && note <= 60),
      `Re-planned exercise must fit the C2–C4 range: ${JSON.stringify(replannedNotes)}.`);
    assert(await cdp.evaluate(`document.querySelector('.keyboard button[data-id="D4"]')?.classList.contains('key-unavailable') === true`),
      'Keys outside the calibrated range must be marked unavailable.');
    const replanFeedback = await cdp.evaluate(`document.querySelector('[data-testid="two-hand-feedback"]')?.innerText || ''`);
    assert(replanFeedback.includes('перестроено'), `Re-plan notice must be shown: ${replanFeedback}`);
    await realClick(cdp, '[data-testid="two-hand-calibration-cancel"]');
    evidence.rangeChangeReplan = {
      from: 'C3–C5 compact (B3 / D4–G4–B4)',
      to: 'C2–C4 compact (B2 / D3–G3–B3)',
      playable: true,
      unavailableKeysMarked: true
    };

    const lowC = replanned.voicings.C;
    const lowArmed = await startRunAndArm(cdp);
    assert(lowArmed.timing && Number.isFinite(lowArmed.timing.onset), 'Low-range timing target missing.');
    await playSequence(cdp, [
      { notes: [lowC.bassMidi], at: lowArmed.timing.onset, durationMs: 60 },
      { notes: lowC.triadMidi, at: lowArmed.timing.onset + 20, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    const lowAttempt = await lastAttempt(cdp);
    assert(lowAttempt?.correct === true, `Re-planned C2–C4 bar must be playable: ${JSON.stringify(lowAttempt)}.`);
    evidence.allBarsWithinOneCompactRange = true;
  });

  await scenario('M3L-11 port isolation: only the selected device feeds M3L', async () => {
    await seedAndStartModule(cdp, synthetic, 'simultaneous');
    await waitStage(cdp, 'simultaneous', 'simultaneous stage');
    if (!(await cdp.evaluate(`Boolean(document.querySelector('[data-testid="two-hand-device-select"]'))`))) {
      await cdp.evaluate('window.__m3lAddSecondDevice()');
      await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-device-select"]'))`, 'device selector');
    }
    await cdp.evaluate(`(() => {
      const select = document.querySelector('[data-testid="two-hand-device-select"]');
      if (select.value !== ${JSON.stringify(PORT_A)}) {
        select.value = ${JSON.stringify(PORT_A)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    })()`);
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-device-label"]')?.innerText.includes('MicroLab')`, 'device A selected');
    const arrangement = await cdp.evaluate('window.__m3lArrangement');
    const keys = arrangement.voicings.C;

    await cdp.evaluate('window.__m3lAttemptCount = 0; window.__m3lLastAttempt = null;');
    const bArmed = await startRunAndArm(cdp);
    await midiFrom(cdp, PORT_B, [
      { type: 'on', notes: [keys.bassMidi, ...keys.triadMidi], at: bArmed.timing.onset },
      { type: 'off', notes: [keys.bassMidi, ...keys.triadMidi], at: bArmed.timing.onset + 80 }
    ]);
    await waitRunClosed(cdp);
    assert((await lastAttempt(cdp))?.outcome === 'missing_left', `Device B events must not be captured while A is selected: ${JSON.stringify(await lastAttempt(cdp))}.`);

    await cdp.evaluate('window.__m3lAttemptCount = 0; window.__m3lLastAttempt = null;');
    const aArmed = await startRunAndArm(cdp);
    await playSequence(cdp, [
      { notes: [keys.bassMidi], at: aArmed.timing.onset, durationMs: 60 },
      { notes: keys.triadMidi, at: aArmed.timing.onset + 20, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    assert((await lastAttempt(cdp))?.correct === true, 'Selected-device input must be accepted and graded.');

    await cdp.evaluate('window.__m3lAttemptCount = 0; window.__m3lLastAttempt = null;');
    const heldChord = (await stageInfo(cdp)).chord;
    const heldKeys = arrangement.voicings[heldChord];
    assert(heldKeys, `Held-identity block: unknown chord ${heldChord}.`);
    const heldArmed = await startRunAndArm(cdp);
    await midiFrom(cdp, PORT_A, [
      { type: 'on', notes: [heldKeys.bassMidi], at: heldArmed.timing.onset },
      { type: 'on', notes: [heldKeys.bassMidi], at: heldArmed.timing.onset + 5, port: PORT_B },
      { type: 'off', notes: [heldKeys.bassMidi], at: heldArmed.timing.onset + 10, port: PORT_B },
      { type: 'on', notes: [heldKeys.bassMidi], at: heldArmed.timing.onset + 15 },
      { type: 'on', notes: heldKeys.triadMidi, at: heldArmed.timing.onset + 20 },
      { type: 'off', notes: [heldKeys.bassMidi, ...heldKeys.triadMidi], at: heldArmed.timing.onset + 90 }
    ]);
    await waitRunClosed(cdp);
    assert((await cdp.evaluate('window.__m3lAttemptCount ?? 0')) === 1, 'Identical note/channel from two devices must not duplicate held state.');
    assert((await lastAttempt(cdp))?.correct === true, 'Held-note identity isolation must preserve a valid attempt.');
    await cdp.evaluate(`window.__m3lNoteOffFrom(${JSON.stringify(PORT_A)}, [${keys.bassMidi}])`);

    await realClick(cdp, '[data-testid="two-hand-calibrate"]');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-calibration"]'))`, 'calibration panel');
    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_B)}, [30])`);
    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_B)}, [96])`);
    await delay(200);
    assert(!(await cdp.evaluate(`Boolean(document.querySelector('[data-testid="two-hand-calibration-range"]'))`)), 'Device B notes must not calibrate device A.');
    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_A)}, [48])`);
    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_A)}, [72])`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-calibration-range"]'))`, 'device A calibration range');
    await realClick(cdp, '[data-testid="two-hand-calibration-cancel"]');
    evidence.portIsolation = { foreignDeviceIgnored: true, selectedDeviceAccepted: true, heldIdentityIsolated: true, calibrationIsolated: true };
  });

  await scenario('M3L-12 verified range required; C1–C3 support; stale reconfirmation and calibration isolation', async () => {
    await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.simultaneous }, settingsWithoutCalibration);
    await startTwoHandModule(cdp);
    await waitStage(cdp, 'simultaneous', 'simultaneous stage');
    await waitFor(cdp, `window.__m3lArrangement?.kind === 'simulation'`, 'simulation arrangement without verified range');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-simulation"]'))`, 'simulation label');
    await cdp.evaluate('window.__m3lAttemptCount = 0; window.__m3lLastAttempt = null;');
    const simArmed = await startRunAndArm(cdp);
    await midiFrom(cdp, PORT_A, [
      { type: 'on', notes: [48, 60, 64, 67], at: simArmed.timing.onset },
      { type: 'off', notes: [48, 60, 64, 67], at: simArmed.timing.onset + 80 }
    ]);
    await waitRunClosed(cdp);
    assert((await lastAttempt(cdp))?.correct !== true, 'Unverified physical input must not be graded.');

    await realClick(cdp, '[data-testid="two-hand-calibrate"]');
    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_A)}, [24])`);
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-calibration"]')?.innerText.includes('Справа') || document.querySelector('[data-testid="two-hand-calibration"]')?.innerText.includes('прав')`, 'C1 captured');
    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_A)}, [48])`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-calibration-range"]'))`, 'C1–C3 calibration range');
    await realClick(cdp, '[data-testid="two-hand-calibration-cancel"]');
    await waitFor(cdp, `window.__m3lArrangement?.kind === 'compact'`, 'compact arrangement for C1–C3');
    const lowArrangement = await cdp.evaluate('window.__m3lArrangement');
    const lowNotes = Object.values(lowArrangement.voicings).flatMap(voicing => [voicing.bassMidi, ...voicing.triadMidi]);
    assert(lowNotes.some(note => note < 36), `C1–C3 arrangement must use notes below the virtual piano: ${JSON.stringify(lowNotes)}.`);
    await cdp.evaluate('window.__m3lAttemptCount = 0; window.__m3lLastAttempt = null;');
    const lowArmed = await startRunAndArm(cdp);
    const lowC = lowArrangement.voicings.C;
    await playSequence(cdp, [
      { notes: [lowC.bassMidi], at: lowArmed.timing.onset, durationMs: 60 },
      { notes: lowC.triadMidi, at: lowArmed.timing.onset + 20, durationMs: 60 }
    ]);
    await waitRunClosed(cdp);
    assert((await lastAttempt(cdp))?.correct === true, 'Validated sub-C2 notes must be received and graded.');
    evidence.c1c3Supported = { notes: lowNotes, graded: true };

    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_A)}, [60])`);
    await delay(250);
    await waitFor(cdp, `window.__m3lArrangement?.kind === 'simulation'`, 'stale range blocks physical play');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-verify-range"]'))`, 'verification button');
    await cdp.evaluate('window.__m3lAttemptCount = 0; window.__m3lLastAttempt = null;');
    const blockedArmed = await startRunAndArm(cdp);
    await midiFrom(cdp, PORT_A, [
      { type: 'on', notes: [24, 36, 40, 43], at: blockedArmed.timing.onset },
      { type: 'off', notes: [24, 36, 40, 43], at: blockedArmed.timing.onset + 80 }
    ]);
    await waitRunClosed(cdp);
    assert((await lastAttempt(cdp))?.correct !== true, 'Stale range must block physical grading.');
    await cdp.evaluate(`window.__m3lNoteOffFrom(${JSON.stringify(PORT_A)}, [24,36,40,43])`);

    await realClick(cdp, '[data-testid="two-hand-verify-range"]');
    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_A)}, [24])`);
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-calibration"]')?.innerText.includes('Справа') || document.querySelector('[data-testid="two-hand-calibration"]')?.innerText.includes('прав')`, 'verification left captured');
    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_A)}, [48])`);
    await waitFor(cdp, `window.__m3lArrangement?.kind === 'compact'`, 'range reverified');
    await realClick(cdp, '[data-testid="two-hand-calibration-cancel"]');
    evidence.verifiedRangeRequired = true;
    evidence.staleBlockedUntilVerified = true;

    await cdp.evaluate('window.__m3lAddSecondDevice()');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-device-select"]'))`, 'second device for switch test');
    await cdp.evaluate('window.__m3lAttemptCount = 0; window.__m3lLastAttempt = null;');
    const beforeLogs = await readStore(cdp, 'reviewLogEvents');
    await realClick(cdp, '[data-testid="two-hand-calibrate"]');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-calibration"]'))`, 'calibration during run');
    await realClick(cdp, '[data-testid="two-hand-start-run"]');
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-stage"]')?.dataset.twoHandRunning === 'true'`, 'run with calibration open');
    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_A)}, [24])`);
    await cdp.evaluate(`window.__m3lNoteOnFrom(${JSON.stringify(PORT_A)}, [48])`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-calibration-range"]'))`, 'calibration captured during run');
    assert((await lastAttempt(cdp)) === null, 'Calibration events must never be submitted as an attempt.');
    assert((await cdp.evaluate('window.__m3lAttemptCount ?? 0')) === 0, 'No evaluation may originate from calibration events.');
    await realClick(cdp, '[data-testid="two-hand-calibration-cancel"]');
    await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-device-select"]'))`, 'device selector after calibration');
    await cdp.evaluate(`(() => {
      const select = document.querySelector('[data-testid="two-hand-device-select"]');
      const option = [...select.options].find(item => item.value === ${JSON.stringify(PORT_B)});
      if (option) { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); }
      return true;
    })()`);
    await waitFor(cdp, `document.querySelector('[data-testid="two-hand-stage"]')?.dataset.twoHandRunning === 'false'`, 'run stopped on device switch');
    assert((await lastAttempt(cdp)) === null, 'Device switch must not grade the interrupted run.');
    assert((await cdp.evaluate('window.__m3lAttemptCount ?? 0')) === 0, 'Interrupted run must not be evaluated.');
    const afterLogs = await readStore(cdp, 'reviewLogEvents');
    assert(afterLogs.length === beforeLogs.length, 'Interrupted run must not create review logs.');
    evidence.calibrationIsolatedDuringRun = true;
    evidence.deviceSwitchStopsWithoutGrade = true;
    evidence.compactProgressionsPlayable = { c2c4: true, c3c5: true };
  });

  await scenario('M3L-13 integrity: no duplicate events, exceptions or console errors', async () => {
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








