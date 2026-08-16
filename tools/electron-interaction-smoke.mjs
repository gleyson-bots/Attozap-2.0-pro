const endpoint = process.argv[2] || 'http://127.0.0.1:9223';
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
  throw new Error('Packaged Electron page target not found');
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

async function evaluate(socket, expression, awaitPromise = true) {
  const result = await command(socket, 'Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed');
  return result.result.value;
}

const target = await waitForTarget();
const socket = await connect(target.webSocketDebuggerUrl);

try {
  const result = await evaluate(socket, `(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const fail = message => { throw new Error(message); };
    const navLabels = [
      'Visão geral','Contact Sender','Group Sender','Agendamentos','Templates','Poll Report',
      'Contas','Contatos & listas','Contact Grabber','Ferramentas de grupos','Bulk Group Tools',
      'Auto Reply','Number Filter','Extratores','Licença','Configurações'
    ];

    for (const label of navLabels) {
      const button = [...document.querySelectorAll('.nav-scroll button')].find(item => item.textContent?.includes(label));
      if (!button) fail('Navigation button missing: ' + label);
      button.click();
      await sleep(70);
      const title = document.querySelector('.topbar h1')?.textContent?.trim();
      if (title !== label) fail('Navigation did not switch to ' + label + '; got ' + title);
      const content = document.querySelector('.page-content')?.textContent?.trim();
      if (!content) fail('Empty page after navigation: ' + label);
    }

    const numberButton = [...document.querySelectorAll('.nav-scroll button')].find(item => item.textContent?.includes('Number Filter'));
    numberButton.click();
    await sleep(80);
    const generate = [...document.querySelectorAll('button')].find(item => item.textContent?.includes('Gerar lista'));
    if (!generate) fail('Number generator button missing');
    generate.click();
    await sleep(120);
    const generated = [...document.querySelectorAll('textarea')].find(item => item.value?.includes('55'));
    if (!generated || !generated.value.trim()) fail('Number generator button did not produce output');

    const accountsButton = [...document.querySelectorAll('.nav-scroll button')].find(item => item.textContent?.trim().startsWith('Contas'));
    accountsButton.click();
    await sleep(80);
    const accountInput = document.querySelector('input[placeholder="Ex.: Comercial 01"]');
    if (!accountInput) fail('Account name input missing');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(accountInput, 'Smoke Account');
    accountInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(20);
    const add = [...document.querySelectorAll('button')].find(item => item.textContent?.includes('Adicionar conta'));
    if (!add) fail('Add account button missing');
    add.click();
    await sleep(250);
    const licenseStatus = await window.attozap.license.status();
    if (!licenseStatus.valid) {
      const visibleError = document.querySelector('.notice.error')?.textContent || document.querySelector('.global-toast.error')?.textContent || '';
      if (!/licen[cç]a/i.test(visibleError)) fail('Unlicensed Add account did not show visible feedback: ' + visibleError);
    }

    const licenseButton = [...document.querySelectorAll('.nav-scroll button')].find(item => item.textContent?.includes('Licença'));
    licenseButton.click();
    await sleep(80);
    const fingerprint = [...document.querySelectorAll('.fingerprint-box code')][0]?.textContent?.trim();
    if (!fingerprint || fingerprint.length < 16) fail('License fingerprint was not rendered');

    const contracts = {
      accounts: await window.attozap.accounts.list(),
      campaigns: await window.attozap.campaigns.list(),
      contacts: await window.attozap.contacts.list(),
      templates: await window.attozap.templates.list(),
      polls: await window.attozap.polls.list(),
      autoReply: await window.attozap.autoReply.list(),
      audit: await window.attozap.audit.list(),
    };

    return {
      navCount: navLabels.length,
      generatedNumbers: generated.value.trim().split(/\\r?\\n/).length,
      licenseValid: Boolean(licenseStatus.valid),
      fingerprintLength: fingerprint.length,
      readContracts: Object.keys(contracts).length,
    };
  })()`);

  console.log('Packaged interaction smoke passed:', JSON.stringify(result, null, 2));
} finally {
  socket.close();
}
