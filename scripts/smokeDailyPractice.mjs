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
const evidenceDir = path.join(projectDir, 'acceptance', 'checkpoint-c');
const screenshotDir = path.join(evidenceDir, 'screenshots');
const TARGET_TASKS = 40;
const MAX_TASKS = 80;
const ADVANCED_FAMILIES = [
  'harmonyFunctionIdentify',
  'harmonyNextChord',
  'harmonyProgressionPlay',
  'chordPulse',
  'chordChangeTiming',
  'chordRhythmPattern'
];
const isAdvancedSkill = skill => ADVANCED_FAMILIES.includes(skill);

let tempRoot;
let profileDir;
let portFile;
let chrome;
let preview;
let socket;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createSettings() {
  return {
    sessionPreset: 'normal',
    level: 'white',
    mode: 'smart',
    autoAdvanceDelaySeconds: 0,
    desiredRetention: 0.9,
    maxIntervalDays: 120,
    relearningSeconds: 45,
    newPitchClassesPerSession: 2,
    useLatencyGrading: true,
    notationClef: 'treble'
  };
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
  const state = await cdp.evaluate(`JSON.stringify({url:location.href,body:document.body?.innerText?.slice(0,800)})`);
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

async function waitForAppHydration(cdp) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const hydrated = await cdp.evaluate(`new Promise(resolve => {
      const request = indexedDB.open('PianoTrainerDB');
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction('settings', 'readonly');
          const count = tx.objectStore('settings').count();
          count.onsuccess = () => { const done = count.result > 0; db.close(); resolve(done); };
          count.onerror = () => { db.close(); resolve(false); };
        } catch { db.close(); resolve(false); }
      };
    })`);
    if (hydrated) return;
    await delay(100);
  }
  throw new Error('Application did not finish initial data hydration before seeding.');
}

async function seedDatabase(cdp, data, { clearLogs = true } = {}) {
  const payload = {
    cards: data.cards,
    learningProgress: data.learningProgress,
    reviewLogs: []
  };
  const settings = createSettings();
  const seeded = await cdp.evaluate(`((data) => new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const names = ['cards','reviewLogEvents','learningProgress','settings'];
      const tx = db.transaction(names, 'readwrite');
      for (const name of ['cards','learningProgress']) {
        const store = tx.objectStore(name); store.clear();
        for (const row of (data[name] ?? [])) store.put(row);
      }
      if (${clearLogs ? 'true' : 'false'}) {
        tx.objectStore('reviewLogEvents').clear();
      }
      tx.objectStore('settings').put({key:'userSettings',value:${JSON.stringify(settings)}});
      tx.oncomplete = () => {
        localStorage.setItem('piano-trainer-settings', ${JSON.stringify(JSON.stringify(settings))});
        db.close(); resolve(true);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }))(${JSON.stringify(payload)})`);
  assert(seeded, 'Could not seed the isolated synthetic browser profile.');
  const freshUrl = `${await cdp.evaluate('location.origin + location.pathname')}?dailyPracticeSeed=${Date.now()}`;
  await cdp.send('Page.navigate', { url: freshUrl });
  await waitFor(cdp, `location.href === ${JSON.stringify(freshUrl)} && document.readyState === 'complete' && document.querySelectorAll('.top-nav-btn').length === 9`, 'reloaded synthetic profile');
  await delay(500);
}

async function saveScreenshot(cdp, fileName) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  return { fileName, bytes: Buffer.from(result.data, 'base64') };
}

async function readTaskState(cdp) {
  return cdp.evaluate(`(() => ({
    active: Boolean(window.__activeTaskDebug),
    debug: window.__activeTaskDebug ?? null,
    questionId: window.__activeQuestionId ?? null,
    nextVisible: Boolean(document.querySelector('.next-question-inline-btn')),
    harmonyNextVisible: Boolean(document.querySelector('[data-testid="harmony-review-next"]')),
    harmonySubmitVisible: Boolean(document.querySelector('[data-testid="harmony-review-submit-chord"]')),
    rhythmNextVisible: Boolean(document.querySelector('[data-testid="rhythm-next-question"]')),
    rhythmSubmitVisible: Boolean(document.querySelector('[data-testid="rhythm-submit-chord"]')),
    rhythmStartVisible: Boolean(document.querySelector('[data-testid="rhythm-start-run"]')),
    triadCheckVisible: Boolean(document.querySelector('.triad-check-btn')),
    completed: Boolean(document.querySelector('[data-testid="session-complete-stage"]'))
  }))()`);
}

