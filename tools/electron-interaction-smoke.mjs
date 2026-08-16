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
    const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const areaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    const setValue = (element, value) => {
      const setter = element instanceof HTMLTextAreaElement ? areaSetter : inputSetter;
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const findButton = text => [...document.querySelectorAll('button')].find(item => item.textContent?.includes(text));
    const clickNav = async label => {
      const button = [...document.querySelectorAll('.nav-scroll button')].find(item => item.textContent?.includes(label));
      if (!button) fail('Navigation button missing: ' + label);
      button.click();
      await sleep(90);
      const title = document.querySelector('.topbar h1')?.textContent?.trim();
      if (title !== label) fail('Navigation did not switch to ' + label + '; got ' + title);
      const content = document.querySelector('.page-content')?.textContent?.trim();
      if (!content) fail('Empty page after navigation: ' + label);
    };

    const navLabels = [
      'Visão geral','Contact Sender','Group Sender','Agendamentos','Templates','Poll Report',
      'Contas','Contatos & listas','Contact Grabber','Ferramentas de grupos','Bulk Group Tools',
      'Auto Reply','Number Filter','Extratores','Licença','Configurações'
    ];
    for (const label of navLabels) await clickNav(label);

    await clickNav('Number Filter');
    const generate = findButton('Gerar lista');
    if (!generate) fail('Number generator button missing');
    generate.click();
    await sleep(140);
    const generated = [...document.querySelectorAll('textarea')].find(item => item.value?.includes('55'));
    if (!generated || !generated.value.trim()) fail('Number generator button did not produce output');

    await clickNav('Templates');
    const templateName = document.querySelector('input[placeholder="Boas-vindas"]');
    const templateBody = document.querySelector('textarea.tall-area');
    if (!templateName || !templateBody) fail('Template editor fields missing');
    setValue(templateName, 'Smoke Template');
    setValue(templateBody, 'Olá {name}, teste do portable.');
    const saveTemplate = findButton('Salvar');
    if (!saveTemplate) fail('Template Save button missing');
    saveTemplate.click();
    await sleep(220);
    if (!document.body.textContent?.includes('Template salvo.')) fail('Template Save did not show success');
    if (!document.body.textContent?.includes('Smoke Template')) fail('Saved template did not appear in list');
    const copyTemplate = findButton('Copiar');
    if (!copyTemplate) fail('Template Copy button missing');
    copyTemplate.click();
    await sleep(100);
    if (!document.body.textContent?.includes('Conteúdo copiado')) fail('Template Copy did not show success');
    const deleteTemplate = findButton('Excluir');
    if (!deleteTemplate) fail('Template Delete button missing after save');
    deleteTemplate.click();
    await sleep(180);
    if (!document.body.textContent?.includes('Template excluído.')) fail('Template Delete did not show success');

    await clickNav('Contatos & listas');
    const pasteList = findButton('Colar lista');
    if (!pasteList) fail('Paste contacts button missing');
    pasteList.click();
    await sleep(80);
    const contactArea = document.querySelector('.import-box textarea');
    if (!contactArea) fail('Contact import textarea missing');
    setValue(contactArea, '5511999999999;Smoke Contact;cidade=Teste');
    await sleep(80);
    const importContact = [...document.querySelectorAll('.import-box button')].find(item => item.textContent?.includes('Importar 1'));
    if (!importContact) fail('Contact Import button did not enable');
    importContact.click();
    await sleep(220);
    if (!document.body.textContent?.includes('Smoke Contact')) fail('Imported contact did not appear in list');
    const contactRow = [...document.querySelectorAll('.contacts-row')].find(row => row.textContent?.includes('Smoke Contact'));
    if (!contactRow) fail('Smoke contact row missing');
    const friendlyButton = [...contactRow.querySelectorAll('button')].find(item => item.textContent?.includes('Adicionar'));
    if (!friendlyButton) fail('Friendly List button missing');
    friendlyButton.click();
    await sleep(160);
    const refreshedContactRow = [...document.querySelectorAll('.contacts-row')].find(row => row.textContent?.includes('Smoke Contact'));
    if (!refreshedContactRow?.textContent?.includes('Na lista')) fail('Friendly List toggle did not update');
    const blockButton = [...refreshedContactRow.querySelectorAll('button')].find(item => item.textContent?.includes('Bloquear'));
    if (!blockButton) fail('Blocklist button missing');
    blockButton.click();
    await sleep(160);
    const blockedRow = [...document.querySelectorAll('.contacts-row')].find(row => row.textContent?.includes('Smoke Contact'));
    if (!blockedRow?.textContent?.includes('Bloqueado')) fail('Blocklist toggle did not update');

    await clickNav('Contas');
    const accountInput = document.querySelector('input[placeholder="Ex.: Comercial 01"]');
    if (!accountInput) fail('Account name input missing');
    setValue(accountInput, 'Smoke Account');
    await sleep(30);
    const add = findButton('Adicionar conta');
    if (!add) fail('Add account button missing');
    add.click();
    await sleep(260);
    const licenseStatus = await window.attozap.license.status();
    if (!licenseStatus.valid) {
      const visibleError = document.querySelector('.notice.error')?.textContent || document.querySelector('.global-toast.error')?.textContent || '';
      if (!/licen[cç]a/i.test(visibleError)) fail('Unlicensed Add account did not show visible feedback: ' + visibleError);
    }

    await clickNav('Licença');
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
      templateCrud: true,
      contactImport: true,
      friendlyToggle: true,
      blockToggle: true,
      licenseValid: Boolean(licenseStatus.valid),
      fingerprintLength: fingerprint.length,
      readContracts: Object.keys(contracts).length,
    };
  })()`);

  console.log('Packaged interaction smoke passed:', JSON.stringify(result, null, 2));
} finally {
  socket.close();
}
