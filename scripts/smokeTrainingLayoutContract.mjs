import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
const acceptanceDir = path.join(projectDir, 'acceptance', 'layout-contract');
const screenshotDir = path.join(acceptanceDir, 'screenshots');
const summaryPath = path.join(acceptanceDir, 'layout-contract-summary.json');

const VIEWPORTS = [
  { width: 1920, height: 1080, name: '1920x1080-fhd', label: '1920×1080 (Desktop FHD)' },
  { width: 1792, height: 864,  name: '1792x864-failing-baseline', label: '1792×864 (Reported User Failure)' },
  { width: 1440, height: 900,  name: '1440x900-macbook', label: '1440×900 (MacBook Pro / Standard Desktop)' },
  { width: 1366, height: 768,  name: '1366x768-laptop', label: '1366×768 (Standard Laptop)' },
  { width: 1280, height: 800,  name: '1280x800-wxga', label: '1280×800 (16:10 Laptop)' },
  { width: 1024, height: 768,  name: '1024x768-compact-desktop', label: '1024×768 (Compact Desktop Minimum)' }
];

const M3L_STATES = [
  { id: 'idle', label: 'Idle / Waiting', setup: 'window.__m3lDebug.setIdle()' },
  { id: 'count-in', label: 'Count-In (4-3-2-1)', setup: 'window.__m3lDebug.setCountIn(3)' },
  { id: 'playing', label: 'Active Playing', setup: 'window.__m3lDebug.setPlaying(1)' },
  { id: 'feedback', label: 'Success Feedback', setup: 'window.__m3lDebug.setFeedback("Отлично! Обе руки нажаты синхронно.", "good")' },
  { id: 'corrective', label: 'Corrective Mode', setup: 'window.__m3lDebug.setCorrective("Ошибка в аккорде: сыграно C-E-G вместо C-E-A.")' },
  { id: 'assessment', label: 'Transfer Assessment', setup: 'window.__m3lDebug.setAssessment(2)' }
];

const baseSettings = {
  sessionPreset: 'normal',
  level: 'white',
  mode: 'smart',
  autoAdvanceDelaySeconds: 0,
  desiredRetention: 0.9,
  maxIntervalDays: 120,
  relearningSeconds: 45,
  newPitchClassesPerSession: 2,
  useLatencyGrading: true,
  notationClef: 'treble',
  twoHandArrangement: 'split_hands',
  midiCalibration: {
    deviceId: 'fake-layout-midi',
    deviceName: 'Layout Test MIDI Keybed',
    minNote: 36,
    maxNote: 84,
    physicalKeyCount: 49,
    calibratedAt: 1700000000000
  }
};

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.stack = error.stack?.split('\n').slice(1).join('\n');
    throw error;
  }
}

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForChromePort(dir, attempts = 100) {
  const portFile = path.join(dir, 'DevToolsActivePort');
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await readFile(portFile, 'utf8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (lines[0]) return Number(lines[0]);
    } catch {}
    await delay(100);
  }
  throw new Error('Chrome did not expose a DevTools port.');
}

async function connectPage(port) {
  let target;
  for (let attempt = 0; attempt < 100; attempt++) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
    target = targets.find(item => item.type === 'page');
    if (target?.webSocketDebuggerUrl) break;
    await delay(100);
  }
  assert(target?.webSocketDebuggerUrl, 'Chrome did not expose its initial page.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
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
        runtimeExceptions.push(
          message.params.exceptionDetails?.exception?.description ||
          message.params.exceptionDetails?.text || 'Runtime exception'
        );
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(
          (message.params.args || []).map(a => a.value || a.description || '').join(' ')
        );
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
    socket,
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
        throw new Error(
          result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          'Page evaluation failed'
        );
      }
      return result.result?.value;
    }
  };
}

async function waitFor(cdp, expression, description, attempts = 300) {
  for (let i = 0; i < attempts; i++) {
    try {
      const value = await cdp.evaluate(expression);
      if (value) return value;
    } catch {}
    await delay(100);
  }
  let diag = '';
  try {
    diag = await cdp.evaluate(`JSON.stringify({
      url: location.href,
      readyState: document.readyState,
      topNavButtons: document.querySelectorAll('.top-nav-btn').length,
      bodyText: document.body?.innerText?.slice(0, 300)
    })`);
  } catch {}
  throw new Error(`Timed out waiting for: ${description} (page state: ${diag})`);
}

async function captureScreenshot(cdp, filename) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(result.data, 'base64');
  const filePath = path.join(screenshotDir, filename);
  await writeFile(filePath, buffer);
  return filePath;
}

async function setViewport(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });
  await cdp.send('Emulation.setVisibleSize', { width, height });
  await delay(150);
}

