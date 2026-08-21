const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const PLAN_LIMITS = {
  plus: { maxSeats: 1, maxInstances: 1, dailyOutbound: 250, campaignRecipients: 1000, campaignStartsDaily: 2, warmupProfiles: 1, warmupDaily: 40, aiDaily: 50 },
  pro: { maxSeats: 3, maxInstances: 3, dailyOutbound: 1500, campaignRecipients: 10000, campaignStartsDaily: 10, warmupProfiles: 3, warmupDaily: 150, aiDaily: 300 },
  ultra: { maxSeats: 10, maxInstances: 10, dailyOutbound: 5000, campaignRecipients: 50000, campaignStartsDaily: 30, warmupProfiles: 10, warmupDaily: 500, aiDaily: 1000 },
  enterprise: { maxSeats: null, maxInstances: null, dailyOutbound: null, campaignRecipients: null, campaignStartsDaily: null, warmupProfiles: null, warmupDaily: null, aiDaily: null },
};

const LEGACY_PLAN_MAP = { solo: 'plus', solo_plus: 'plus', solo_pro: 'pro', team: 'pro', team_plus: 'pro', team_pro: 'ultra' };

function canonicalize(payload) {
  return JSON.stringify({
    licenseId: payload.licenseId,
    customerId: payload.customerId,
    customerName: payload.customerName,
    plan: payload.plan,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    maxSeats: payload.maxSeats,
    maxInstances: payload.maxInstances,
    features: [...payload.features].sort(),
    ...(payload.limits ? { limits: {
      maxSeats: payload.limits.maxSeats,
      maxInstances: payload.limits.maxInstances,
      dailyOutbound: payload.limits.dailyOutbound,
      campaignRecipients: payload.limits.campaignRecipients,
      campaignStartsDaily: payload.limits.campaignStartsDaily,
      warmupProfiles: payload.limits.warmupProfiles,
      warmupDaily: payload.limits.warmupDaily,
      aiDaily: payload.limits.aiDaily,
    } } : {}),
    fingerprint: payload.fingerprint ?? null,
    ...(payload.billingMode ? { billingMode: payload.billingMode } : {}),
    ...(payload.initialSubscriptionDays ? { initialSubscriptionDays: payload.initialSubscriptionDays } : {}),
    version: payload.version,
  });
}

function canonicalizeRenewal(payload) {
  return JSON.stringify({
    kind: payload.kind,
    renewalId: payload.renewalId,
    licenseId: payload.licenseId,
    customerId: payload.customerId,
    plan: payload.plan,
    issuedAt: payload.issuedAt,
    days: payload.days,
    fingerprint: payload.fingerprint ?? null,
    version: payload.version,
  });
}

function normalizePlan(value) {
  const plan = String(value ?? '').trim().toLowerCase();
  return PLAN_LIMITS[plan] ? plan : LEGACY_PLAN_MAP[plan] || null;
}

const REGISTRY_VERSION = 1;

function registryFile() {
  return path.join(app.getPath('userData'), 'attozap-license-registry.json');
}

function emptyRegistry() {
  return { version: REGISTRY_VERSION, licenses: [] };
}

function loadRegistry() {
  const file = registryFile();
  if (!existsSync(file)) return emptyRegistry();
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || !Array.isArray(parsed.licenses)) throw new Error('INVALID_REGISTRY');
    return { version: REGISTRY_VERSION, licenses: parsed.licenses.filter(item => item && typeof item.licenseId === 'string') };
  } catch {
    try { renameSync(file, `${file}.corrompido-${Date.now()}`); } catch { /* preserva o ficheiro original se não puder renomear */ }
    return emptyRegistry();
  }
}

function saveRegistry(registry) {
  const file = registryFile();
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify({ version: REGISTRY_VERSION, licenses: registry.licenses }, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, file);
}

function recordLicense(payload) {
  const registry = loadRegistry();
  const record = {
    licenseId: payload.licenseId,
    customerId: payload.customerId,
    customerName: payload.customerName,
    plan: payload.plan,
    billingMode: payload.billingMode,
    fingerprint: payload.fingerprint ?? null,
    expiresAt: payload.expiresAt ?? null,
    initialSubscriptionDays: payload.initialSubscriptionDays ?? null,
    issuedAt: payload.issuedAt,
    renewals: [],
  };
  const index = registry.licenses.findIndex(item => item.licenseId === payload.licenseId);
  if (index >= 0) registry.licenses[index] = { ...registry.licenses[index], ...record, renewals: registry.licenses[index].renewals ?? [] };
  else registry.licenses.unshift(record);
  saveRegistry(registry);
}

