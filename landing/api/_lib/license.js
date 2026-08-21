import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { audit, db, ensureSchema, safeJson } from './db.js';

function privateKeyPem() {
  const raw = String(process.env.LICENSE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!raw) throw new Error('LICENSE_PRIVATE_KEY não configurada');
  return raw;
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

export async function resignLicense(licenseId, { fingerprint, expiresAt, planId, actorId = null } = {}) {
  await ensureSchema();

  if (planId) {
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
  if (!row) throw new Error('Licença não encontrada');

  const nextFingerprint = fingerprint === undefined ? (row.fingerprint || null) : (fingerprint || null);
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
            license_key=?,fingerprint=?,expires_at=?,max_seats=?,max_instances=?,features_json=?,status='active',updated_at=CURRENT_TIMESTAMP
          WHERE id=?`,
    args: [licenseKey,nextFingerprint,nextExpiresAt,payload.maxSeats,payload.maxInstances,JSON.stringify(features),licenseId],
  });
  await audit(actorId || row.user_id, 'license.resign', 'license', licenseId, { planId: row.plan_id, fingerprintChanged: fingerprint !== undefined, expiresAt: nextExpiresAt });
  return (await db().execute({ sql: `SELECT * FROM licenses WHERE id=? LIMIT 1`, args: [licenseId] })).rows[0];
}

export async function issueLicense({ userId, planId, subscriptionId = null, expiresAt = null, fingerprint = undefined, actorId = null }) {
  await ensureSchema();
  const userResult = await db().execute({ sql: `SELECT * FROM users WHERE id=? LIMIT 1`, args: [userId] });
  const planResult = await db().execute({ sql: `SELECT * FROM plans WHERE id=? LIMIT 1`, args: [planId] });
  const user = userResult.rows[0];
  const plan = planResult.rows[0];
  if (!user || !plan) throw new Error('Usuário ou plano não encontrado');

  if (subscriptionId) {
    const existing = await db().execute({
      sql: `SELECT * FROM licenses WHERE subscription_id=? ORDER BY created_at DESC LIMIT 1`,
      args: [subscriptionId],
    });
    if (existing.rows[0]) {
      return resignLicense(existing.rows[0].id, {
        planId,
        expiresAt,
        ...(fingerprint !== undefined ? { fingerprint } : {}),
        actorId: actorId || userId,
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
    fingerprint: fingerprint ?? null,
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
  const rows = await db().execute({ sql: `SELECT id,user_id FROM licenses WHERE subscription_id=? AND status='active'`, args: [subscriptionId] });
  await db().execute({ sql: `UPDATE licenses SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE subscription_id=?`, args: [subscriptionId] });
  for (const row of rows.rows) await audit(actorId || row.user_id, 'license.revoke', 'license', row.id, { subscriptionId });
}
