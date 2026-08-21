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

export function encodeLicense(signed) {
  return Buffer.from(JSON.stringify(signed), 'utf8').toString('base64url');
}

export async function issueLicense({ userId, planId, subscriptionId = null, expiresAt = null, fingerprint = null, actorId = null }) {
  await ensureSchema();
  const userResult = await db().execute({ sql: `SELECT * FROM users WHERE id=? LIMIT 1`, args: [userId] });
  const planResult = await db().execute({ sql: `SELECT * FROM plans WHERE id=? LIMIT 1`, args: [planId] });
  const user = userResult.rows[0];
  const plan = planResult.rows[0];
  if (!user || !plan) throw new Error('Usuário ou plano não encontrado');

  if (subscriptionId) {
    const existing = await db().execute({
      sql: `SELECT * FROM licenses WHERE subscription_id=? AND status='active' ORDER BY created_at DESC LIMIT 1`,
      args: [subscriptionId],
    });
    if (existing.rows[0]) return existing.rows[0];
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
    fingerprint: fingerprint || null,
    version: 1,
  };
  const signature = sign(null, Buffer.from(canonicalize(payload)), createPrivateKey(privateKeyPem())).toString('base64url');
  const licenseKey = encodeLicense({ payload, signature, algorithm: 'Ed25519' });

  await db().execute({
    sql: `INSERT INTO licenses (id,user_id,plan_id,subscription_id,license_key,status,fingerprint,issued_at,expires_at,max_seats,max_instances,features_json)
          VALUES (?,?,?,?,?,'active',?,?,?,?,?,?)`,
    args: [licenseId,user.id,plan.id,subscriptionId,licenseKey,fingerprint,issuedAt,expiresAt,Number(plan.max_seats || 1),Number(plan.max_instances || 1),JSON.stringify(features)],
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