function recordRenewal(payload) {
  const registry = loadRegistry();
  let record = registry.licenses.find(item => item.licenseId === payload.licenseId);
  if (!record) {
    record = {
      licenseId: payload.licenseId,
      customerId: payload.customerId,
      customerName: 'Cliente recuperado manualmente',
      plan: payload.plan,
      billingMode: 'subscription',
      fingerprint: payload.fingerprint ?? null,
      expiresAt: null,
      initialSubscriptionDays: null,
      issuedAt: payload.issuedAt,
      renewals: [],
    };
    registry.licenses.unshift(record);
  }
  const renewal = { renewalId: payload.renewalId, issuedAt: payload.issuedAt, days: payload.days };
  record.renewals = [...(record.renewals ?? []).filter(item => item.renewalId !== renewal.renewalId), renewal];
  saveRegistry(registry);
}

function embeddedPublicKey() {
  const candidates = [
    path.join(process.resourcesPath, 'license-public.pem'),
    path.join(__dirname, '..', 'resources', 'license-public.pem'),
    path.join(__dirname, 'license-public.pem'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
  }
  throw new Error('Chave pública do aplicativo não encontrada neste KeyGen. Reinstale o pacote oficial.');
}

function signingPrivateKey(privatePem) {
  const privateKey = createPrivateKey(privatePem);
  const expectedPublic = createPublicKey(embeddedPublicKey()).export({ type: 'spki', format: 'der' });
  const actualPublic = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  if (!actualPublic.equals(expectedPublic)) {
    throw new Error('A chave privada selecionada não corresponde à chave pública deste ATTOZAP. Se gerou um novo par, o app precisa ser recompilado com o novo license-public.pem.');
  }
  return privateKey;
}

function loadSigningPrivateKey(inputValue) {
  const raw = String(inputValue ?? '').trim();
  if (!raw) throw new Error('Selecione um ficheiro de chave privada PEM antes de emitir.');

  let pem = raw;
  if (!raw.includes('-----BEGIN')) {
    if (!existsSync(raw)) throw new Error('O caminho da chave privada não existe ou não está acessível. Selecione novamente o ficheiro .pem.');
    try {
      pem = readFileSync(raw, 'utf8');
    } catch {
      throw new Error('Não foi possível ler o ficheiro da chave privada. Verifique as permissões e selecione-o novamente.');
    }
  }

  pem = String(pem).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!pem) throw new Error('O ficheiro da chave privada está vazio.');
  if (/-----BEGIN (?:PUBLIC KEY|CERTIFICATE)-----/.test(pem)) {
    throw new Error('Foi selecionada uma chave pública/certificado. No campo “Chave privada PEM”, selecione o ficheiro que começa por -----BEGIN PRIVATE KEY-----.');
  }
  if (!/-----BEGIN (?:PRIVATE KEY|ENCRYPTED PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY)-----/.test(pem) || !/-----END (?:PRIVATE KEY|ENCRYPTED PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY)-----/.test(pem)) {
    throw new Error('O ficheiro selecionado não contém um PEM de chave privada válido. Ele deve começar por -----BEGIN PRIVATE KEY----- e terminar por -----END PRIVATE KEY-----.');
  }

  try {
    return signingPrivateKey(pem);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/bad decrypt|bad password|bad password read|pkcs8|passphrase/i.test(message)) {
      throw new Error('A chave privada está protegida por palavra-passe ou está num formato não suportado pelo KeyGen. Use uma chave Ed25519 PKCS#8 PEM sem palavra-passe.');
    }
    if (/unsupported|no start line|header too long|bad base64|decoder routines/i.test(message)) {
      throw new Error('O PEM da chave privada não pôde ser lido. Confirme que selecionou uma chave Ed25519 privada completa, não a chave pública.');
    }
    throw error;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#0b0f17',
    autoHideMenuBar: true,
    title: 'ATTOZAP KeyGen',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('keys:generate', async () => {
    const selected = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const dir = selected.filePaths[0];
    const pair = generateKeyPairSync('ed25519');
    const privatePath = path.join(dir, 'attozap-license.private.pem');
    const publicPath = path.join(dir, 'attozap-license.public.pem');
    writeFileSync(privatePath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    writeFileSync(publicPath, pair.publicKey.export({ type: 'spki', format: 'pem' }));
    return { privatePath, publicPath };
  });

  ipcMain.handle('keys:select-private', async () => {
    const selected = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Private key PEM', extensions: ['pem'] }] });
    return selected.canceled ? null : selected.filePaths[0] ?? null;
  });

  ipcMain.handle('history:list', () => loadRegistry().licenses);

  ipcMain.handle('license:issue', async (_event, input) => {
    if (!input?.privateKeyPath) throw new Error('Selecione a chave privada.');
    if (!input.customerId?.trim()) throw new Error('Informe o ID do cliente.');
    if (!input.customerName?.trim()) throw new Error('Informe o nome do cliente.');
    const plan = normalizePlan(input.plan);
    if (!plan) throw new Error('Plano inválido. Escolha Plus, Pro, Ultra ou Enterprise.');

    const limits = { ...PLAN_LIMITS[plan], ...(input.limits || {}) };
    for (const key of Object.keys(limits)) {
      if (limits[key] != null && (!Number.isInteger(Number(limits[key])) || Number(limits[key]) < 1)) {
        throw new Error(`Limite inválido: ${key}`);
      }
      if (limits[key] != null) limits[key] = Number(limits[key]);
    }

    const billingMode = input.billingMode === 'perpetual' ? 'perpetual' : 'subscription';
    const initialSubscriptionDays = Number(input.initialSubscriptionDays ?? 30);
    if (billingMode === 'subscription' && (!Number.isInteger(initialSubscriptionDays) || initialSubscriptionDays < 1 || initialSubscriptionDays > 366)) {
      throw new Error('O período inicial deve ter entre 1 e 366 dias.');
    }

    let expiresAt = null;
    if (billingMode === 'perpetual' && input.expiresAt) {
      const date = new Date(input.expiresAt);
      if (Number.isNaN(date.getTime())) throw new Error('Data de expiração inválida.');
      expiresAt = date.toISOString();
    }

    const payload = {
      licenseId: `AZ-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      customerId: input.customerId.trim(),
      customerName: input.customerName.trim(),
      plan,
      issuedAt: new Date().toISOString(),
      expiresAt,
      maxSeats: limits.maxSeats,
      maxInstances: limits.maxInstances,
      limits,
      features: [...new Set((input.features ?? []).map(value => String(value).trim()).filter(Boolean))].sort(),
      fingerprint: input.fingerprint?.trim() || null,
      billingMode,
      ...(billingMode === 'subscription' ? { initialSubscriptionDays } : {}),
      version: 1,
    };

    const privateKey = loadSigningPrivateKey(input.privateKeyPath);
    const signature = sign(null, Buffer.from(canonicalize(payload)), privateKey).toString('base64url');
    const signed = { payload, signature, algorithm: 'Ed25519' };
    const encoded = Buffer.from(JSON.stringify(signed), 'utf8').toString('base64url');
    recordLicense(payload);
    return { payload, encoded };
  });

  ipcMain.handle('renewal:issue', async (_event, input) => {
    if (!input?.privateKeyPath) throw new Error('Selecione a chave privada.');
    if (!input.licenseId?.trim()) throw new Error('Informe o ID da licença.');
    if (!input.customerId?.trim()) throw new Error('Informe o ID do cliente.');
    const plan = normalizePlan(input.plan);
    if (!plan) throw new Error('Plano inválido. Escolha Plus, Pro, Ultra ou Enterprise.');
    const days = Number(input.days);
    if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error('A renovação deve ter entre 1 e 366 dias.');

    const payload = {
      kind: 'subscription_renewal',
      renewalId: `AZR-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      licenseId: input.licenseId.trim(),
      customerId: input.customerId.trim(),
      plan,
      issuedAt: new Date().toISOString(),
      days,
      fingerprint: input.fingerprint?.trim() || null,
      version: 1,
    };
    const privateKey = loadSigningPrivateKey(input.privateKeyPath);
    const signature = sign(null, Buffer.from(canonicalizeRenewal(payload)), privateKey).toString('base64url');
    const signed = { payload, signature, algorithm: 'Ed25519' };
    const encoded = Buffer.from(JSON.stringify(signed), 'utf8').toString('base64url');
    recordRenewal(payload);
    return { payload, encoded };
  });

  ipcMain.handle('license:save', async (_event, encoded, suggestedName) => {
    const selected = await dialog.showSaveDialog({
      defaultPath: suggestedName || 'attozap.license.txt',
      filters: [{ name: 'ATTOZAP License', extensions: ['txt', 'license'] }],
    });
    if (selected.canceled || !selected.filePath) return null;
    writeFileSync(selected.filePath, String(encoded).trim() + '\n', 'utf8');
    return selected.filePath;
  });

  ipcMain.handle('clipboard:copy', (_event, text) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
