import { writeFileSync } from 'node:fs';

const endpoint = process.argv[2] || 'http://127.0.0.1:9230';
const screenshotPath = process.argv[3] || 'release-keygen/keygen-smoke.png';
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
    } catch (error) { lastError = error; }
    await sleep(500);
  }
  throw lastError ?? new Error('KeyGen renderer did not expose a DevTools page');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to KeyGen DevTools WebSocket')), { once: true });
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

async function readState(socket) {
  const evaluated = await command(socket, 'Runtime.evaluate', {
    expression: `JSON.stringify({
      href: location.href,
      readyState: document.readyState,
      text: (document.body?.innerText || '').slice(0, 2500),
      hasBridge: typeof window.keygen === 'object' && typeof window.keygen.issueLicense === 'function'
    })`,
    returnByValue: true,
  });
  return JSON.parse(evaluated.result.value);
}

const target = await waitForTarget();
const socket = await connect(target.webSocketDebuggerUrl);
try {
  const deadline = Date.now() + 30_000;
  let current;
  while (Date.now() < deadline) {
    current = await readState(socket);
    if (current.readyState === 'complete' && current.hasBridge && String(current.text || '').trim()) break;
    await sleep(500);
  }
  if (!current?.hasBridge) throw new Error(`KeyGen preload bridge missing: ${JSON.stringify(current)}`);
  if (!String(current.text || '').includes('ATTOZAP')) throw new Error(`KeyGen UI did not render: ${JSON.stringify(current)}`);
  await command(socket, 'Page.enable');
  const screenshot = await command(socket, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`KeyGen smoke passed. Screenshot: ${screenshotPath}`);
} finally {
  socket.close();
}
