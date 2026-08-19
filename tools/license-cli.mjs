#!/usr/bin/env node
import { createPrivateKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function usage() {
  console.log(`ATTOZAP License Authority

Comandos:
  node tools/license-cli.mjs keys --out .secrets/attozap-license
  node tools/license-cli.mjs issue --private .secrets/attozap-license.private.pem \\
    --customer-id cliente-001 --customer-name "Cliente" --plan solo_pro \\
    --max-instances 3 --expires 2027-08-15 --features sender,groups,filter,autoreply

Opções de issue:
  --fingerprint <sha256>       Vincula a uma máquina específica
  --max-seats <n>              Padrão: 1
  --max-instances <n>          Padrão: 1
  --expires <ISO|never>        Padrão: never
  --features <csv>             Recursos liberados
  --out <arquivo>              Salva a licença codificada
`);
}

function args(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    values[key] = next && !next.startsWith('--') ? (i++, next) : 'true';
  }
  return values;
}

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

function ensureParent(file) {
  mkdirSync(dirname(resolve(file)), { recursive: true });
}

function generateKeys(options) {
  const prefix = options.out || '.secrets/attozap-license';
  const privateFile = `${prefix}.private.pem`;
  const publicFile = `${prefix}.public.pem`;
  ensureParent(privateFile);
  const pair = generateKeyPairSync('ed25519');
  writeFileSync(privateFile, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(publicFile, pair.publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`Chave privada: ${privateFile}`);
  console.log(`Chave pública:  ${publicFile}`);
  console.log('\nIMPORTANTE: nunca distribua a chave privada.');
}

function issue(options) {
  const required = ['private', 'customer-id', 'customer-name', 'plan'];
  for (const key of required) if (!options[key]) throw new Error(`Falta --${key}`);
  const allowedPlans = new Set(['solo', 'solo_plus', 'solo_pro', 'team', 'team_plus', 'team_pro', 'enterprise']);
  if (!allowedPlans.has(options.plan)) throw new Error(`Plano inválido: ${options.plan}`);

  const maxSeats = Number(options['max-seats'] ?? 1);
  const maxInstances = Number(options['max-instances'] ?? 1);
  if (!Number.isInteger(maxSeats) || maxSeats < 1) throw new Error('--max-seats deve ser inteiro >= 1');
  if (!Number.isInteger(maxInstances) || maxInstances < 1) throw new Error('--max-instances deve ser inteiro >= 1');

  let expiresAt = null;
  if (options.expires && options.expires !== 'never') {
    const date = new Date(options.expires);
    if (Number.isNaN(date.getTime())) throw new Error('--expires inválido');
    expiresAt = date.toISOString();
  }

  const payload = {
    licenseId: `AZ-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
    customerId: options['customer-id'],
    customerName: options['customer-name'],
    plan: options.plan,
    issuedAt: new Date().toISOString(),
    expiresAt,
    maxSeats,
    maxInstances,
    features: [...new Set(String(options.features ?? '').split(',').map(v => v.trim()).filter(Boolean))].sort(),
    fingerprint: options.fingerprint || null,
    version: 1,
  };

  const privatePem = readFileSync(options.private, 'utf8');
  const signature = sign(null, Buffer.from(canonicalize(payload)), createPrivateKey(privatePem)).toString('base64url');
  const signedLicense = { payload, signature, algorithm: 'Ed25519' };
  const encoded = Buffer.from(JSON.stringify(signedLicense), 'utf8').toString('base64url');

  if (options.out) {
    ensureParent(options.out);
    writeFileSync(options.out, encoded + '\n', { mode: 0o600 });
    console.log(`Licença salva em: ${options.out}`);
  }
  console.log('\nLICENÇA CODIFICADA:\n');
  console.log(encoded);
  console.log('\nRESUMO:\n');
  console.log(JSON.stringify(payload, null, 2));
}

try {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || ['help', '-h', '--help'].includes(command)) usage();
  else if (command === 'keys') generateKeys(args(rest));
  else if (command === 'issue') issue(args(rest));
  else throw new Error(`Comando desconhecido: ${command}`);
} catch (error) {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