async function measureLayoutContract(cdp, contextName) {
  return await cdp.evaluate(`(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const app = document.querySelector('.app');
    const practicePage = document.querySelector('.workspace-page[data-page="practice"].active');
    const stageCenter = document.querySelector('.practice-stage-center');
    const stageCard = document.querySelector(
      '.two-hand-card, .rhythm-stage-card, .harmony-stage, .first-run-card, .challenge'
    );
    const keyboardCard = document.querySelector('.keyboard-card');
    const keyboard = document.querySelector('.keyboard');

    // Primary action / navigation buttons
    const primaryBtn = document.querySelector(
      '[data-testid="two-hand-start-run"], [data-testid="two-hand-check"], [data-testid="two-hand-continue"], [data-testid="two-hand-complete-module"], [data-testid="two-hand-next-question"], [data-testid="two-hand-remediation-next"], ' +
      '[data-testid="rhythm-start-run"], [data-testid="rhythm-submit-chord"], [data-testid="rhythm-next-question"], ' +
      '.primary.feedback-action-btn, .next-question-inline-btn, #dontKnowBtn, #replaySoundBtn, ' +
      '.first-run-actions button, .first-run-btn-next, .harmony-action-btn, .roadmap-action-btn'
    );

    // Next button specifically (if present)
    const nextBtn = document.querySelector(
      '.next-question-inline-btn, [data-testid="two-hand-next-question"], [data-testid="two-hand-remediation-next"], [data-testid="rhythm-next-question"], .first-run-btn-next'
    );

    // Task instruction
    const instruction = document.querySelector(
      '[data-testid="two-hand-instruction"], [data-testid="two-hand-timing-state"], ' +
      '[data-testid="rhythm-instruction"], [data-testid="rhythm-timing-state"], ' +
      '.instruction, .stage-instruction, .first-run-body'
    );

    // Feedback
    const feedback = document.querySelector(
      '[data-testid="two-hand-feedback"], [data-testid="rhythm-feedback"], .feedback, .first-run-feedback-bar'
    );

    const eyebrow = document.querySelector('.two-hand-eyebrow, .rhythm-eyebrow, .stage-eyebrow, .eyebrow, .first-run-eyebrow');

    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const docH = docEl.scrollHeight;
    const docClientH = docEl.clientHeight;
    const docW = docEl.scrollWidth;
    const docClientW = docEl.clientWidth;

    const pageH = practicePage ? practicePage.scrollHeight : 0;
    const pageClientH = practicePage ? practicePage.clientHeight : 0;

    const stageCenterH = stageCenter ? stageCenter.scrollHeight : 0;
    const stageCenterClientH = stageCenter ? stageCenter.clientHeight : 0;

    const cardRect = stageCard ? stageCard.getBoundingClientRect() : null;
    const keyboardRect = keyboardCard ? keyboardCard.getBoundingClientRect() : null;
    const buttonRect = primaryBtn ? primaryBtn.getBoundingClientRect() : null;
    const nextRect = nextBtn ? nextBtn.getBoundingClientRect() : null;
    const stageRect = stageCenter ? stageCenter.getBoundingClientRect() : null;
    const instructionRect = instruction ? instruction.getBoundingClientRect() : null;
    const feedbackRect = (feedback && feedback.offsetParent !== null) ? feedback.getBoundingClientRect() : null;

    const hasHorizontalOverflow = docW > docClientW + 1;
    const hasVerticalPageOverflow = docH > docClientH + 1;
    const hasStageCenterOverflow = stageCenter ? (stageCenterH > stageCenterClientH + 2) : false;

    // Strict Layout Contract: primary button must be above keyboard dock
    const buttonAboveKeyboard = (buttonRect && keyboardRect) ? (buttonRect.bottom <= keyboardRect.top + 2) : true;
    const buttonInsideViewport = buttonRect ? (buttonRect.top >= 0 && buttonRect.bottom <= winH + 1) : true;
    const buttonVisible = buttonRect ? (buttonRect.width > 0 && buttonRect.height > 0) : false;
    const nextAboveKeyboard = (nextRect && keyboardRect) ? (nextRect.bottom <= keyboardRect.top + 2) : true;
    const keyboardInsideViewport = keyboardRect ? (keyboardRect.bottom <= winH + 2) : false;
    const instructionAboveKeyboard = (instructionRect && keyboardRect) ? (instructionRect.bottom <= keyboardRect.top + 2) : true;
    const feedbackAboveKeyboard = (feedbackRect && keyboardRect) ? (feedbackRect.bottom <= keyboardRect.top + 2) : true;

    // Detect actual text clipping across all text elements in the training area
    const clippingViolations = [];
    const scopeContainer = practicePage || app;
    if (scopeContainer) {
      const candidates = scopeContainer.querySelectorAll(
        'h1, h2, h3, h4, p, span, strong, b, small, button, [role="status"], ' +
        '.instruction, .feedback, .eyebrow, .stage-instruction, ' +
        '[data-testid^="two-hand-"], [data-testid^="rhythm-"], ' +
        '.hand-panel, .two-hand-status, .two-hand-feedback, ' +
        '.reaction-panel, .feedback-action-btn, .first-run-body, ' +
        '.session-strip .session-meta b, .session-strip .session-meta small, .session-strip .session-meta span'
      );

      for (const el of candidates) {
        if (keyboardCard && keyboardCard.contains(el)) continue;
        if (el.offsetParent === null && getComputedStyle(el).display === 'none') continue;
        if (el.closest('.settings-drawer')) continue;

        const text = el.innerText?.trim();
        if (!text && el.children.length === 0) continue;

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // Anti-Ellipsis regression check for session title
        if (el.matches('.session-strip .session-meta b')) {
          if (style.textOverflow === 'ellipsis') {
            clippingViolations.push(
              'Session title forced text-overflow:ellipsis on .session-strip .session-meta b text="' + text.slice(0, 40) + '..."'
            );
          }
          if (style.whiteSpace === 'nowrap') {
            clippingViolations.push(
              'Session title forced white-space:nowrap on .session-strip .session-meta b text="' + text.slice(0, 40) + '..."'
            );
          }
        }

        // 1. Direct text overflow / clipping
        const hidesX = style.overflowX === 'hidden' || style.overflowX === 'clip';
        const hidesY = style.overflowY === 'hidden' || style.overflowY === 'clip';
        const isEllipsis = style.textOverflow === 'ellipsis';

        if (hidesX || isEllipsis) {
          if (el.scrollWidth > el.clientWidth + 1.5) {
            clippingViolations.push(
              'Text horizontally clipped (' + (isEllipsis ? 'ellipsis' : 'overflow:hidden') + '): ' +
              el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').filter(Boolean).join('.') : '') +
              ' [scrollW=' + el.scrollWidth + ' > clientW=' + el.clientWidth + '] text="' + text.slice(0, 40) + '..."'
            );
          }
        }

        if (hidesY) {
          if (el.scrollHeight > el.clientHeight + 1.5) {
            clippingViolations.push(
              'Text vertically clipped (overflow:hidden): ' +
              el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').filter(Boolean).join('.') : '') +
              ' [scrollH=' + el.scrollHeight + ' > clientH=' + el.clientHeight + '] text="' + text.slice(0, 40) + '..."'
            );
          }
        }

        // 2. Ancestor clipping
        let anc = el.parentElement;
        while (anc && anc !== scopeContainer && anc !== document.body) {
          const ancStyle = window.getComputedStyle(anc);
          const ancHidesX = ancStyle.overflowX === 'hidden' || ancStyle.overflowX === 'clip';
          const ancHidesY = ancStyle.overflowY === 'hidden' || ancStyle.overflowY === 'clip';
          if (ancHidesX || ancHidesY) {
            const ancRect = anc.getBoundingClientRect();
            if (ancHidesY && (rect.bottom > ancRect.bottom + 1.5 || rect.top < ancRect.top - 1.5)) {
              clippingViolations.push(
                'Text clipped by ancestor (' + anc.tagName.toLowerCase() + (anc.className ? '.' + anc.className.split(' ').filter(Boolean).join('.') : '') + '): ' +
                el.tagName.toLowerCase() + ' bottom=' + Math.round(rect.bottom) + ' > ancBottom=' + Math.round(ancRect.bottom)
              );
              break;
            }
            if (ancHidesX && (rect.right > ancRect.right + 1.5 || rect.left < ancRect.left - 1.5)) {
              clippingViolations.push(
                'Text horizontally clipped by ancestor: ' + el.tagName.toLowerCase() + ' right=' + Math.round(rect.right) + ' > ancRight=' + Math.round(ancRect.right)
              );
              break;
            }
          }
          anc = anc.parentElement;
        }

        // 3. Occlusion by keyboard dock
        if (keyboardRect && rect.bottom > keyboardRect.top + 1.5 && rect.height > 0) {
          clippingViolations.push(
            'Element occluded by piano dock: ' + el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').filter(Boolean).join('.') : '') +
            ' bottom=' + Math.round(rect.bottom) + ' > dockTop=' + Math.round(keyboardRect.top)
          );
        }
      }
    }

    return {
      winW,
      winH,
      docH,
      docClientH,
      docW,
      docClientW,
      hasHorizontalOverflow,
      hasVerticalPageOverflow,
      hasStageCenterOverflow,
      pageH,
      pageClientH,
      stageCenterH,
      stageCenterClientH,
      cardRect: cardRect ? { top: Math.round(cardRect.top), bottom: Math.round(cardRect.bottom), height: Math.round(cardRect.height) } : null,
      keyboardRect: keyboardRect ? { top: Math.round(keyboardRect.top), bottom: Math.round(keyboardRect.bottom), height: Math.round(keyboardRect.height) } : null,
      buttonRect: buttonRect ? { top: Math.round(buttonRect.top), bottom: Math.round(buttonRect.bottom), height: Math.round(buttonRect.height) } : null,
      nextRect: nextRect ? { top: Math.round(nextRect.top), bottom: Math.round(nextRect.bottom), height: Math.round(nextRect.height) } : null,
      instructionRect: instructionRect ? { top: Math.round(instructionRect.top), bottom: Math.round(instructionRect.bottom), height: Math.round(instructionRect.height) } : null,
      feedbackRect: feedbackRect ? { top: Math.round(feedbackRect.top), bottom: Math.round(feedbackRect.bottom), height: Math.round(feedbackRect.height) } : null,
      stageRect: stageRect ? { top: Math.round(stageRect.top), bottom: Math.round(stageRect.bottom), height: Math.round(stageRect.height) } : null,
      buttonAboveKeyboard,
      buttonInsideViewport,
      buttonVisible,
      nextAboveKeyboard,
      instructionAboveKeyboard,
      feedbackAboveKeyboard,
      keyboardInsideViewport,
      buttonClearancePx: (buttonRect && keyboardRect) ? Math.round(keyboardRect.top - buttonRect.bottom) : null,
      nextClearancePx: (nextRect && keyboardRect) ? Math.round(keyboardRect.top - nextRect.bottom) : null,
      stageCenterHeadroomPx: stageCenter ? Math.round(stageCenterClientH - stageCenterH) : null,
      clippingViolations
    };
  })()`);
}