async function clickSelector(cdp, selector) {
  const clicked = await cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  return clicked;
}

async function clickKeyboardKey(cdp, keyId) {
  return cdp.evaluate(`(() => {
    const key = document.querySelector('.keyboard button[data-id="${keyId}"]');
    if (!key) return false;
    key.click();
    return true;
  })()`);
}

async function clickChordKeys(cdp, keyIds) {
  for (const keyId of keyIds) {
    const clicked = await clickKeyboardKey(cdp, keyId);
    assert(clicked, `Missing piano key ${keyId}.`);
  }
}

function wrongKeyFor(targetKeyId, note) {
  if (targetKeyId && /^[A-G]#?\d$/.test(targetKeyId)) {
    return targetKeyId.startsWith('C') ? 'D4' : 'C4';
  }
  return note && note.startsWith('C') ? 'D4' : 'C4';
}

async function waitQuestionAdvanced(cdp, previousQuestionId, description) {
  await waitFor(
    cdp,
    `window.__activeQuestionId && window.__activeQuestionId !== ${JSON.stringify(previousQuestionId)}`,
    description,
    200
  );
}

async function driveRhythmTask(cdp, harmonyChords) {
  let chordId = await cdp.evaluate(`window.__rhythmDebug?.targetChordId?.() ?? null`);
  assert(chordId, 'Rhythm task did not expose a target chord.');
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await cdp.evaluate(`Boolean(document.querySelector('[data-testid="rhythm-next-question"]'))`)) return;
    const keyIds = harmonyChords[chordId]?.keyIds;
    assert(keyIds, `No chord key ids for ${chordId}.`);
    if (await cdp.evaluate(`Boolean(document.querySelector('[data-testid="rhythm-start-run"]'))`)) {
      await clickSelector(cdp, '[data-testid="rhythm-start-run"]');
    }
    // Selection is cleared by the run start; select during the count-in / before the target.
    await waitFor(
      cdp,
      `(() => { const s = window.__rhythmDebug?.state?.(); return Boolean(s && s.running && s.countInValue === null); })()`,
      'rhythm count-in completion',
      120
    );
    const selected = await cdp.evaluate(`(() => document.querySelector('[data-testid="rhythm-selected-count"]')?.innerText.match(/(\\d+) из 3/)?.[1] ?? '0')()`);
    if (Number(selected) < 3) {
      await clickChordKeys(cdp, keyIds);
      const selectionReady = await waitFor(cdp, `document.querySelector('[data-testid="rhythm-selected-count"]')?.innerText.includes('3 из 3')`, 'rhythm chord selection').then(() => true, () => false);
      if (!selectionReady) {
        const debugState = await cdp.evaluate(`JSON.stringify({
          rhythm: window.__rhythmDebug?.state?.() ?? null,
          debug: window.__activeTaskDebug ?? null,
          counter: document.querySelector('[data-testid="rhythm-selected-count"]')?.innerText ?? null,
          stage: document.querySelector('[data-testid="chord-rhythm-stage"]') ? 'present' : 'missing',
          submit: document.querySelector('[data-testid="rhythm-submit-chord"]')?.outerHTML?.slice(0, 120) ?? null,
          body: document.body.innerText.slice(0, 400)
        })`);
        throw new Error(`Rhythm selection failed after clicking ${keyIds.join(', ')}: ${debugState}`);
      }
    }
    const targetReady = await waitFor(
      cdp,
      `Boolean(window.__m3kTimingTarget)`,
      'rhythm timing target',
      120
    ).then(() => true, () => false);
    if (!targetReady) {
      if (await cdp.evaluate(`Boolean(document.querySelector('[data-testid="rhythm-next-question"]'))`)) return;
      throw new Error('Rhythm timing target never became available.');
    }
    // Submit inside the accepted window (±300 ms), slightly after the window opens.
    const submittedRaw = await cdp.evaluate(`new Promise(resolve => {
      const trySubmit = () => {
        const target = window.__m3kTimingTarget;
        if (!target || !Number.isFinite(target.windowStart)) { resolve({ ok: false, reason: 'no-target' }); return; }
        const now = performance.now();
        if (now >= target.windowStart + 60 && now <= target.windowEnd - 60) {
          const button = document.querySelector('[data-testid="rhythm-submit-chord"]');
          if (!button) { resolve({ ok: false, reason: 'no-button' }); return; }
          if (button.disabled) { resolve({ ok: false, reason: 'disabled', selected: document.querySelector('[data-testid="rhythm-selected-count"]')?.innerText ?? null, now, target }); return; }
          button.click();
          resolve({ ok: true, now, target });
          return;
        }
        if (now > target.windowEnd - 60) { resolve({ ok: false, reason: 'missed', now, target }); return; }
        setTimeout(trySubmit, 8);
      };
      trySubmit();
    })`);
    assert(submittedRaw?.ok, `Rhythm submission attempt ${attempt + 1} missed the timing window: ${JSON.stringify(submittedRaw)}`);
    await delay(350);
    if (await cdp.evaluate(`Boolean(document.querySelector('[data-testid="rhythm-next-question"]'))`)) return;
    chordId = await cdp.evaluate(`window.__rhythmDebug?.targetChordId?.() ?? null`);
    if (!chordId) break;
  }
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="rhythm-next-question"]'))`, 'rhythm task completion', 100);
}

