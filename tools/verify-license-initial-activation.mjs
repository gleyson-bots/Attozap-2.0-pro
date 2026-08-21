import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { app } from 'electron';

const workdir = mkdtempSync(join(tmpdir(), 'attozap-license-smoke-'));

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
    limits: {
      maxSeats: payload.limits.maxSeats,
      maxInstances: payload.limits.maxInstances,
      dailyOutbound: payload.limits.dailyOutbound,
      campaignRecipients: payload.limits.campaignRecipients,
      campaignStartsDaily: payload.limits.campaignStartsDaily,
      warmupProfiles: payload.limits.warmupProfiles,
      warmupDaily: payload.limits.warmupDaily,
      aiDaily: payload.limits.aiDaily,
    },
    fingerprint: payload.fingerprint ?? null,
    billingMode: payload.billingMode,
    initialSubscriptionDays: payload.initialSubscriptionDays,
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

try {
  const [{ openDatabase }, { LicenseService }] = await Promise.all([
    import('../dist-electron/database.js'),
    import('../dist-electron/license-service.js'),
  ]);
  const keys = generateKeyPairSync('ed25519');
  const resources = join(workdir, 'resources');
  mkdirSync(resources, { recursive: true });
  writeFileSync(join(resources, 'license-public.pem'), keys.publicKey.export({ type: 'spki', format: 'pem' }));

  const payload = {
    licenseId: `AZ-TEST${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    customerId: 'cliente-inicial',
    customerName: 'Cliente de teste',
    plan: 'pro',
    issuedAt: new Date().toISOString(),
    expiresAt: null,
    maxSeats: 3,
    maxInstances: 3,
    limits: { maxSeats: 3, maxInstances: 3, dailyOutbound: 1500, campaignRecipients: 10000, campaignStartsDaily: 10, warmupProfiles: 3, warmupDaily: 150, aiDaily: 300 },
    features: ['webchat', 'sender', 'workflows'],
    fingerprint: null,
    billingMode: 'subscription',
    initialSubscriptionDays: 30,
    version: 1,
  };
  const signature = sign(null, Buffer.from(canonicalize(payload)), keys.privateKey).toString('base64url');
  const encoded = Buffer.from(JSON.stringify({ payload, signature, algorithm: 'Ed25519' }), 'utf8').toString('base64url');
  const db = openDatabase(join(workdir, 'attozap.db'));
  const service = new LicenseService(db, resources);
  const activated = service.activate(encoded);

  assert.equal(activated.valid, true, 'a primeira ativação mensal precisa ficar válida');
  assert.equal(activated.subscription?.required, true, 'a licença deve manter o controlo mensal');
  assert.equal(activated.subscription?.active, true, 'o período inicial deve estar ativo');
  assert.ok((activated.subscription?.daysRemaining ?? 0) >= 29, 'o período inicial deve ter aproximadamente 30 dias');
  assert.equal(activated.subscription?.renewalId, undefined, 'a primeira ativação não deve requerer chave de renovação');
  const initialExpiry = Date.parse(activated.subscription?.expiresAt ?? '');
  const renewalPayload = {
    kind: 'subscription_renewal',
    renewalId: `RN-TEST${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    licenseId: payload.licenseId,
    customerId: payload.customerId,
    plan: payload.plan,
    issuedAt: new Date().toISOString(),
    days: 30,
    fingerprint: null,
    version: 1,
  };
  const renewalSignature = sign(null, Buffer.from(canonicalizeRenewal(renewalPayload)), keys.privateKey).toString('base64url');
  const renewalEncoded = Buffer.from(JSON.stringify({ payload: renewalPayload, signature: renewalSignature, algorithm: 'Ed25519' }), 'utf8').toString('base64url');
  const renewed = service.renew(renewalEncoded);
  assert.equal(renewed.valid, true, 'uma renovação válida deve manter a assinatura ativa');
  assert.equal(renewed.subscription?.renewalId, renewalPayload.renewalId, 'a renovação deve ficar associada ao mesmo registo');
  assert.ok(Date.parse(renewed.subscription?.expiresAt ?? '') > initialExpiry, 'a renovação deve ampliar a validade da assinatura');
  db.close();
  console.log('LICENSE LIFECYCLE SMOKE OK: ativação inicial e renovação válidas.');
  app.exit(0);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