async function createSyntheticProfiles() {
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
    const firstRun = await server.ssrLoadModule('/src/core/learning/firstRunCf.ts');
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
      harmony.HARMONY_ITEM_IDS.COMPLETE
    ]) complete(id);

    // Profile for Chord Rhythm (changeOnBeatOne)
    const chordRhythmProgress = new Map(progress);
    const crRecord = learning.createInitialLearningProgress(chordRhythm.CHORD_RHYTHM_ITEM_IDS.SESSION, now);
    chordRhythmProgress.set(crRecord.id, {
      ...crRecord,
      modelCompleted: true,
      chordRhythmSnapshot: {
        stage: 'changeOnBeatOne',
        barIndex: 0,
        sequenceIndex: 0,
        bpm: 60,
        activeBeat: 0,
        outcomes: [],
        assessment: {
          blockKind: 'initial',
          phase: 'active',
          trialIndex: 0,
          trialsCompleted: 0,
          correctFirstAttempts: 0,
          failedTrialIndexes: [],
          remediationTrialIndexes: [],
          remediationIndex: 0,
          remediationUsed: 0
        }
      }
    });

    // Profile for Two Hand (simultaneous)
    const twoHandProgress = new Map(progress);
    const crDone = learning.createInitialLearningProgress(chordRhythm.CHORD_RHYTHM_ITEM_IDS.COMPLETE, now);
    twoHandProgress.set(crDone.id, { ...crDone, state: 'retention', modelCompleted: true, guidedSuccesses: 2, independentUnhintedSuccesses: 8, updatedAt: now });
    const thRecord = learning.createInitialLearningProgress(twoHand.TWO_HAND_ITEM_IDS.SESSION, now);
    twoHandProgress.set(thRecord.id, {
      ...thRecord,
      modelCompleted: true,
      twoHandSnapshot: {
        stage: 'simultaneous',
        chordIndex: 0,
        leftIndex: 4,
        rightIndex: 4,
        simultaneousIndex: 0,
        alternatingIndex: 0,
        barsPassed: 0,
        independentPassed: false,
        awaitingCorrective: false,
        trialHadWrong: false,
        assessment: {
          blockKind: 'initial',
          phase: 'active',
          trialIndex: 0,
          trialsCompleted: 0,
          correctFirstAttempts: 0,
          failedTrialIndexes: [],
          remediationTrialIndexes: [],
          remediationIndex: 0,
          remediationUsed: 0,
          pendingCorrective: false
        }
      }
    });

    // Profile for First Run C/F
    const firstRunProgress = new Map();
    const frRecord = learning.createInitialLearningProgress(firstRun.FIRST_RUN_CF_ITEM_IDS.ANCHOR_C, now);
    firstRunProgress.set(frRecord.id, frRecord);

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

    // Active review cards for Daily Practice
    const dailyCards = profile.cards.slice(0, 10).map((card, idx) => ({
      ...card,
      memoryState: 'review',
      stability: 3,
      difficulty: 5,
      dueAt: now - 3600_000,
      lastReviewAt: now - 86400_000,
      firstSeenAt: now - 86400_000,
      reps: 1,
      lapses: 0,
      lastGrade: 3,
      stats: { trials: 1, firstCorrect: 1, firstWrong: 0, hints: 0, recentScheduledSuccesses: 1, scheduledSuccesses: 1, practiceTrials: 0 }
    }));

    // Cold test cards
    const coldFamilies = [
      { skill: 'find', note: 'C' },
      { skill: 'identify', note: 'C' },
      { skill: 'patternIdentify', note: 'C' },
      { skill: 'notationToKey', note: 'C' },
      { skill: 'soundToKey', note: 'C' },
      { skill: 'notationBassToKey', note: 'C' },
      { skill: 'intervalBuild', note: 'P8' },
      { skill: 'triadBuild', note: 'major', reps: 3 }
    ];
    const coldCards = coldFamilies.map(({ skill, note, reps = 1 }) => ({
      id: `${skill}:${note}`,
      skill,
      note,
      memoryState: 'review',
      stability: 3,
      difficulty: 5,
      dueAt: now,
      lastReviewAt: now - 86400_000,
      firstSeenAt: now - 86400_000,
      reps,
      lapses: 0,
      lastGrade: 3,
      stats: { trials: reps, firstCorrect: reps, firstWrong: 0, hints: 0, recentScheduledSuccesses: reps, scheduledSuccesses: reps, practiceTrials: 0 }
    }));

    // Profile for all completed (retention mode)
    const allCompletedProgress = new Map(progress);
    const crCompleteRecord = learning.createInitialLearningProgress(chordRhythm.CHORD_RHYTHM_ITEM_IDS.COMPLETE, now);
    allCompletedProgress.set(crCompleteRecord.id, { ...crCompleteRecord, state: 'retention', modelCompleted: true, guidedSuccesses: 2, independentUnhintedSuccesses: 8, updatedAt: now });
    const thCompleteRecord = learning.createInitialLearningProgress(twoHand.TWO_HAND_ITEM_IDS.COMPLETE, now);
    allCompletedProgress.set(thCompleteRecord.id, { ...thCompleteRecord, state: 'retention', modelCompleted: true, guidedSuccesses: 2, independentUnhintedSuccesses: 8, updatedAt: now });

    return {
      cards,
      dailyCards,
      coldCards,
      profiles: {
        allCompleted: [...allCompletedProgress.values()],
        twoHandSimultaneous: [...twoHandProgress.values()],
        chordRhythmChangeOnBeatOne: [...chordRhythmProgress.values()],
        firstRunCf: [...firstRunProgress.values()]
      }
    };
  } finally {
    await server.close();
  }
}

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
  const freshUrl = `${await cdp.evaluate('location.origin + location.pathname')}?layoutSeed=${Date.now()}`;
  await cdp.send('Page.navigate', { url: freshUrl });
  await waitFor(cdp, `location.href === ${JSON.stringify(freshUrl)} && document.readyState === 'complete' && document.querySelectorAll('.top-nav-btn').length === 9`, 'reloaded synthetic profile');
  await delay(500);
}

