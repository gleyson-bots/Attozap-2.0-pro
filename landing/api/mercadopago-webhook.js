import { audit, db, ensureSchema } from './_lib/db.js';
import { issueLicense } from './_lib/license.js';
import { sendLicenseIssued, sendPlanActivated } from './_lib/email.js';
import { body, fail, json } from './_lib/http.js';
import {
  getMercadoPagoAuthorizedPayment,
  getMercadoPagoPayment,
  getMercadoPagoSubscription,
  parseMercadoPagoReference,
  verifyMercadoPagoWebhook,
} from './_lib/mercadopago.js';

function normalizedStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'authorized') return 'active';
  if (value === 'cancelled') return 'canceled';
  return value || 'pending';
}

async function resolveOwner(preapproval) {
  const parsed = parseMercadoPagoReference(preapproval.external_reference);
  if (parsed) {
    const user = (await db().execute({ sql: `SELECT * FROM users WHERE id=? LIMIT 1`, args: [parsed.userId] })).rows[0];
    const plan = (await db().execute({ sql: `SELECT * FROM plans WHERE id=? LIMIT 1`, args: [parsed.planId] })).rows[0];
    if (user && plan) return { user, plan };
  }
  const existing = (await db().execute({
    sql: `SELECT s.user_id,s.plan_id FROM subscriptions s WHERE s.provider='mercadopago' AND s.provider_subscription_id=? LIMIT 1`,
    args: [String(preapproval.id)],
  })).rows[0];
  if (!existing) return null;
  const user = (await db().execute({ sql: `SELECT * FROM users WHERE id=? LIMIT 1`, args: [existing.user_id] })).rows[0];
  const plan = (await db().execute({ sql: `SELECT * FROM plans WHERE id=? LIMIT 1`, args: [existing.plan_id] })).rows[0];
  return user && plan ? { user, plan } : null;
}

async function syncPreapproval(preapproval, { paymentApproved = false } = {}) {
  const owner = await resolveOwner(preapproval);
  if (!owner) return { skipped: 'owner_missing' };
  const { user, plan } = owner;
  const recordId = `mp_${preapproval.id}`;
  const status = normalizedStatus(preapproval.status);
  const expiresAt = preapproval.next_payment_date || null;
  const previous = (await db().execute({ sql: `SELECT * FROM subscriptions WHERE id=? LIMIT 1`, args: [recordId] })).rows[0];
  const previousLicense = (await db().execute({ sql: `SELECT id,status FROM licenses WHERE subscription_id=? ORDER BY created_at DESC LIMIT 1`, args: [recordId] })).rows[0];

  await db().execute({
    sql: `INSERT INTO subscriptions (id,user_id,plan_id,stripe_subscription_id,provider,provider_subscription_id,status,current_period_end,cancel_at_period_end)
          VALUES (?,?,?,NULL,'mercadopago',?,?,?,0)
          ON CONFLICT(id) DO UPDATE SET plan_id=excluded.plan_id,provider='mercadopago',provider_subscription_id=excluded.provider_subscription_id,status=excluded.status,current_period_end=excluded.current_period_end,updated_at=CURRENT_TIMESTAMP`,
    args: [recordId,user.id,plan.id,String(preapproval.id),status,expiresAt],
  });
  await audit(user.id, 'mercadopago.subscription.sync', 'subscription', recordId, { providerId: preapproval.id, status, paymentApproved });

  if (status === 'active' && paymentApproved) {
    const license = await issueLicense({ userId: user.id, planId: plan.id, subscriptionId: recordId, expiresAt, actorId: user.id });
    const shouldNotify = !previous || previous.status !== 'active' || previous.plan_id !== plan.id || !previousLicense;
    if (shouldNotify) await Promise.allSettled([sendPlanActivated(user, plan), sendLicenseIssued(user, plan, license)]);
  }
  return { synced: true, recordId, status };
}

function resourceId(req, payload) {
  try {
    const url = new URL(req.url || '/', 'https://portal.local');
    return String(url.searchParams.get('data.id') || url.searchParams.get('id') || payload?.data?.id || '');
  } catch { return String(payload?.data?.id || ''); }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido' });
    await ensureSchema();
    const payload = await body(req);
    const dataId = resourceId(req, payload);
    if (!dataId) return json(res, 400, { ok: false, error: 'Recurso Mercado Pago ausente' });
    if (!verifyMercadoPagoWebhook(req, dataId)) return json(res, 401, { ok: false, error: 'Assinatura Mercado Pago inválida' });

    const type = String(payload.type || payload.topic || new URL(req.url || '/', 'https://portal.local').searchParams.get('type') || 'unknown');
    const eventId = String(payload.id || `${type}:${dataId}:${payload.action || ''}`);
    const inserted = await db().execute({
      sql: `INSERT OR IGNORE INTO mercadopago_events (id,type,resource_id) VALUES (?,?,?)`,
      args: [eventId,type,dataId],
    });
    if (!inserted.rowsAffected) return json(res, 200, { received: true, duplicate: true });

    try {
      if (type === 'subscription_preapproval') {
        await syncPreapproval(await getMercadoPagoSubscription(dataId));
      } else if (type === 'subscription_authorized_payment') {
        const invoice = await getMercadoPagoAuthorizedPayment(dataId);
        const approved = invoice?.payment?.status === 'approved';
        if (invoice?.preapproval_id) await syncPreapproval(await getMercadoPagoSubscription(invoice.preapproval_id), { paymentApproved: approved });
      } else if (type === 'payment') {
        const payment = await getMercadoPagoPayment(dataId);
        await audit(null, 'mercadopago.payment.notice', 'payment', String(payment.id || dataId), { status: payment.status, externalReference: payment.external_reference || null });
      }
    } catch (processingError) {
      await db().execute({ sql: `DELETE FROM mercadopago_events WHERE id=?`, args: [eventId] });
      throw processingError;
    }

    return json(res, 200, { received: true });
  } catch (error) { return fail(res, error); }
}
