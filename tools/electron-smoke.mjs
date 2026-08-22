import { writeFileSync } from 'node:fs';

const endpoint = process.argv[2] || 'http://127.0.0.1:9223';
const screenshotPath = process.argv[3] || 'release/smoke.png';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForTarget() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`${endpoint}/json`).then(response => {
        if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
        return response.json();
      });
      const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw lastError ?? new Error('Electron renderer did not expose a DevTools page');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to Electron DevTools WebSocket')), { once: true });
  });
}

let nextId = 1;
function command(socket, method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15_000);
    const onMessage = event => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function readRendererState(socket) {
  const evaluated = await command(socket, 'Runtime.evaluate', {
    expression: `JSON.stringify({
      href: location.href,
      readyState: document.readyState,
      title: document.title,
      text: (document.body?.innerText || '').slice(0, 3000),
      rootChildren: document.getElementById('root')?.childElementCount || 0,
      hasBridge: typeof window.attozap === 'object' && typeof window.attozap.app?.version === 'function'
    })`,
    returnByValue: true,
  });
  return JSON.parse(evaluated.result.value);
}

async function waitForRenderedApp(socket) {
  const deadline = Date.now() + 30_000;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await readRendererState(socket);
    const isAppPage = String(lastState.href || '').startsWith('file:');
    const rendered = lastState.readyState === 'complete' && lastState.hasBridge && lastState.rootChildren > 0 && String(lastState.text || '').trim();
    if (isAppPage && rendered) return lastState;
    await sleep(500);
  }
  throw new Error(`Packaged renderer did not become ready. Last state: ${JSON.stringify(lastState)}`);
}

const target = await waitForTarget();
const socket = await connect(target.webSocketDebuggerUrl);

try {
  const state = await waitForRenderedApp(socket);
  console.log('Renderer smoke state:', JSON.stringify(state, null, 2));

  if (!state.hasBridge) throw new Error('Electron contextBridge is missing in packaged renderer');
  if (!state.rootChildren) throw new Error('React root did not render any child');
  if (!state.text.trim()) throw new Error('Renderer loaded but visible UI text is empty');
  if (state.text.includes('PRELOAD_BRIDGE_MISSING')) throw new Error('Renderer displayed PRELOAD_BRIDGE_MISSING');

  await command(socket, 'Page.enable');
  const screenshot = await command(socket, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`Packaged Electron smoke test passed. Screenshot: ${screenshotPath}`);
} finally {
  socket.close();
}
