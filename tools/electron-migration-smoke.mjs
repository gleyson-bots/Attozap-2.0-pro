const endpoint = process.argv[2] || 'http://127.0.0.1:9224';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForTarget() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`${endpoint}/json`).then(response => response.json());
      const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && String(item.url || '').startsWith('file:'));
      if (target) return target;
    } catch {}
    await sleep(400);
  }
  throw new Error('Packaged Electron page target not found after migration reboot');
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
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20_000);
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

async function evaluate(socket, expression) {
  const result = await command(socket, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed');
  return result.result.value;
}

const target = await waitForTarget();
const socket = await connect(target.webSocketDebuggerUrl);
try {
  const result = await evaluate(socket, `(async () => {
    const fail = message => { throw new Error(message); };
    const body = (document.body?.innerText || '').trim();
    if (!body) fail('Renderer is blank after legacy-secret migration reboot');
    if (!body.includes('Ative sua licença para começar')) fail('License gate did not render after migration reboot');
    if (body.includes('RENDERER_LOAD_FAILED')) fail('Renderer load recovery page was shown after migration reboot');
    const available = await window.attozap.secure.available();
    const plain = await window.attozap.settings.get('ai_xai_key');
    const secure = await window.attozap.secure.get('ai_xai_key');
    if (available) {
      if (plain) fail('Legacy plaintext AI key was not removed after successful secure migration');
      if (secure !== 'xai-smoke-legacy-secret-rc7') fail('Secure AI key did not survive migration');
    } else {
      if (plain !== 'xai-smoke-legacy-secret-rc7') fail('Legacy key should remain untouched when OS secure storage is unavailable');
    }
    return { rendered: true, secureStorage: available, plaintextRemoved: available ? !plain : false, secretReadable: available ? secure === 'xai-smoke-legacy-secret-rc7' : false };
  })()`);
  console.log('Legacy migration reboot smoke passed:', JSON.stringify(result, null, 2));
} finally {
  socket.close();
}