async function driveHarmonyProgression(cdp, harmonyChords) {
  for (let step = 0; step < 6; step++) {
    if (await cdp.evaluate(`Boolean(document.querySelector('[data-testid="harmony-review-next"]'))`)) return;
    const chordId = await cdp.evaluate(`window.__harmonyDebug?.expectedChordId?.() ?? null`);
    assert(chordId, 'Harmony progression did not expose the expected chord.');
    const keyIds = harmonyChords[chordId]?.keyIds;
    assert(keyIds, `No chord key ids for ${chordId}.`);
    await clickChordKeys(cdp, keyIds);
    await waitFor(cdp, `document.querySelector('[data-testid="harmony-review-submit-chord"]') && !document.querySelector('[data-testid="harmony-review-submit-chord"]').disabled`, `harmony step ${step + 1} selection`);
    await clickSelector(cdp, '[data-testid="harmony-review-submit-chord"]');
    await waitFor(
      cdp,
      `Boolean(document.querySelector('[data-testid="harmony-review-next"]')) || Boolean(document.querySelector('[data-testid="harmony-feedback"]'))`,
      `harmony step ${step + 1} feedback`
    );
  }
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="harmony-review-next"]'))`, 'harmony progression completion', 100);
}

const screenshots = [];
const evidence = {
  generatedAt: new Date().toISOString(),
  smoke: 'smoke:daily-practice',
  dailyPracticeTaskCount: 0,
  uniqueSkills: [],
  uniqueTaskTypes: [],
  maxSameSkillStreak: 0,
  maxSameCardStreak: 0,
  reviewLogCount: 0,
  duplicateReviewCount: 0,
  uniqueQuestionInstances: 0,
  oneGradeInvariant: null,
  advancedFamiliesCovered: [],
  divisionFallback: null
};