async function openProgram(cdp) {
  await cdp.evaluate(`(() => (document.querySelector('.top-nav-btn[data-page-id="curriculum"]') || [...document.querySelectorAll('.top-nav-btn')].find(b => b.innerText.trim() === 'Программа'))?.click())()`);
  await waitFor(cdp, `document.querySelector('[data-page="curriculum"].active') !== null`, 'Program page');
}

async function openPractice(cdp) {
  await cdp.evaluate(`(() => (document.querySelector('.top-nav-btn[data-page-id="practice"]') || [...document.querySelectorAll('.top-nav-btn')].find(b => b.innerText.trim() === 'Тренировка'))?.click())()`);
  await waitFor(cdp, `document.querySelector('[data-page="practice"].active') !== null`, 'Practice page');
}

async function startTwoHandModule(cdp) {
  if (await cdp.evaluate(`Boolean(document.querySelector('[data-testid="two-hand-stage"]'))`)) {
    return;
  }
  await openProgram(cdp);
  await waitFor(cdp, `Boolean(document.querySelector('[data-stage-id="two_hand"]'))`, 'two_hand roadmap card');
  await cdp.evaluate(`document.querySelector('[data-stage-id="two_hand"]')?.click()`);
  await waitFor(cdp, `Boolean(document.querySelector('.roadmap-action-btn'))`, 'two_hand module action');
  await cdp.evaluate('document.querySelector(".roadmap-action-btn")?.click()');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-stage"]'))`, 'two-hand stage mounted');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="two-hand-start-run"]'))`, 'Two-hand start-run button visible');
}

