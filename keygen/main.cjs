const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const { createPrivateKey, generateKeyPairSync, randomUUID, sign } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

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
    fingerprint: payload.fingerprint ?? null,
    version: payload.version,
  });
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

  ipcMain.handle('license:issue', async (_event, input) => {
    const allowedPlans = new Set(['solo', 'solo_plus', 'solo_pro', 'team', 'team_plus', 'team_pro', 'enterprise']);
    if (!input?.privateKeyPath) throw new Error('Selecione a chave privada.');
    if (!input.customerId?.trim()) throw new Error('Informe o ID do cliente.');
    if (!input.customerName?.trim()) throw new Error('Informe o nome do cliente.');
    if (!allowedPlans.has(input.plan)) throw new Error('Plano inválido.');

    const maxSeats = Number(input.maxSeats ?? 1);
    const maxInstances = Number(input.maxInstances ?? 1);
    if (!Number.isInteger(maxSeats) || maxSeats < 1) throw new Error('Max seats inválido.');
    if (!Number.isInteger(maxInstances) || maxInstances < 1) throw new Error('Max instances inválido.');

    let expiresAt = null;
    if (input.expiresAt) {
      const date = new Date(input.expiresAt);
      if (Number.isNaN(date.getTime())) throw new Error('Data de expiração inválida.');
      expiresAt = date.toISOString();
    }

    const payload = {
      licenseId: `AZ-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      customerId: input.customerId.trim(),
      customerName: input.customerName.trim(),
      plan: input.plan,
      issuedAt: new Date().toISOString(),
      expiresAt,
      maxSeats,
      maxInstances,
      features: [...new Set((input.features ?? []).map(value => String(value).trim()).filter(Boolean))].sort(),
      fingerprint: input.fingerprint?.trim() || null,
      version: 1,
    };

    const privatePem = readFileSync(input.privateKeyPath, 'utf8');
    const signature = sign(null, Buffer.from(canonicalize(payload)), createPrivateKey(privatePem)).toString('base64url');
    const signed = { payload, signature, algorithm: 'Ed25519' };
    const encoded = Buffer.from(JSON.stringify(signed), 'utf8').toString('base64url');
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
