import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const projectDir = process.cwd();
const acceptanceDir = path.resolve(projectDir, 'acceptance', 'stabilization');
const screenshotsDir = path.join(acceptanceDir, 'screenshots');
const seed = JSON.parse(await readFile(path.join(acceptanceDir, 'stabilization-profile.seed.json'), 'utf8'));
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'piano-trainer-stabilization-'));
const browserProfileDir = path.join(tempRoot, 'chrome-profile');
const debugFile = path.join(browserProfileDir, 'DevToolsActivePort');
const appUrl = process.env.PIANO_TRAINER_APP_URL || 'http://127.0.0.1:5175/piano-key-trainer/';
const screenshotWidth = 1440;
const screenshotHeight = 1000;
const execFileAsync = promisify(execFile);
let chrome;
let socket;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForPortFile() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const lines = (await readFile(debugFile, 'utf8')).trim().split(/\r?\n/);
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
    target = targets.find(item => item.type === 'page' && item.url.startsWith(appUrl));
    if (target?.webSocketDebuggerUrl) break;
    await delay(250);
  }
  assert(target?.webSocketDebuggerUrl, 'Chrome did not open the trainer page.');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const runtimeExceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (!message.id) {
      if (message.method === 'Runtime.exceptionThrown') {
        runtimeExceptions.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
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
        const exception = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Page evaluation failed';
        throw new Error(exception);
      }
      return result.result?.value;
    },
    runtimeExceptions
  };
}

async function waitForPage(cdp, expression, description) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await cdp.evaluate(expression)) return;
    await delay(250);
  }
  const state = await cdp.evaluate(`JSON.stringify({
    url: location.href,
    readyState: document.readyState,
    title: document.title,
    bodyText: document.body?.innerText?.slice(0, 600),
    appMarkup: document.querySelector('#app')?.innerHTML?.slice(0, 600)
  })`);
  throw new Error(`Timed out waiting for ${description}. Page state: ${state}`);
}

async function saveScreenshot(cdp, filename) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  await writeFile(path.join(screenshotsDir, filename), Buffer.from(result.data, 'base64'));
}

try {
  await mkdir(screenshotsDir, { recursive: true });
  await readdir(path.dirname(chromePath));
  chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${browserProfileDir}`,
    `--window-size=${screenshotWidth},${screenshotHeight}`,
    appUrl
  ], { stdio: 'ignore', windowsHide: true });

  const port = await waitForPortFile();
  const cdp = await connectPage(port);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: screenshotWidth,
    height: screenshotHeight,
    deviceScaleFactor: 1,
    mobile: false
  });
  await waitForPage(cdp, 'document.querySelector(".topbar") !== null', 'the trainer application');

  const hasGlobalNextAction = await cdp.evaluate(`
    [...document.querySelectorAll('.hero-toolbar button')]
      .some(button => button.innerText.trim() === 'Следующее задание')
  `);
  assert(!hasGlobalNextAction, 'A global next-question action is still visible in the top navigation.');

  const seedExpression = `((data) => new Promise((resolve, reject) => {
    const request = indexedDB.open('PianoTrainerDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['cards', 'reviewLogs', 'learningProgress'], 'readwrite');
      for (const storeName of ['cards', 'reviewLogs', 'learningProgress']) {
        const store = transaction.objectStore(storeName);
        store.clear();
        for (const row of data[storeName]) store.put(row);
      }
      transaction.oncomplete = () => { db.close(); resolve('seeded'); };
      transaction.onerror = () => reject(new Error('IndexedDB transaction error: ' + (transaction.error?.name || 'unknown') + ' ' + (transaction.error?.message || '')));
      transaction.onabort = () => reject(new Error('IndexedDB transaction aborted: ' + (transaction.error?.name || 'unknown') + ' ' + (transaction.error?.message || '')));
    };
  }))(${JSON.stringify({
    cards: seed.cards,
    reviewLogs: seed.reviewLogs,
    learningProgress: seed.learningProgress
  })})`;
  assert(await cdp.evaluate(seedExpression) === 'seeded', 'Could not seed the isolated regression profile.');
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForPage(cdp, 'document.querySelector(".topbar") !== null', 'the reloaded trainer application');
  await delay(700);

  const clickNavigation = async label => {
    const expression = `(() => {
      const item = [...document.querySelectorAll('button,[role="menuitem"]')]
        .find(element => element.innerText.trim() === ${JSON.stringify(label)});
      if (!item) return false;
      item.click();
      return true;
    })()`;
    const clicked = await cdp.evaluate(expression);
    if (!clicked) {
      const state = await cdp.evaluate(`JSON.stringify({
        nav: [...document.querySelectorAll('.top-nav-btn,[role="menuitem"]')].map(item => item.innerText.trim()),
        body: document.body?.innerText?.slice(0, 500),
        errors: ${JSON.stringify(cdp.runtimeExceptions)}
      })`);
      throw new Error(`Could not find navigation item ${label}. Page state: ${state}`);
    }
  };

  await waitForPage(cdp, 'document.querySelectorAll(".top-nav-btn").length === 9', 'the main navigation');
  await clickNavigation('Программа');
  await waitForPage(cdp, 'document.querySelector("[data-page=\\\"curriculum\\\"]") !== null', 'the Program page');
  const programText = await cdp.evaluate('document.body.innerText');
  assert(programText.includes('Учебная программа'), `Program content is not visible: ${programText.slice(0, 500)}`);
  await saveScreenshot(cdp, '01-program-after-reload.png');

  await clickNavigation('Диагностика');
  await waitForPage(cdp, 'document.querySelector(".diagnostic-integrity-strip") !== null', 'the diagnostics integrity summary');
  const diagnosticsText = await cdp.evaluate('document.body.innerText');
  assert(diagnosticsText.includes('29 · 1 due · 1 просрочено'), 'Synthetic card total, due, and overdue counts are not visible.');
  assert(diagnosticsText.includes('4 навыка') && diagnosticsText.includes('всплеска'), 'Session and diversity evidence is not visible.');
  await saveScreenshot(cdp, '02-diagnostics-integrity.png');

  process.stdout.write(`Captured two sanitized UI screenshots in ${screenshotsDir}\n`);
} catch (error) {
  process.stderr.write(`Screenshot capture failed: ${error instanceof Error ? error.message : String(error)}\n`);
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
  if (resolvedTempRoot.startsWith(`${resolvedSystemTemp}${path.sep}`) && path.basename(resolvedTempRoot).startsWith('piano-trainer-stabilization-')) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await rm(resolvedTempRoot, { recursive: true, force: true });
        break;
      } catch {
        if (attempt === 4) throw new Error(`Could not remove isolated temporary browser profile ${resolvedTempRoot}.`);
        await delay(250);
      }
    }
  }
}