async function startChordRhythmModule(cdp) {
  if (await cdp.evaluate(`Boolean(document.querySelector('[data-testid="chord-rhythm-stage"]'))`)) {
    return;
  }
  await openProgram(cdp);
  await waitFor(cdp, `Boolean(document.querySelector('[data-stage-id="chord_rhythm"]'))`, 'chord_rhythm roadmap card');
  await cdp.evaluate(`document.querySelector('[data-stage-id="chord_rhythm"]')?.click()`);
  await waitFor(cdp, `Boolean(document.querySelector('.roadmap-action-btn'))`, 'chord_rhythm module action');
  await cdp.evaluate('document.querySelector(".roadmap-action-btn")?.click()');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="chord-rhythm-stage"]'))`, 'chord rhythm stage mounted');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="rhythm-start-run"]'))`, 'Rhythm start-run button visible');
}

async function startHarmonyModule(cdp) {
  if (await cdp.evaluate(`Boolean(document.querySelector('[data-testid="harmony-module-stage"], .harmony-stage'))`)) {
    return;
  }
  await openProgram(cdp);
  await waitFor(cdp, `Boolean(document.querySelector('[data-stage-id="harmony"]'))`, 'harmony roadmap card');
  await cdp.evaluate(`document.querySelector('[data-stage-id="harmony"]')?.click()`);
  await waitFor(cdp, `Boolean(document.querySelector('.roadmap-action-btn'))`, 'harmony module action');
  await cdp.evaluate('document.querySelector(".roadmap-action-btn")?.click()');
  await waitFor(cdp, `Boolean(document.querySelector('[data-testid="harmony-module-stage"], .harmony-stage'))`, 'harmony stage mounted');
}

async function evaluateContract(cdp, context) {
  const m = await measureLayoutContract(cdp, context.name);
  const suiteErrors = [];

  if (m.hasVerticalPageOverflow) suiteErrors.push(`Vertical page scrolling (${m.docH}px > ${m.docClientH}px)`);
  if (m.hasHorizontalOverflow) suiteErrors.push(`Horizontal page scrolling (${m.docW}px > ${m.docClientW}px)`);
  if (m.hasStageCenterOverflow) suiteErrors.push(`Stage content exceeds workspace height (${m.stageCenterH}px > ${m.stageCenterClientH}px)`);
  if (m.buttonRect && !m.buttonAboveKeyboard) suiteErrors.push('Primary action button overlaps or is behind piano dock');
  if (m.buttonRect && !m.buttonInsideViewport) suiteErrors.push('Primary action button is outside viewport');
  if (m.nextRect && !m.nextAboveKeyboard) suiteErrors.push('Next button overlaps or is behind piano dock');
  if (!m.instructionAboveKeyboard) suiteErrors.push('Task instruction overlaps or is behind piano dock');
  if (!m.feedbackAboveKeyboard) suiteErrors.push('Feedback overlaps or is behind piano dock');
  if (!m.keyboardInsideViewport) suiteErrors.push('Piano keyboard dock exceeds viewport');
  if (m.clippingViolations && m.clippingViolations.length > 0) {
    suiteErrors.push(...m.clippingViolations);
  }

  return { metrics: m, errors: suiteErrors };
}

async function main() {
  console.log('======================================================================');
  console.log(' Piano Key Trainer — Global Training Layout Contract Acceptance Smoke');
  console.log(' Full UX Verification: M3L 6 States, Daily Practice, Cold Test, Curriculum');
  console.log('======================================================================\n');

  await mkdir(screenshotDir, { recursive: true });

  console.log('[SSR] Building synthetic profiles...');
  const synthetic = await createSyntheticProfiles();

  const prodDist = path.join(projectDir, 'dist');
  if (!existsSync(prodDist)) {
    console.log('[Build] Building normal production build (dist)...');
    const buildRes = spawnSync(process.execPath, [previewEntry, 'build'], {
      cwd: projectDir, stdio: 'inherit'
    });
    assert(buildRes.status === 0, 'Production build failed.');
  }

  // Regression Verification 1: Static Bundle Analysis of Production Build
  console.log('[Security] Verifying production bundle static isolation...');
  const prodAssetsDir = path.join(prodDist, 'assets');
  assert(existsSync(prodAssetsDir), 'Production assets directory missing.');
  const prodJsFiles = readdirSync(prodAssetsDir).filter(f => f.endsWith('.js'));
  assert(prodJsFiles.length > 0, 'No production JS bundles found.');
  for (const jsFile of prodJsFiles) {
    const code = readFileSync(path.join(prodAssetsDir, jsFile), 'utf8');
    assert(!code.includes('__m3lDebug'), `Security violation: __m3lDebug found in production bundle ${jsFile}`);
    assert(!code.includes('__enableM3lDebug'), `Security violation: __enableM3lDebug found in production bundle ${jsFile}`);
  }
  console.log('    [VERIFIED ✓] Static analysis: __m3lDebug and __enableM3lDebug are completely absent from production JS bundle.');

  // Start production preview server to verify runtime hook isolation
  const prodPreviewPort = await getAvailablePort();
  const prodAppUrl = `http://127.0.0.1:${prodPreviewPort}${appRoute}`;
  console.log(`[Preview] Starting production preview at ${prodAppUrl}...`);
  let prodPreviewProcess = spawn(process.execPath, [previewEntry, 'preview', '--host', '127.0.0.1', '--port', String(prodPreviewPort), '--strictPort'], {
    cwd: projectDir, stdio: 'ignore', windowsHide: true
  });
  let prodReady = false;
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      const response = await fetch(prodAppUrl);
      if (response.ok) { prodReady = true; break; }
    } catch {}
    if (prodPreviewProcess.exitCode !== null) throw new Error(`Production preview exited with code ${prodPreviewProcess.exitCode}.`);
    await delay(100);
  }
  assert(prodReady, `Production preview did not become ready at ${prodAppUrl}.`);

  const tempProfileDir = await mkdtemp(path.join(os.tmpdir(), 'pkt-layout-smoke-'));
  const testDist = path.join(projectDir, 'dist-test');
  let testPreviewProcess = null;
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--disable-background-networking',
    '--disable-component-update',
    '--no-default-browser-check',
    '--no-first-run',
    `--user-data-dir=${tempProfileDir}`,
    '--remote-debugging-port=0',
    prodAppUrl
  ], { stdio: 'ignore' });

  let cdp;
  const results = [];
  const allViolations = [];

  try {
    const port = await waitForChromePort(tempProfileDir);
    cdp = await connectPage(port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Regression Verification 2: Runtime Production Build Hook Isolation with ?testHooks
    console.log(`[CDP] Connected to Chrome. Testing production runtime with ?testHooks=1&test=1...`);
    const prodTestHooksUrl = `${prodAppUrl}?testHooks=1&test=1`;
    await cdp.send('Page.navigate', { url: prodTestHooksUrl });
    await waitFor(cdp, `document.readyState === 'complete'`, 'Page load complete on production build');
    await delay(300);

    const prodDebugExists = await cdp.evaluate('typeof window.__m3lDebug !== "undefined"');
    assert(!prodDebugExists, 'Security violation: window.__m3lDebug exists in production build even with ?testHooks=1.');
    const prodActivatorExists = await cdp.evaluate('typeof window.__enableM3lDebug !== "undefined"');
    assert(!prodActivatorExists, 'Security violation: window.__enableM3lDebug exists in production build even with ?testHooks=1.');
    await cdp.evaluate('try { window.__enableM3lDebug?.(); window.__m3lTestMode = true; } catch {}');
    const prodStillNoDebug = await cdp.evaluate('typeof window.__m3lDebug !== "undefined"');
    assert(!prodStillNoDebug, 'Security violation: window.__m3lDebug activated in production build.');
    console.log('    [VERIFIED ✓] Runtime regression check passed: production build cannot activate debug state mutation, even with ?testHooks.');

    // Shut down production preview
    try { prodPreviewProcess.kill(); } catch {}
    prodPreviewProcess = null;

    // Explicitly Configured Test Build for Layout Testing (Requirement 4)
    console.log('\n[Test Build] Building explicitly configured test build with __ENABLE_TEST_HOOKS__=true...');
    const testBuildRes = spawnSync(process.execPath, [previewEntry, 'build', '--mode', 'test'], {
      cwd: projectDir, stdio: 'inherit'
    });
    assert(testBuildRes.status === 0, 'Test build failed.');
    assert(existsSync(testDist), 'dist-test directory missing after test build.');

    const testPreviewPort = await getAvailablePort();
    const testAppUrl = `http://127.0.0.1:${testPreviewPort}${appRoute}`;
    console.log(`[Preview] Starting test build preview at ${testAppUrl}...`);
    testPreviewProcess = spawn(process.execPath, [
      previewEntry, 'preview',
      '--outDir', 'dist-test',
      '--host', '127.0.0.1',
      '--port', String(testPreviewPort),
      '--strictPort'
    ], {
      cwd: projectDir, stdio: 'ignore', windowsHide: true
    });
    let testReady = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      try {
        const response = await fetch(testAppUrl);
        if (response.ok) { testReady = true; break; }
      } catch {}
      if (testPreviewProcess.exitCode !== null) throw new Error(`Test build preview exited with code ${testPreviewProcess.exitCode}.`);
      await delay(100);
    }
    assert(testReady, `Test build preview did not become ready at ${testAppUrl}.`);

    console.log(`[CDP] Navigating Chrome to test build at ${testAppUrl}...`);
    await cdp.send('Page.navigate', { url: testAppUrl });
    await waitFor(cdp, `document.readyState === 'complete'`, 'Page load complete on test build');
    await waitFor(cdp, `document.querySelectorAll('.top-nav-btn').length === 9`, 'Top nav buttons mounted');
    await delay(300);

    // =========================================================================
    // Test Suite 1: M3L Two-Hand Training across All 6 States & All 6 Viewports
    // =========================================================================
    console.log('\n--- 1. Testing M3L Two-Hand Training: 6 States × 6 Viewports (36 test cases) ---');
    await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.twoHandSimultaneous });
    await startTwoHandModule(cdp);

    // Activate test mode in test build
    await cdp.evaluate('window.__enableM3lDebug?.()');
    await waitFor(cdp, `Boolean(window.__m3lDebug)`, '__m3lDebug ready in test build');
    console.log('    [VERIFIED ✓] Test build ready: window.__m3lDebug activated for layout testing.');

    for (const stateDef of M3L_STATES) {
      console.log(`\n  >> Testing M3L State: [${stateDef.label}] (${stateDef.id})`);
      await cdp.evaluate(stateDef.setup);
      await delay(150);

      for (const vp of VIEWPORTS) {
        await setViewport(cdp, vp.width, vp.height);
        const contextName = `m3l-${stateDef.id}-${vp.name}`;
        const { metrics: m, errors } = await evaluateContract(cdp, { name: contextName });

        const isRepresentative = (vp.width === 1792 || vp.width === 1024);
        let screenshotFile = null;
        if (isRepresentative) {
          screenshotFile = `${contextName}.png`;
          await captureScreenshot(cdp, screenshotFile);
        }

        const statusLabel = errors.length === 0 ? 'PASS ✓' : 'FAIL ❌';
        console.log(`    [${statusLabel}] ${vp.label} | Scroll: ${m.docW}x${m.docH} (0px overflow) | Clearance: ${m.buttonClearancePx ?? m.nextClearancePx ?? 'N/A'}px | Clipping violations: ${m.clippingViolations.length}`);

        if (errors.length > 0) {
          console.error(`      ❌ Violations:`, errors.join('; '));
          allViolations.push(...errors.map(e => `M3L [${stateDef.id} @ ${vp.label}]: ${e}`));
        }

        results.push({
          suite: 'M3L Two-Hand',
          state: stateDef.id,
          viewport: vp,
          metrics: m,
          screenshot: screenshotFile,
          passed: errors.length === 0,
          errors
        });
      }
    }

    // =========================================================================
    // Test Suite 2: Daily Practice across All 6 Viewports
    // =========================================================================
    console.log('\n--- 2. Testing Daily Practice across All 6 Viewports ---');
    await seedDatabase(cdp, { cards: synthetic.dailyCards, learningProgress: synthetic.profiles.allCompleted }, {
      ...baseSettings, sessionPreset: 'normal'
    });
    await openPractice(cdp);
    await waitFor(cdp, `Boolean(document.querySelector('.challenge'))`, 'Daily practice challenge mounted');

    for (const vp of VIEWPORTS) {
      await setViewport(cdp, vp.width, vp.height);
      const contextName = `daily-practice-${vp.name}`;
      const { metrics: m, errors } = await evaluateContract(cdp, { name: contextName });

      const isRepresentative = (vp.width === 1792 || vp.width === 1024);
      let screenshotFile = null;
      if (isRepresentative) {
        screenshotFile = `${contextName}.png`;
        await captureScreenshot(cdp, screenshotFile);
      }

      const statusLabel = errors.length === 0 ? 'PASS ✓' : 'FAIL ❌';
      console.log(`    [${statusLabel}] ${vp.label} | Scroll: ${m.docW}x${m.docH} | Clipping violations: ${m.clippingViolations.length}`);

      if (errors.length > 0) {
        console.error(`      ❌ Violations:`, errors.join('; '));
        allViolations.push(...errors.map(e => `Daily Practice [${vp.label}]: ${e}`));
      }

      results.push({
        suite: 'Daily Practice',
        state: 'question-review',
        viewport: vp,
        metrics: m,
        screenshot: screenshotFile,
        passed: errors.length === 0,
        errors
      });
    }

    // =========================================================================
    // Test Suite 3: Cold Test across All 6 Viewports
    // =========================================================================
    console.log('\n--- 3. Testing Cold Test across All 6 Viewports ---');
    await seedDatabase(cdp, { cards: synthetic.coldCards, learningProgress: synthetic.profiles.allCompleted }, {
      ...baseSettings, sessionPreset: 'cold'
    });
    await openPractice(cdp);
    await waitFor(cdp, `Boolean(document.querySelector('.challenge'))`, 'Cold test challenge mounted');

    for (const vp of VIEWPORTS) {
      await setViewport(cdp, vp.width, vp.height);
      const contextName = `cold-test-${vp.name}`;
      const { metrics: m, errors } = await evaluateContract(cdp, { name: contextName });

      const isRepresentative = (vp.width === 1792 || vp.width === 1024);
      let screenshotFile = null;
      if (isRepresentative) {
        screenshotFile = `${contextName}.png`;
        await captureScreenshot(cdp, screenshotFile);
      }

      const statusLabel = errors.length === 0 ? 'PASS ✓' : 'FAIL ❌';
      console.log(`    [${statusLabel}] ${vp.label} | Scroll: ${m.docW}x${m.docH} | Clipping violations: ${m.clippingViolations.length}`);

      if (errors.length > 0) {
        console.error(`      ❌ Violations:`, errors.join('; '));
        allViolations.push(...errors.map(e => `Cold Test [${vp.label}]: ${e}`));
      }

      results.push({
        suite: 'Cold Test',
        state: 'cold-item-1',
        viewport: vp,
        metrics: m,
        screenshot: screenshotFile,
        passed: errors.length === 0,
        errors
      });
    }

    // =========================================================================
    // Test Suite 4: Representative Curriculum Modules across All 6 Viewports
    // =========================================================================
    console.log('\n--- 4. Testing Representative Curriculum Modules across All 6 Viewports ---');

    // 4A. First Run C/F
    console.log('\n  >> 4A. First Run C/F (FirstRunStage)');
    await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.firstRunCf });
    await openPractice(cdp);
    await waitFor(cdp, `Boolean(document.querySelector('.first-run-stage'))`, 'First-run stage mounted');

    for (const vp of VIEWPORTS) {
      await setViewport(cdp, vp.width, vp.height);
      const contextName = `curriculum-first-run-${vp.name}`;
      const { metrics: m, errors } = await evaluateContract(cdp, { name: contextName });

      const isRepresentative = (vp.width === 1792 || vp.width === 1024);
      let screenshotFile = null;
      if (isRepresentative) {
        screenshotFile = `${contextName}.png`;
        await captureScreenshot(cdp, screenshotFile);
      }

      const statusLabel = errors.length === 0 ? 'PASS ✓' : 'FAIL ❌';
      console.log(`    [${statusLabel}] ${vp.label} | Scroll: ${m.docW}x${m.docH} | Clipping violations: ${m.clippingViolations.length}`);

      if (errors.length > 0) {
        console.error(`      ❌ Violations:`, errors.join('; '));
        allViolations.push(...errors.map(e => `First Run C/F [${vp.label}]: ${e}`));
      }

      results.push({
        suite: 'Curriculum First Run C/F',
        state: 'orientation-c-model',
        viewport: vp,
        metrics: m,
        screenshot: screenshotFile,
        passed: errors.length === 0,
        errors
      });
    }

    // 4B. Harmony Stage (Milestone 3D)
    console.log('\n  >> 4B. Harmony Stage (HarmonyStage / Milestone 3D)');
    await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.allCompleted });
    await startHarmonyModule(cdp);

    for (const vp of VIEWPORTS) {
      await setViewport(cdp, vp.width, vp.height);
      const contextName = `curriculum-harmony-${vp.name}`;
      const { metrics: m, errors } = await evaluateContract(cdp, { name: contextName });

      const isRepresentative = (vp.width === 1792 || vp.width === 1024);
      let screenshotFile = null;
      if (isRepresentative) {
        screenshotFile = `${contextName}.png`;
        await captureScreenshot(cdp, screenshotFile);
      }

      const statusLabel = errors.length === 0 ? 'PASS ✓' : 'FAIL ❌';
      console.log(`    [${statusLabel}] ${vp.label} | Scroll: ${m.docW}x${m.docH} | Clipping violations: ${m.clippingViolations.length}`);

      if (errors.length > 0) {
        console.error(`      ❌ Violations:`, errors.join('; '));
        allViolations.push(...errors.map(e => `Harmony Stage [${vp.label}]: ${e}`));
      }

      results.push({
        suite: 'Curriculum Harmony',
        state: 'harmony-progression',
        viewport: vp,
        metrics: m,
        screenshot: screenshotFile,
        passed: errors.length === 0,
        errors
      });
    }

    // 4C. Chord Rhythm Stage (Milestone 3K)
    console.log('\n  >> 4C. Chord Rhythm Stage (ChordRhythmStage / Milestone 3K)');
    await seedDatabase(cdp, { cards: synthetic.cards, learningProgress: synthetic.profiles.chordRhythmChangeOnBeatOne });
    await startChordRhythmModule(cdp);

    for (const vp of VIEWPORTS) {
      await setViewport(cdp, vp.width, vp.height);
      const contextName = `curriculum-chord-rhythm-${vp.name}`;
      const { metrics: m, errors } = await evaluateContract(cdp, { name: contextName });

      const isRepresentative = (vp.width === 1792 || vp.width === 1024);
      let screenshotFile = null;
      if (isRepresentative) {
        screenshotFile = `${contextName}.png`;
        await captureScreenshot(cdp, screenshotFile);
      }

      const statusLabel = errors.length === 0 ? 'PASS ✓' : 'FAIL ❌';
      console.log(`    [${statusLabel}] ${vp.label} | Scroll: ${m.docW}x${m.docH} | Clearance: ${m.buttonClearancePx ?? 'N/A'}px | Clipping violations: ${m.clippingViolations.length}`);

      if (errors.length > 0) {
        console.error(`      ❌ Violations:`, errors.join('; '));
        allViolations.push(...errors.map(e => `Chord Rhythm [${vp.label}]: ${e}`));
      }

      results.push({
        suite: 'Curriculum Chord Rhythm',
        state: 'change-on-beat-one',
        viewport: vp,
        metrics: m,
        screenshot: screenshotFile,
        passed: errors.length === 0,
        errors
      });
    }

    // =========================================================================
    // Test Suite 5: SessionStrip Long Primary Titles across 1024, 1280, 1440, 1792 px
    // =========================================================================
    console.log('\n--- 5. Testing Long Session Titles in Desktop Practice Layout across 1024, 1280, 1440, 1792 px ---');
    const LONG_TITLE_VIEWPORTS = VIEWPORTS.filter(vp => [1024, 1280, 1440, 1792].includes(vp.width));
    const longSessionTitle = 'Ежедневная тренировка: Закрепление устойчивости FSRS и двуручная координация';

    for (const vp of LONG_TITLE_VIEWPORTS) {
      await setViewport(cdp, vp.width, vp.height);

      // Inject representative long session title
      await cdp.evaluate(`(() => {
        const titleEl = document.querySelector('.session-strip .session-meta b');
        if (titleEl) {
          titleEl.textContent = ${JSON.stringify(longSessionTitle)};
        }
      })()`);
      await delay(100);

      const contextName = `long-title-${vp.name}`;
      const { metrics: m, errors } = await evaluateContract(cdp, { name: contextName });

      // Explicit assertion on .session-strip .session-meta b
      const titleAudit = await cdp.evaluate(`(() => {
        const el = document.querySelector('.session-strip .session-meta b');
        if (!el) return { found: false };
        const cs = window.getComputedStyle(el);
        return {
          found: true,
          text: el.innerText.trim(),
          whiteSpace: cs.whiteSpace,
          textOverflow: cs.textOverflow,
          overflowX: cs.overflowX,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          hasEllipsis: cs.textOverflow === 'ellipsis',
          hasNowrap: cs.whiteSpace === 'nowrap',
          hasOverflowHidden: cs.overflowX === 'hidden'
        };
      })()`);

      if (!titleAudit.found) {
        errors.push('Element .session-strip .session-meta b was not found in the DOM');
      } else {
        if (titleAudit.hasEllipsis) {
          errors.push('Session title b has forced text-overflow: ellipsis');
        }
        if (titleAudit.hasNowrap) {
          errors.push('Session title b has forced white-space: nowrap');
        }
        if (titleAudit.hasOverflowHidden) {
          errors.push('Session title b has forced overflow: hidden');
        }
        if (titleAudit.scrollWidth > titleAudit.clientWidth + 1.5) {
          errors.push(`Session title b is clipped: scrollWidth=${titleAudit.scrollWidth} > clientWidth=${titleAudit.clientWidth}`);
        }
      }

      const isRepresentative = (vp.width === 1792 || vp.width === 1024);
      let screenshotFile = null;
      if (isRepresentative) {
        screenshotFile = `${contextName}.png`;
        await captureScreenshot(cdp, screenshotFile);
      }

      const statusLabel = errors.length === 0 ? 'PASS ✓' : 'FAIL ❌';
      console.log(`    [${statusLabel}] ${vp.label} | Scroll: ${m.docW}x${m.docH} | Long title fully readable | Clipping violations: ${m.clippingViolations.length}`);

      if (errors.length > 0) {
        console.error(`      ❌ Violations:`, errors.join('; '));
        allViolations.push(...errors.map(e => `Long Title [${vp.label}]: ${e}`));
      }

      results.push({
        suite: 'SessionStrip Long Title',
        state: 'long-title',
        viewport: vp,
        metrics: m,
        titleAudit,
        screenshot: screenshotFile,
        passed: errors.length === 0,
        errors
      });
    }

    assert(allViolations.length === 0, `Layout contract violations detected (${allViolations.length}):\n  ` + allViolations.join('\n  '));

    // =========================================================================
    // Write Summary Report
    // =========================================================================
    const summary = {
      timestamp: new Date().toISOString(),
      rule: 'Global Training Layout Contract (P1)',
      status: 'ALL_PASSED',
      viewportsTested: VIEWPORTS.length,
      totalTestCases: results.length,
      viewports: VIEWPORTS,
      suitesCovered: [
        'M3L Two-Hand Accompaniment (idle, count-in, playing, feedback, corrective, assessment across 6 viewports = 36 test cases)',
        'Daily Practice (question review across 6 viewports = 6 test cases)',
        'Cold Test (first item across 6 viewports = 6 test cases)',
        'Curriculum First Run C/F (FirstRunStage across 6 viewports = 6 test cases)',
        'Curriculum Harmony (Milestone 3D across 6 viewports = 6 test cases)',
        'Curriculum Chord Rhythm (Milestone 3K across 6 viewports = 6 test cases)',
        'SessionStrip Long Title (fully readable long titles across 1024, 1280, 1440, 1792 viewports = 4 test cases)'
      ],
      assertionsVerified: [
        '0px horizontal document scrollbar across all viewports and states',
        '0px vertical document scrollbar across all viewports and states',
        '0px stage-center internal scroll overflow across all viewports and states',
        'Zero direct horizontal text clipping (scrollWidth <= clientWidth + 1.5px)',
        'Zero direct vertical text clipping (scrollHeight <= clientHeight + 1.5px)',
        'Zero ancestor clipping (no clipping by any ancestor with overflow:hidden)',
        'Zero keyboard dock occlusion (all interactive content, feedback, instructions, and actions strictly above piano dock)',
        'Positive clearance maintained between primary actions and bottom piano dock',
        'Fixed four-octave keyboard dock fits completely within viewport across all viewports and states',
        'Zero forced nowrap/overflow:hidden/ellipsis on primary session title (.session-strip .session-meta b)',
        'Controlled test isolation: window.__m3lDebug is not openly available in normal sessions'
      ],
      results
    };

    await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`\n======================================================================`);
    console.log(` ALL ${results.length} LAYOUT CONTRACT TEST CASES PASSED!`);
    console.log(` Summary written to: ${summaryPath}`);
    console.log(` Screenshots written to: ${screenshotDir}`);
    console.log(`======================================================================\n`);

  } finally {
    if (cdp?.socket) {
      try { cdp.socket.close(); } catch {}
    }
    if (chromeProcess) {
      try { chromeProcess.kill('SIGKILL'); } catch {}
    }
    if (prodPreviewProcess) {
      try { prodPreviewProcess.kill(); } catch {}
    }
    if (testPreviewProcess) {
      try { testPreviewProcess.kill(); } catch {}
    }
    if (tempProfileDir) {
      await rm(tempProfileDir, { recursive: true, force: true }).catch(() => {});
    }
    await rm(testDist, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(err => {
  console.error('\n❌ Layout contract verification failed:');
  console.error(err);
  process.exit(1);
});
