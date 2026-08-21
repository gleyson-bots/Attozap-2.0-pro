import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { audit, db, ensureSchema, normalizeEmail, safeJson } from './db.js';

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

function payloadFor({ licenseId, customerId, customerName, plan, issuedAt, expiresAt, fingerprint }) {
  const features = safeJson(plan.features_json);
  return {
    licenseId,
    customerId,
    customerName,
    plan: plan.license_plan,
    issuedAt,
    expiresAt: expiresAt || null,
    maxSeats: Number(plan.max_seats || 1),
    maxInstances: Number(plan.max_instances || 1),
    features,
    fingerprint: fingerprint ?? null,
    version: 1,
  };
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
    sql: `SELECT l.*,u.name AS user_name,p.*,
                 p.license_plan AS plan_license_plan,p.max_seats AS plan_max_seats,p.max_instances AS plan_max_instances,p.features_json AS plan_features_json
          FROM licenses l JOIN users u ON u.id=l.user_id JOIN plans p ON p.id=l.plan_id WHERE l.id=? LIMIT 1`,
    args: [licenseId],
  });
  const row = result.rows[0];
  if (!row) throw Object.assign(new Error('Licença não encontrada'), { statusCode: 404 });
  const nextFingerprint = normalizedFingerprint === undefined ? (row.fingerprint || null) : normalizedFingerprint;
  const nextExpiresAt = expiresAt === undefined ? (row.expires_at || null) : (expiresAt || null);
  const plan = { license_plan: row.plan_license_plan, max_seats: row.plan_max_seats, max_instances: row.plan_max_instances, features_json: row.plan_features_json };
  const payload = payloadFor({ licenseId: row.id, customerId: row.user_id, customerName: row.user_name, plan, issuedAt: row.issued_at, expiresAt: nextExpiresAt, fingerprint: nextFingerprint });
  const licenseKey = signPayload(payload);

  await db().execute({
    sql: `UPDATE licenses SET license_key=?,fingerprint=?,expires_at=?,max_seats=?,max_instances=?,features_json=?,status=CASE WHEN ?=1 THEN 'active' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    args: [licenseKey,nextFingerprint,nextExpiresAt,payload.maxSeats,payload.maxInstances,JSON.stringify(payload.features),activate ? 1 : 0,licenseId],
  });
  await audit(actorId || row.user_id, 'license.resign', 'license', licenseId, { planId: row.plan_id, fingerprintChanged: fingerprint !== undefined, expiresAt: nextExpiresAt, activated: Boolean(activate) });
  return (await db().execute({ sql: `SELECT * FROM licenses WHERE id=? LIMIT 1`, args: [licenseId] })).rows[0];
}

export async function issueLicense({ userId, planId, subscriptionId = null, expiresAt = null, fingerprint = undefined, actorId = null }) {
  await ensureSchema();
  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  const user = (await db().execute({ sql: `SELECT * FROM users WHERE id=? LIMIT 1`, args: [userId] })).rows[0];
  const plan = (await db().execute({ sql: `SELECT * FROM plans WHERE id=? AND active=1 LIMIT 1`, args: [planId] })).rows[0];
  if (!user || !plan) throw Object.assign(new Error('Usuário ou plano ativo não encontrado'), { statusCode: 404 });

  if (subscriptionId) {
    const existing = await db().execute({ sql: `SELECT * FROM licenses WHERE subscription_id=? ORDER BY created_at DESC LIMIT 1`, args: [subscriptionId] });
    if (existing.rows[0]) {
      return resignLicense(existing.rows[0].id, { planId, expiresAt, ...(normalizedFingerprint !== undefined ? { fingerprint: normalizedFingerprint } : {}), actorId: actorId || userId, activate: true });
    }
  }

  const issuedAt = new Date().toISOString();
  const licenseId = randomUUID();
  const payload = payloadFor({ licenseId, customerId: user.id, customerName: user.name, plan, issuedAt, expiresAt, fingerprint: normalizedFingerprint });
  const licenseKey = signPayload(payload);
  await db().execute({
    sql: `INSERT INTO licenses (id,user_id,plan_id,subscription_id,license_key,status,fingerprint,issued_at,expires_at,max_seats,max_instances,features_json) VALUES (?,?,?,?,?,'active',?,?,?,?,?,?)`,
    args: [licenseId,user.id,plan.id,subscriptionId,licenseKey,payload.fingerprint,issuedAt,payload.expiresAt,payload.maxSeats,payload.maxInstances,JSON.stringify(payload.features)],
  });
  await audit(actorId || user.id, 'license.issue', 'license', licenseId, { userId, planId, subscriptionId });
  return (await db().execute({ sql: `SELECT * FROM licenses WHERE id=?`, args: [licenseId] })).rows[0];
}

export async function issueExternalLicense({ name, email, reference, planId, expiresAt = null, fingerprint = undefined, actorId = null }) {
  await ensureSchema();
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  if (cleanName.length < 2) throw Object.assign(new Error('Informe o nome do cliente externo'), { statusCode: 400 });
  if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) throw Object.assign(new Error('E-mail externo inválido'), { statusCode: 400 });
  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  const plan = (await db().execute({ sql: `SELECT * FROM plans WHERE id=? AND active=1 LIMIT 1`, args: [planId] })).rows[0];
  if (!plan) throw Object.assign(new Error('Plano ativo não encontrado'), { statusCode: 404 });

  let customer = null;
  if (cleanEmail) customer = (await db().execute({ sql: `SELECT * FROM external_customers WHERE email=? ORDER BY created_at DESC LIMIT 1`, args: [cleanEmail] })).rows[0];
  if (!customer) {
    const customerId = randomUUID();
    await db().execute({ sql: `INSERT INTO external_customers (id,name,email,reference,status) VALUES (?,?,?,?, 'active')`, args: [customerId,cleanName,cleanEmail || null,String(reference || '').trim() || null] });
    customer = (await db().execute({ sql: `SELECT * FROM external_customers WHERE id=?`, args: [customerId] })).rows[0];
  } else {
    await db().execute({ sql: `UPDATE external_customers SET name=?,reference=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?`, args: [cleanName,String(reference || '').trim() || customer.reference || null,customer.id] });
    customer = { ...customer, name: cleanName };
  }

  const issuedAt = new Date().toISOString();
  const licenseId = `ext_${randomUUID()}`;
  const payload = payloadFor({ licenseId, customerId: `external:${customer.id}`, customerName: cleanName, plan, issuedAt, expiresAt, fingerprint: normalizedFingerprint });
  const licenseKey = signPayload(payload);
  await db().execute({
    sql: `INSERT INTO external_licenses (id,external_customer_id,plan_id,license_key,status,fingerprint,issued_at,expires_at,max_seats,max_instances,features_json) VALUES (?,?,?,?,'active',?,?,?,?,?,?)`,
    args: [licenseId,customer.id,plan.id,licenseKey,payload.fingerprint,issuedAt,payload.expiresAt,payload.maxSeats,payload.maxInstances,JSON.stringify(payload.features)],
  });
  await audit(actorId, 'license.external.issue', 'external_license', licenseId, { customerId: customer.id, name: cleanName, email: cleanEmail || null, planId });
  return { ...(await db().execute({ sql: `SELECT * FROM external_licenses WHERE id=?`, args: [licenseId] })).rows[0], external_customer_id: customer.id, customer_name: cleanName, customer_email: cleanEmail || null };
}

export async function resignExternalLicense(licenseId, { fingerprint, expiresAt, planId, actorId = null, activate = false } = {}) {
  await ensureSchema();
  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  if (planId) {
    const plan = (await db().execute({ sql: `SELECT id FROM plans WHERE id=? AND active=1 LIMIT 1`, args: [planId] })).rows[0];
    if (!plan) throw Object.assign(new Error('Plano ativo não encontrado'), { statusCode: 404 });
    await db().execute({ sql: `UPDATE external_licenses SET plan_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, args: [planId,licenseId] });
  }
  const row = (await db().execute({
    sql: `SELECT l.*,c.name AS customer_name,c.email AS customer_email,p.*,
                 p.license_plan AS plan_license_plan,p.max_seats AS plan_max_seats,p.max_instances AS plan_max_instances,p.features_json AS plan_features_json
          FROM external_licenses l JOIN external_customers c ON c.id=l.external_customer_id JOIN plans p ON p.id=l.plan_id WHERE l.id=? LIMIT 1`, args: [licenseId],
  })).rows[0];
  if (!row) throw Object.assign(new Error('Licença externa não encontrada'), { statusCode: 404 });
  const nextFingerprint = normalizedFingerprint === undefined ? (row.fingerprint || null) : normalizedFingerprint;
  const nextExpiresAt = expiresAt === undefined ? (row.expires_at || null) : (expiresAt || null);
  const plan = { license_plan: row.plan_license_plan, max_seats: row.plan_max_seats, max_instances: row.plan_max_instances, features_json: row.plan_features_json };
  const payload = payloadFor({ licenseId: row.id, customerId: `external:${row.external_customer_id}`, customerName: row.customer_name, plan, issuedAt: row.issued_at, expiresAt: nextExpiresAt, fingerprint: nextFingerprint });
  const licenseKey = signPayload(payload);
  await db().execute({
    sql: `UPDATE external_licenses SET license_key=?,fingerprint=?,expires_at=?,max_seats=?,max_instances=?,features_json=?,status=CASE WHEN ?=1 THEN 'active' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    args: [licenseKey,nextFingerprint,nextExpiresAt,payload.maxSeats,payload.maxInstances,JSON.stringify(payload.features),activate ? 1 : 0,licenseId],
  });
  await audit(actorId, 'license.external.resign', 'external_license', licenseId, { fingerprintChanged: fingerprint !== undefined, expiresAt: nextExpiresAt, activated: Boolean(activate) });
  return (await db().execute({ sql: `SELECT * FROM external_licenses WHERE id=?`, args: [licenseId] })).rows[0];
}

export async function revokeLicensesForSubscription(subscriptionId, actorId = null) {
  await ensureSchema();
  if (!subscriptionId) return;
  const rows = await db().execute({ sql: `SELECT id,user_id FROM licenses WHERE subscription_id=? AND status='active'`, args: [subscriptionId] });
  if (!rows.rows.length) return;
  await db().execute({ sql: `UPDATE licenses SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE subscription_id=? AND status='active'`, args: [subscriptionId] });
  for (const row of rows.rows) await audit(actorId || row.user_id, 'license.revoke', 'license', row.id, { subscriptionId });
}