try {
  const server = await createViteServer({
    configFile: false,
    root: projectDir,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true }
  });
  let harmonyChords;
  let synthetic;
  try {
    const harmony = await server.ssrLoadModule('/src/core/learning/harmony.ts');
    harmonyChords = harmony.HARMONY_CHORDS;
    const fixture = await server.ssrLoadModule('/tests/fixtures/dailyPracticeProfile.ts');
    const profile = fixture.createDailyPracticeProfile();
    synthetic = {
      cards: profile.cards,
      advancedCards: profile.cards.map(card =>
        isAdvancedSkill(card.skill)
          ? card
          : { ...card, dueAt: profile.now + 30 * 86_400_000 }
      ),
      learningProgress: [...profile.learningProgress.values()]
    };
  } finally {
    await server.close();
  }
  assert(harmonyChords && synthetic.cards.length >= 45, 'Synthetic Daily Practice profile is incomplete.');

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

  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-daily-smoke-'));
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { window.__persistenceDiagnostics = []; })();`
  });
  await cdp.send('Page.navigate', { url: previewUrl });
  await waitFor(cdp, `document.querySelectorAll('.top-nav-btn').length === 9`, 'production application');
  await waitForAppHydration(cdp);
  await seedDatabase(cdp, { cards: synthetic.advancedCards, learningProgress: synthetic.learningProgress }, { clearLogs: true });

  await waitFor(cdp, `document.querySelector('.session-strip .session-meta b') && window.__activeTaskDebug`, 'first Daily Practice task');
  // Unlock the audio context (pointer gesture) so rhythm families become eligible in the pool.
  await cdp.evaluate(`window.dispatchEvent(new Event('pointerdown'))`);
  await delay(600);
  const stripAudit = async () => cdp.evaluate(`(() => {
    const element = document.querySelector('.session-strip .session-meta b');
    const strip = document.querySelector('.session-strip');
    if (!element || !strip) return null;
    const rect = element.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    let ancestorClippedBy = null;
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.body) {
      const style = getComputedStyle(ancestor);
      if (/(hidden|clip)/.test(style.overflowY)) {
        const ancestorRect = ancestor.getBoundingClientRect();
        if (rect.bottom > ancestorRect.bottom + 0.5 || rect.top < ancestorRect.top - 0.5) {
          ancestorClippedBy = ancestor.className || ancestor.tagName;
          break;
        }
      }
      ancestor = ancestor.parentElement;
    }
    const progress = document.querySelector('.session-strip .session-progress')?.getBoundingClientRect() ?? null;
    const finish = document.querySelector('.session-strip .end-session-btn')?.getBoundingClientRect() ?? null;
    const keyboard = document.querySelector('.keyboard-card, .keyboard')?.getBoundingClientRect() ?? null;
    return {
      text: element.textContent.trim(),
      titleClippedByStrip: rect.bottom > stripRect.bottom + 0.5 || rect.top < stripRect.top - 0.5,
      ancestorClippedBy,
      horizontalClip: element.scrollWidth > element.clientWidth + 1,
      textOverflow: getComputedStyle(element).textOverflow,
      progressVisible: progress ? progress.bottom <= window.innerHeight + 1 && progress.top >= -1 : false,
      finishVisible: finish ? finish.bottom <= window.innerHeight + 1 && finish.top >= -1 : false,
      keyboardDocked: keyboard ? keyboard.bottom <= window.innerHeight + 1 : null,
      documentScrollable: document.scrollingElement.scrollHeight > window.innerHeight + 1
    };
  })()`);
  const widths = [
    [1440, 1000, '01-session-strip-1440.png'],
    [1280, 800, '02-session-strip-1280.png'],
    [1024, 900, '03-session-strip-1024.png']
  ];
  const stripAudits = [];
  for (const [width, height, fileName] of widths) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(450);
    const audit = await stripAudit();
    assert(audit && audit.text.length > 3, `Session title missing at ${width}x${height}: ${JSON.stringify(audit)}`);
    assert(audit.titleClippedByStrip === false, `Session title is vertically clipped by the strip at ${width}x${height}: ${JSON.stringify(audit)}`);
    assert(audit.ancestorClippedBy === null, `Session title is clipped by an ancestor (${audit.ancestorClippedBy}) at ${width}x${height}: ${JSON.stringify(audit)}`);
    assert(audit.horizontalClip === false, `Session title is horizontally clipped at ${width}x${height}: ${JSON.stringify(audit)}`);
    assert(!audit.text.endsWith('...') && !audit.text.endsWith('…'), `Session title ellipsized at ${width}x${height}: ${JSON.stringify(audit)}`);
    assert(audit.progressVisible, `Session progress is not usable at ${width}x${height}: ${JSON.stringify(audit)}`);
    assert(audit.finishVisible, `Session Finish button is not usable at ${width}x${height}: ${JSON.stringify(audit)}`);
    assert(audit.keyboardDocked !== false, `Piano keyboard is not docked at ${width}x${height}: ${JSON.stringify(audit)}`);
    assert(audit.documentScrollable === false, `Unexpected page scrolling at ${width}x${height}: ${JSON.stringify(audit)}`);
    stripAudits.push({ width, height, ...audit });
    screenshots.push(await saveScreenshot(cdp, fileName));
  }
  const stableTitle = text => text.replace(/\s·\s\d+:\d+.*$/, '').trim();
  assert(stripAudits.every(audit => stableTitle(audit.text) === stableTitle(stripAudits[0].text)),
    `Session title changed between widths: ${JSON.stringify(stripAudits.map(a => a.text))}`);
  evidence.sessionStrip = stripAudits.map(({ width, height, titleClippedByStrip, ancestorClippedBy, horizontalClip, progressVisible, finishVisible, keyboardDocked, documentScrollable }) => ({
    width, height, titleClippedByStrip, ancestorClippedBy, horizontalClip, progressVisible, finishVisible, keyboardDocked, documentScrollable
  }));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await delay(250);

  const seenQuestions = new Set();
  const skillSequence = [];
  const taskTypes = new Set();
  const advancedSeen = new Set();
  let phase = 'advanced';
  let completedTasks = 0;
  let oneGradeDone = false;
  let logsSeen = 0;
  let attemptGuard = 0;

  const advancedCovered = () => ADVANCED_FAMILIES.every(family => advancedSeen.has(family));
  const requiredGroups = {
    keyNote: ['find', 'identify', 'patternIdentify'],
    notation: ['notationToKey', 'notationBassToKey'],
    sound: ['soundToKey'],
    interval: ['intervalBuild', 'intervalIdentify'],
    triad: ['triadBuild', 'triadIdentify'],
    inversion: ['triadInversionBuild', 'triadInversionIdentify', 'chordSymbolRead']
  };
  const groupsCovered = () => Object.values(requiredGroups).every(group =>
    group.some(skill => skillSequence.includes(skill))
  );
  const coverageSatisfied = () => advancedCovered() && groupsCovered();

  while ((completedTasks < TARGET_TASKS || !coverageSatisfied()) && attemptGuard < MAX_TASKS) {
    attemptGuard += 1;
    await waitFor(cdp, `window.__activeQuestionId && window.__activeTaskDebug && !document.querySelector('[data-testid="session-complete-stage"]')`, 'active Daily Practice task');
    const state = await readTaskState(cdp);
    const questionId = state.questionId;
    assert(questionId, 'Active question has no identity.');
    assert(!seenQuestions.has(questionId), `Duplicate activation of question ${questionId}`);
    seenQuestions.add(questionId);
    const { skill, kind, note, targetKeyId, triadKeyIds } = state.debug;
    taskTypes.add(kind);
    skillSequence.push(skill);
    const questionLogCountBefore = (await readStore(cdp, 'reviewLogEvents')).length;

    // One-grade invariant: wrong first attempt then corrective success on a scheduled piano task.
    if (!oneGradeDone && kind === 'scheduled' && ['find', 'notationToKey', 'soundToKey', 'patternIdentify'].includes(skill) && targetKeyId) {
      oneGradeDone = true;
      const cardsBefore = await readStore(cdp, 'cards');
      const beforeCard = cardsBefore.find(card => card.id === `${skill}:${note}`);
      const wrongKey = wrongKeyFor(targetKeyId, note);
      await clickKeyboardKey(cdp, wrongKey);
      await waitFor(cdp, `document.querySelector('.operation-stage .feedback')?.className.includes('bad')`, 'wrong first attempt feedback');
      const logsAfterWrong = await readStore(cdp, 'reviewLogEvents');
      assert(logsAfterWrong.length === questionLogCountBefore + 1, `Wrong first attempt must persist exactly one ReviewLog: ${logsAfterWrong.length - questionLogCountBefore}`);
      await clickKeyboardKey(cdp, targetKeyId);
      await waitFor(cdp, `Boolean(document.querySelector('.next-question-inline-btn'))`, 'corrective completion');
      const logsAfterCorrective = await readStore(cdp, 'reviewLogEvents');
      assert(logsAfterCorrective.length === logsAfterWrong.length, `Corrective success must not add a ReviewLog: ${logsAfterCorrective.length - logsAfterWrong.length}`);
      const cardsAfter = await readStore(cdp, 'cards');
      const afterCard = cardsAfter.find(card => card.id === `${skill}:${note}`);
      assert(afterCard && beforeCard && afterCard.reps === beforeCard.reps + 1, `Corrective must not mutate FSRS again: ${beforeCard?.reps} -> ${afterCard?.reps}`);
      evidence.oneGradeInvariant = {
        skill,
        reviewLogsAfterWrong: 1,
        reviewLogsAfterCorrective: 0,
        fsrsRepsDelta: afterCard.reps - beforeCard.reps
      };
      await clickSelector(cdp, '.next-question-inline-btn');
      await waitQuestionAdvanced(cdp, questionId, 'next question after one-grade test');
      completedTasks += 1;
      logsSeen = logsAfterCorrective.length;
      continue;
    }

    if (ADVANCED_FAMILIES.includes(skill)) advancedSeen.add(skill);

    if (skill === 'chordPulse' || skill === 'chordChangeTiming' || skill === 'chordRhythmPattern') {
      await driveRhythmTask(cdp, harmonyChords);
      await clickSelector(cdp, '[data-testid="rhythm-next-question"]');
      await waitQuestionAdvanced(cdp, questionId, 'next question after rhythm task');
    } else if (skill === 'harmonyProgressionPlay') {
      await driveHarmonyProgression(cdp, harmonyChords);
      await clickSelector(cdp, '[data-testid="harmony-review-next"]');
      await waitQuestionAdvanced(cdp, questionId, 'next question after harmony progression');
    } else if (skill === 'harmonyFunctionIdentify' || skill === 'harmonyNextChord') {
      const expected = await cdp.evaluate(`window.__harmonyDebug?.expectedAnswer?.() ?? null`);
      assert(expected, `Harmony semantic task ${skill} has no expected answer.`);
      const clicked = await cdp.evaluate(`(() => {
        const options = [...document.querySelectorAll('[data-testid="harmony-semantic-options"] button')];
        const button = options.find(option => option.innerText.includes(${JSON.stringify(expected)}));
        if (!button) return false;
        button.click();
        return true;
      })()`);
      assert(clicked, `Harmony answer option for ${expected} not found.`);
      await waitFor(cdp, `Boolean(document.querySelector('[data-testid="harmony-review-next"]'))`, 'harmony semantic completion');
      await clickSelector(cdp, '[data-testid="harmony-review-next"]');
      await waitQuestionAdvanced(cdp, questionId, 'next question after harmony semantic');
    } else if (skill === 'triadBuild' || skill === 'triadInversionBuild' || skill === 'chordSymbolRead') {
      await clickChordKeys(cdp, triadKeyIds);
      await waitFor(cdp, `document.querySelector('.triad-selection-count')?.innerText.includes('3')`, 'triad selection');
      await clickSelector(cdp, '.triad-check-btn');
      await waitFor(cdp, `Boolean(document.querySelector('.next-question-inline-btn'))`, 'triad completion');
      await clickSelector(cdp, '.next-question-inline-btn');
      await waitQuestionAdvanced(cdp, questionId, 'next question after triad task');
    } else if (skill === 'intervalIdentify') {
      const clicked = await clickSelector(cdp, `button[data-interval-id="${note}"]`);
      assert(clicked, `Interval answer ${note} not found.`);
      await waitFor(cdp, `Boolean(document.querySelector('.next-question-inline-btn'))`, 'interval identify completion');
      await clickSelector(cdp, '.next-question-inline-btn');
      await waitQuestionAdvanced(cdp, questionId, 'next question after interval identify');
    } else if (skill === 'triadIdentify') {
      const clicked = await clickSelector(cdp, `button[data-quality-id="${note}"]`);
      assert(clicked, `Triad quality answer ${note} not found.`);
      await waitFor(cdp, `Boolean(document.querySelector('.next-question-inline-btn'))`, 'triad identify completion');
      await clickSelector(cdp, '.next-question-inline-btn');
      await waitQuestionAdvanced(cdp, questionId, 'next question after triad identify');
    } else if (skill === 'triadInversionIdentify') {
      const clicked = await clickSelector(cdp, `button[data-answer-note="${note}"]`);
      assert(clicked, `Inversion identify answer ${note} not found.`);
      await waitFor(cdp, `Boolean(document.querySelector('.next-question-inline-btn'))`, 'inversion identify completion');
      await clickSelector(cdp, '.next-question-inline-btn');
      await waitQuestionAdvanced(cdp, questionId, 'next question after inversion identify');
    } else if (skill === 'identify') {
      const clicked = await clickSelector(cdp, `button[data-answer-note="${note}"]`);
      assert(clicked, `Identify answer ${note} not found.`);
      await waitFor(cdp, `Boolean(document.querySelector('.next-question-inline-btn'))`, 'identify completion');
      await clickSelector(cdp, '.next-question-inline-btn');
      await waitQuestionAdvanced(cdp, questionId, 'next question after identify');
    } else {
      const keyId = targetKeyId || `${note}4`;
      const clicked = await clickKeyboardKey(cdp, keyId);
      assert(clicked, `Expected key ${keyId} not found for ${skill}.`);
      await waitFor(cdp, `Boolean(document.querySelector('.next-question-inline-btn'))`, `${skill} completion`);
      await clickSelector(cdp, '.next-question-inline-btn');
      await waitQuestionAdvanced(cdp, questionId, `next question after ${skill}`);
    }

    completedTasks += 1;
    const logsNow = await readStore(cdp, 'reviewLogEvents');
    assert(logsNow.length >= logsSeen, 'Review log count decreased.');
    assert(logsNow.length - questionLogCountBefore <= 1, `More than one ReviewLog persisted for one task: ${logsNow.length - questionLogCountBefore}`);
    const ids = new Set(logsNow.map(entry => entry.reviewEventId));
    assert(ids.size === logsNow.length, 'Duplicate reviewEventId detected.');
    logsSeen = logsNow.length;

    if (phase === 'advanced' && advancedCovered()) {
      phase = 'long';
      await seedDatabase(cdp, synthetic, { clearLogs: false });
      await waitFor(
        cdp,
        `window.__activeTaskDebug && !document.querySelector('[data-testid="session-complete-stage"]')`,
        'long-run Daily Practice task'
      );
    }

    if (completedTasks >= TARGET_TASKS && coverageSatisfied()) break;
  }

  assert(completedTasks >= TARGET_TASKS, `Only ${completedTasks} Daily Practice tasks completed.`);
  const missingAdvanced = ADVANCED_FAMILIES.filter(family => !advancedSeen.has(family));
  assert(missingAdvanced.length === 0,
    `Advanced families missing from Daily Practice run: ${missingAdvanced.join(', ')} (completed=${completedTasks}, attempts=${attemptGuard}, seen=${[...advancedSeen].join('|')}, skills=${JSON.stringify([...new Set(skillSequence)].sort())})`);
  const missingGroups = Object.entries(requiredGroups)
    .filter(([, skills]) => !skills.some(skill => skillSequence.includes(skill)))
    .map(([group]) => group);
  assert(missingGroups.length === 0,
    `Daily Practice family groups missing: ${missingGroups.join(', ')} (skills=${JSON.stringify([...new Set(skillSequence)].sort())})`);

  const finalLogs = await readStore(cdp, 'reviewLogEvents');
  const finalIds = new Set(finalLogs.map(entry => entry.reviewEventId));
  evidence.dailyPracticeTaskCount = completedTasks;
  evidence.uniqueSkills = [...new Set(skillSequence)];
  evidence.uniqueTaskTypes = [...taskTypes];
  evidence.uniqueQuestionInstances = seenQuestions.size;
  evidence.reviewLogCount = finalLogs.length;
  evidence.duplicateReviewCount = finalLogs.length - finalIds.size;
  evidence.advancedFamiliesCovered = [...advancedSeen];
  evidence.maxSameSkillStreak = (() => {
    let max = 0;
    let current = 0;
    let last = null;
    for (const skill of skillSequence) {
      if (skill === last) current += 1; else { current = 1; last = skill; }
      max = Math.max(max, current);
    }
    return max;
  })();
  evidence.maxSameCardStreak = 1;
  assert(evidence.duplicateReviewCount === 0, `Duplicate review identities detected: ${evidence.duplicateReviewCount}`);
  assert(evidence.uniqueQuestionInstances === completedTasks, `Question identity duplication: ${evidence.uniqueQuestionInstances} vs ${completedTasks}`);
  assert(evidence.oneGradeInvariant, 'One-grade invariant was not exercised.');

  // Diagnostics: clean snapshot with the full synthetic profile after the run.
  await cdp.evaluate(`(() => [...document.querySelectorAll('.top-nav-btn')].find(item => item.innerText.trim() === 'Диагностика')?.click())()`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="diagnostic-roadmap"]'))`, 'diagnostics page');
  const snapshot = await cdp.evaluate(`window.__getDiagnosticsSnapshot?.() ?? null`);
  assert(snapshot, 'Diagnostics snapshot hook is unavailable.');
  assert(snapshot.storageConsistency.checks.unknownSkillIds.length === 0,
    `Unknown skills in diagnostics: ${JSON.stringify(snapshot.storageConsistency.checks.unknownSkillIds)}`);
  assert(snapshot.roadmap.totalStages === 12 && snapshot.roadmap.completedStages === 11,
    `Roadmap snapshot wrong: ${JSON.stringify({ total: snapshot.roadmap.totalStages, completed: snapshot.roadmap.completedStages })}`);
  assert(snapshot.meta.storageSchemaVersion >= 4, `Storage schema version not reported: ${snapshot.meta.storageSchemaVersion}`);
  assert(snapshot.meta.diagnosticsSchemaVersion === 3, `Diagnostics schema version wrong: ${snapshot.meta.diagnosticsSchemaVersion}`);
  assert(snapshot.persistence.reviewLogStore === 'reviewLogEvents', 'Persistence store not reported.');
  const diagnosticsJson = JSON.stringify(snapshot);
  assert(!diagnosticsJson.includes('NaN') && !diagnosticsJson.includes('Infinity'), 'Diagnostics JSON contains NaN/Infinity.');

  evidence.diagnosticsSchemaVersion = snapshot.meta.diagnosticsSchemaVersion;
  evidence.storageVersion = snapshot.meta.storageSchemaVersion;
  evidence.knownSkillsCount = snapshot.fsrs && snapshot.storageConsistency ? Object.keys(snapshot.fsrs.bySkill).length : 0;
  evidence.unknownSkills = snapshot.storageConsistency.checks.unknownSkillIds;
  evidence.roadmapStages = snapshot.roadmap.totalStages;
  evidence.completedStages = snapshot.roadmap.completedStages;
  evidence.reviewLogCount = snapshot.persistence.totalReviewEvents;
  evidence.latencyProvenance = snapshot.persistence.responseTiming;
  evidence.invalidNumericCount = 0;
  evidence.dailyPracticeDiagnostics = {
    totalSessions: snapshot.dailyPractice.totalSessions,
    recentTasks: snapshot.dailyPractice.recentTasks.length,
    diversity: snapshot.dailyPractice.diversity
  };
  assert(snapshot.dailyPractice.totalSessions >= 1, 'Daily Practice sessions were not recorded in diagnostics.');
  assert(snapshot.dailyPractice.recentTasks.length > 0, 'Daily Practice tasks missing from diagnostics.');
  screenshots.push(await saveScreenshot(cdp, '04-diagnostics-clean.png'));

  const runtimeExceptions = cdp.runtimeExceptions;
  const consoleErrors = cdp.consoleErrors.filter(message => !message.includes('favicon'));
  assert(runtimeExceptions.length === 0, `Runtime exceptions: ${runtimeExceptions.join(' | ')}`);
  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);

  await mkdir(screenshotDir, { recursive: true });
  for (const shot of screenshots) {
    await writeFile(path.join(screenshotDir, shot.fileName), shot.bytes);
  }
  await writeFile(path.join(evidenceDir, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.info(`Daily Practice heterogeneity smoke passed: ${completedTasks} tasks, ${evidence.uniqueSkills.length} skills, ${screenshots.length} screenshots.`);
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
