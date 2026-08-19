#!/usr/bin/env node
import { createPrivateKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PLAN_LIMITS = {
  plus: { maxSeats: 1, maxInstances: 1, dailyOutbound: 250, campaignRecipients: 1000, campaignStartsDaily: 2, warmupProfiles: 1, warmupDaily: 40, aiDaily: 50 },
  pro: { maxSeats: 3, maxInstances: 3, dailyOutbound: 1500, campaignRecipients: 10000, campaignStartsDaily: 10, warmupProfiles: 3, warmupDaily: 150, aiDaily: 300 },
  ultra: { maxSeats: 10, maxInstances: 10, dailyOutbound: 5000, campaignRecipients: 50000, campaignStartsDaily: 30, warmupProfiles: 10, warmupDaily: 500, aiDaily: 1000 },
  enterprise: { maxSeats: null, maxInstances: null, dailyOutbound: null, campaignRecipients: null, campaignStartsDaily: null, warmupProfiles: null, warmupDaily: null, aiDaily: null },
};
const LEGACY_PLAN_MAP = { solo: 'plus', solo_plus: 'plus', solo_pro: 'pro', team: 'pro', team_plus: 'pro', team_pro: 'ultra' };

function usage() {
  console.log(`ATTOZAP License Authority

Comandos:
  node tools/license-cli.mjs keys --out .secrets/attozap-license
  node tools/license-cli.mjs issue --private .secrets/attozap-license.private.pem \\
    --customer-id cliente-001 --customer-name "Cliente" --plan pro \\
    --expires 2027-08-15 --features webchat,sender,campaigns,warmup

Planos: plus, pro, ultra, enterprise
Enterprise usa null/ilimitado para quotas e contas.

Opções de issue:
  --fingerprint <sha256>       Vincula a uma máquina específica
  --expires <ISO|never>        Padrão: never
  --features <csv>             Recursos liberados; vazio usa os recursos do plano
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
    version: payload.version,
  });
}

function ensureParent(file) { mkdirSync(dirname(resolve(file)), { recursive: true }); }
function normalizePlan(value) {
  const plan = String(value ?? '').trim().toLowerCase();
  return PLAN_LIMITS[plan] ? plan : LEGACY_PLAN_MAP[plan] || null;
}
function featuresFor(plan) {
  if (plan === 'plus') return ['webchat','sender','campaigns','delivery','warmup','contacts','templates'];
  if (plan === 'pro') return ['webchat','sender','groups','campaigns','delivery','warmup','ai_chat','scheduler','contacts','filter','autoreply','templates','poll_report'];
  return ['*'];
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
  const plan = normalizePlan(options.plan);
  if (!plan) throw new Error(`Plano inválido: ${options.plan}. Use plus, pro, ultra ou enterprise.`);

  let expiresAt = null;
  if (options.expires && options.expires !== 'never') {
    const date = new Date(options.expires);
    if (Number.isNaN(date.getTime())) throw new Error('--expires inválido');
    expiresAt = date.toISOString();
  }

  const limits = { ...PLAN_LIMITS[plan] };
  const features = [...new Set(String(options.features ?? '').split(',').map(v => v.trim()).filter(Boolean))];
  const payload = {
    licenseId: `AZ-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
    customerId: options['customer-id'],
    customerName: options['customer-name'],
    plan,
    issuedAt: new Date().toISOString(),
    expiresAt,
    maxSeats: limits.maxSeats,
    maxInstances: limits.maxInstances,
    limits,
    features: (features.length ? features : featuresFor(plan)).sort(),
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
