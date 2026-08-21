import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { audit, db, ensureSchema, safeJson } from './db.js';

function privateKeyPem() {
  const raw = String(process.env.LICENSE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!raw) throw Object.assign(new Error('Assinatura de licenças não configurada no servidor'), { statusCode: 503 });
  return raw;
}

function normalizeFingerprint(value, { allowEmpty = true } = {}) {
  if (value === undefined) return undefined;
  const clean = String(value || '').trim().toLowerCase();
  if (!clean && allowEmpty) return null;
  if (!/^[a-f0-9]{64}$/.test(clean)) {
    throw Object.assign(new Error('Fingerprint inválido. Use o fingerprint de 64 caracteres gerado pelo ATTOZAP.'), { statusCode: 400 });
  }
  return clean;
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

function signPayload(payload) {
  const signature = sign(null, Buffer.from(canonicalize(payload)), createPrivateKey(privateKeyPem())).toString('base64url');
  return encodeLicense({ payload, signature, algorithm: 'Ed25519' });
}

export function encodeLicense(signed) {
  return Buffer.from(JSON.stringify(signed), 'utf8').toString('base64url');
}

export async function resignLicense(licenseId, { fingerprint, expiresAt, planId, actorId = null, activate = false } = {}) {
  await ensureSchema();
  if (!licenseId) throw Object.assign(new Error('Licença não informada'), { statusCode: 400 });

  const normalizedFingerprint = normalizeFingerprint(fingerprint);

  if (planId) {
    const planExists = await db().execute({ sql: `SELECT id FROM plans WHERE id=? LIMIT 1`, args: [planId] });
    if (!planExists.rows[0]) throw Object.assign(new Error('Plano não encontrado'), { statusCode: 404 });
    await db().execute({ sql: `UPDATE licenses SET plan_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, args: [planId, licenseId] });
  }

  const result = await db().execute({
    sql: `SELECT
            l.*,
            u.name AS user_name,
            p.license_plan AS plan_license_plan,
            p.max_seats AS plan_max_seats,
            p.max_instances AS plan_max_instances,
            p.features_json AS plan_features_json
          FROM licenses l
          JOIN users u ON u.id=l.user_id
          JOIN plans p ON p.id=l.plan_id
          WHERE l.id=? LIMIT 1`,
    args: [licenseId],
  });
  const row = result.rows[0];
  if (!row) throw Object.assign(new Error('Licença não encontrada'), { statusCode: 404 });

  const nextFingerprint = normalizedFingerprint === undefined ? (row.fingerprint || null) : normalizedFingerprint;
  const nextExpiresAt = expiresAt === undefined ? (row.expires_at || null) : (expiresAt || null);
  const features = safeJson(row.plan_features_json);
  const payload = {
    licenseId: row.id,
    customerId: row.user_id,
    customerName: row.user_name,
    plan: row.plan_license_plan,
    issuedAt: row.issued_at,
    expiresAt: nextExpiresAt,
    maxSeats: Number(row.plan_max_seats || row.max_seats || 1),
    maxInstances: Number(row.plan_max_instances || row.max_instances || 1),
    features,
    fingerprint: nextFingerprint,
    version: 1,
  };
  const licenseKey = signPayload(payload);

  await db().execute({
    sql: `UPDATE licenses SET
            license_key=?,fingerprint=?,expires_at=?,max_seats=?,max_instances=?,features_json=?,
            status=CASE WHEN ?=1 THEN 'active' ELSE status END,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?`,
    args: [licenseKey,nextFingerprint,nextExpiresAt,payload.maxSeats,payload.maxInstances,JSON.stringify(features),activate ? 1 : 0,licenseId],
  });
  await audit(actorId || row.user_id, 'license.resign', 'license', licenseId, {
    planId: row.plan_id,
    fingerprintChanged: fingerprint !== undefined,
    expiresAt: nextExpiresAt,
    activated: Boolean(activate),
  });
  return (await db().execute({ sql: `SELECT * FROM licenses WHERE id=? LIMIT 1`, args: [licenseId] })).rows[0];
}

export async function issueLicense({ userId, planId, subscriptionId = null, expiresAt = null, fingerprint = undefined, actorId = null }) {
  await ensureSchema();
  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  const userResult = await db().execute({ sql: `SELECT * FROM users WHERE id=? LIMIT 1`, args: [userId] });
  const planResult = await db().execute({ sql: `SELECT * FROM plans WHERE id=? AND active=1 LIMIT 1`, args: [planId] });
  const user = userResult.rows[0];
  const plan = planResult.rows[0];
  if (!user || !plan) throw Object.assign(new Error('Usuário ou plano ativo não encontrado'), { statusCode: 404 });

  if (subscriptionId) {
    const existing = await db().execute({
      sql: `SELECT * FROM licenses WHERE subscription_id=? ORDER BY created_at DESC LIMIT 1`,
      args: [subscriptionId],
    });
    if (existing.rows[0]) {
      return resignLicense(existing.rows[0].id, {
        planId,
        expiresAt,
        ...(normalizedFingerprint !== undefined ? { fingerprint: normalizedFingerprint } : {}),
        actorId: actorId || userId,
        activate: true,
      });
    }
  }

  const issuedAt = new Date().toISOString();
  const licenseId = randomUUID();
  const features = safeJson(plan.features_json);
  const payload = {
    licenseId,
    customerId: user.id,
    customerName: user.name,
    plan: plan.license_plan,
    issuedAt,
    expiresAt: expiresAt || null,
    maxSeats: Number(plan.max_seats || 1),
    maxInstances: Number(plan.max_instances || 1),
    features,
    fingerprint: normalizedFingerprint ?? null,
    version: 1,
  };
  const licenseKey = signPayload(payload);

  await db().execute({
    sql: `INSERT INTO licenses (id,user_id,plan_id,subscription_id,license_key,status,fingerprint,issued_at,expires_at,max_seats,max_instances,features_json)
          VALUES (?,?,?,?,?,'active',?,?,?,?,?,?)`,
    args: [licenseId,user.id,plan.id,subscriptionId,licenseKey,payload.fingerprint,issuedAt,payload.expiresAt,payload.maxSeats,payload.maxInstances,JSON.stringify(features)],
  });
  await audit(actorId || user.id, 'license.issue', 'license', licenseId, { userId, planId, subscriptionId });
  return (await db().execute({ sql: `SELECT * FROM licenses WHERE id=?`, args: [licenseId] })).rows[0];
}

export async function revokeLicensesForSubscription(subscriptionId, actorId = null) {
  await ensureSchema();
  if (!subscriptionId) return;
  const rows = await db().execute({ sql: `SELECT id,user_id FROM licenses WHERE subscription_id=? AND status='active'`, args: [subscriptionId] });
  if (!rows.rows.length) return;
  await db().execute({ sql: `UPDATE licenses SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE subscription_id=? AND status='active'`, args: [subscriptionId] });
  for (const row of rows.rows) await audit(actorId || row.user_id, 'license.revoke', 'license', row.id, { subscriptionId });
}
