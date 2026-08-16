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
function connect(url) { return new Promise((resolve, reject) => { const socket = new WebSocket(url); socket.addEventListener('open', () => resolve(socket), { once: true }); socket.addEventListener('error', () => reject(new Error('Could not connect to Electron DevTools WebSocket')), { once: true }); }); }
let nextId = 1;
function command(socket, method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20_000);
    const onMessage = event => { const message = JSON.parse(String(event.data)); if (message.id !== id) return; clearTimeout(timeout); socket.removeEventListener('message', onMessage); if (message.error) reject(new Error(`${method}: ${message.error.message}`)); else resolve(message.result); };
    socket.addEventListener('message', onMessage); socket.send(JSON.stringify({ id, method, params }));
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
    await sleep(300);
    const body = document.body.textContent || '';
    if (!body.includes('Ative sua licença para começar')) fail('License-first startup gate missing');
    if (document.querySelector('.app-shell')) fail('Dashboard/app shell rendered before valid license');

    const licenseStatus = await window.attozap.license.status();
    if (licenseStatus.valid) fail('Fresh packaged smoke environment unexpectedly has a valid license');
    const fingerprint = document.querySelector('.fingerprint-box code')?.textContent?.trim();
    if (!fingerprint || fingerprint.length < 32) fail('Fingerprint missing from startup license gate');

    const requiredBridges = [
      ['webchat.sendPoll', window.attozap.webchat?.sendPoll],
      ['browser.openPortal', window.attozap.browser?.openPortal],
      ['recruiting.jobs', window.attozap.recruiting?.jobs],
      ['warmup.create', window.attozap.warmup?.create],
      ['files.saveText', window.attozap.files?.saveText],
      ['diagnostics.reportRendererError', window.attozap.diagnostics?.reportRendererError],
      ['diagnostics.resetUi', window.attozap.diagnostics?.resetUi],
    ];
    for (const [name, fn] of requiredBridges) if (typeof fn !== 'function') fail('Missing bridge: ' + name);

    const numbers = await window.attozap.tools.generateNumbers({ countryCode: '55', prefix: '11', start: 1, end: 100, width: 8 });
    if (!Array.isArray(numbers) || numbers.length !== 100) fail('Number generator contract failed');

    const template = await window.attozap.templates.create({ name: 'Smoke RC7', category: 'test', body: 'Olá {name}' });
    if (!template?.id) fail('Template create failed');
    await window.attozap.templates.remove(template.id);

    await window.attozap.contacts.import([{ phone: '5511999999999', name: 'Smoke Contact' }]);
    const contacts = await window.attozap.contacts.list('Smoke Contact');
    if (!contacts.some(item => item.name === 'Smoke Contact')) fail('Contact import/read failed');

    const job = await window.attozap.recruiting.saveJob({ title: 'Vaga Smoke', company: 'ATTOZAP', location: 'Remoto', description: 'Teste' });
    if (!job?.id) fail('Recruiting job CRUD failed');
    const candidate = await window.attozap.recruiting.saveCandidate({ jobId: job.id, name: 'Candidate Smoke', source: 'test' });
    if (!candidate?.id) fail('Recruiting candidate CRUD failed');
    await window.attozap.recruiting.removeCandidate(candidate.id);
    await window.attozap.recruiting.removeJob(job.id);

    const portals = await window.attozap.browser.portals();
    if (!Array.isArray(portals) || !portals.some(item => item.id === 'maps') || !portals.some(item => item.id === 'linkedin')) fail('Browser portal registry failed');

    let protectedBlocked = false;
    try { await window.attozap.accounts.create('Should Not Exist'); }
    catch (error) { protectedBlocked = /licen[cç]a/i.test(String(error?.message || error)); }
    if (!protectedBlocked) fail('Protected WhatsApp operation was not blocked without license');

    const contracts = {
      accounts: await window.attozap.accounts.list(), campaigns: await window.attozap.campaigns.list(),
      contacts: await window.attozap.contacts.list(), templates: await window.attozap.templates.list(),
      polls: await window.attozap.polls.list(), autoReply: await window.attozap.autoReply.list(),
      warmup: await window.attozap.warmup.list(), audit: await window.attozap.audit.list(), recruiting: await window.attozap.recruiting.jobs(),
    };

    // Seed the exact legacy state that previously was not covered by the clean
    // Windows runner. The next packaged boot must migrate these values without
    // preventing index.html from loading.
    const legacySecret = 'xai-smoke-legacy-secret-rc7';
    await window.attozap.settings.set('ai_xai_key', legacySecret);
    const legacyReadback = await window.attozap.settings.get('ai_xai_key');
    if (legacyReadback !== legacySecret) fail('Could not seed legacy plaintext secret for reboot regression');

    return { licenseGate: true, licenseValid: false, fingerprintLength: fingerprint.length, appLockedBeforeLicense: true, protectedBlocked, generatedNumbers: numbers.length, localCrud: true, browserPortals: portals.length, bridges: requiredBridges.length, readContracts: Object.keys(contracts).length, legacySecretSeeded: true };
  })()`);
  console.log('Packaged RC7 interaction smoke passed:', JSON.stringify(result, null, 2));
} finally { socket.close(); }
