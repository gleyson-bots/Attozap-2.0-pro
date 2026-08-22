import { audit, db, ensureSchema } from './_lib/db.js';
import { issueLicense, resignLicense } from './_lib/license.js';
import { sendLicenseIssued, sendPlanActivated } from './_lib/email.js';
import { notifyUser } from './_lib/notifications.js';
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

function addThirtyDays(value) {
  const now = Date.now();
  const parsed = value ? new Date(value).getTime() : NaN;
  const base = Number.isFinite(parsed) && parsed > now ? parsed : now;
  return new Date(base + 30 * 24 * 60 * 60 * 1000).toISOString();
}

async function resolveOwner(preapproval) {
  const parsed = parseMercadoPagoReference(preapproval.external_reference);
  if (parsed?.kind === 'subscription') {
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
  const status = paymentApproved ? 'active' : normalizedStatus(preapproval.status);
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
    if (shouldNotify) {
      await Promise.allSettled([
        sendPlanActivated(user, plan),
        sendLicenseIssued(user, plan, license),
        notifyUser(user.id, { type: 'payment', title: 'Pagamento confirmado', message: `A assinatura Mercado Pago do plano ${plan.name} está ativa.`, metadata: { subscriptionId: recordId } }),
      ]);
    }
  } else if (previous?.status === 'active' && ['canceled','cancelled','unpaid'].includes(status)) {
    await notifyUser(user.id, { type: 'warning', title: 'Assinatura alterada', message: `Sua assinatura Mercado Pago do plano ${plan.name} está com status ${status}.`, metadata: { subscriptionId: recordId } });
  }
  return { synced: true, recordId, status };
}

async function syncPixPayment(payment) {
  const parsed = parseMercadoPagoReference(payment.external_reference);
  if (parsed?.kind !== 'pix') {
    await audit(null, 'mercadopago.payment.notice', 'payment', String(payment.id || ''), { status: payment.status, externalReference: payment.external_reference || null });
    return { skipped: 'not_attozap_pix' };
  }

  const user = (await db().execute({ sql: `SELECT * FROM users WHERE id=? LIMIT 1`, args: [parsed.userId] })).rows[0];
  const plan = (await db().execute({ sql: `SELECT * FROM plans WHERE id=? LIMIT 1`, args: [parsed.planId] })).rows[0];
  if (!user || !plan) return { skipped: 'owner_missing' };

  const id = `pix_${payment.id}`;
  const previous = (await db().execute({ sql: `SELECT * FROM payments WHERE id=? LIMIT 1`, args: [id] })).rows[0];
  const status = String(payment.status || 'pending').toLowerCase();
  const amountCents = Math.round(Number(payment.transaction_amount || 0) * 100);
  const currency = String(payment.currency_id || '').toUpperCase();
  const method = String(payment.payment_method_id || '').toLowerCase();
  const transaction = payment.point_of_interaction?.transaction_data || {};

  await db().execute({
    sql: `INSERT INTO payments (id,user_id,plan_id,provider,provider_payment_id,method,status,amount_cents,currency,external_reference,qr_code,ticket_url,expires_at,paid_at)
          VALUES (?,?,?,'mercadopago',?,'pix',?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET status=excluded.status,amount_cents=excluded.amount_cents,currency=excluded.currency,qr_code=COALESCE(NULLIF(excluded.qr_code,''),payments.qr_code),ticket_url=COALESCE(NULLIF(excluded.ticket_url,''),payments.ticket_url),paid_at=excluded.paid_at,updated_at=CURRENT_TIMESTAMP`,
    args: [id,user.id,plan.id,String(payment.id),status,amountCents,currency.toLowerCase(),String(payment.external_reference || ''),String(transaction.qr_code || ''),String(transaction.ticket_url || ''),payment.date_of_expiration || previous?.expires_at || null,payment.date_approved || null],
  });
  await audit(user.id, 'billing.pix.sync', 'payment', id, { status, amountCents, currency, method, providerPaymentId: payment.id });

  const validFinancials = method === 'pix' && currency === 'BRL' && amountCents === Number(plan.price_cents || 0);
  if (status === 'approved' && !validFinancials) {
    await audit(user.id, 'billing.pix.validation_failed', 'payment', id, { expectedAmountCents: plan.price_cents, amountCents, currency, method });
    if (previous?.status !== 'approved') await notifyUser(user.id, { type: 'warning', title: 'PIX em análise', message: 'O pagamento foi recebido, mas os dados financeiros não coincidem com o plano. O suporte precisa revisar.', metadata: { paymentId: id } });
    return { synced: true, id, status: 'review', validationFailed: true };
  }

  if (status === 'approved' && previous?.status !== 'approved') {
    const oldPixLicense = (await db().execute({
      sql: `SELECT * FROM licenses WHERE user_id=? AND plan_id=? AND status='active' AND subscription_id LIKE 'pix_%' ORDER BY created_at DESC LIMIT 1`,
      args: [user.id,plan.id],
    })).rows[0];
    const expiresAt = addThirtyDays(oldPixLicense?.expires_at);
    const license = oldPixLicense
      ? await resignLicense(oldPixLicense.id, { planId: plan.id, expiresAt, actorId: user.id })
      : await issueLicense({ userId: user.id, planId: plan.id, subscriptionId: id, expiresAt, actorId: user.id });

    await Promise.allSettled([
      sendPlanActivated(user, plan),
      sendLicenseIssued(user, plan, license),
      notifyUser(user.id, { type: 'payment', title: 'PIX aprovado', message: `Pagamento do plano ${plan.name} confirmado. Sua licença foi liberada por 30 dias.`, metadata: { paymentId: id, licenseId: license.id } }),
      notifyUser(user.id, { type: 'license', title: 'Licença atualizada', message: `Sua licença ${plan.name} está válida até ${new Date(expiresAt).toLocaleDateString('pt-BR')}.`, metadata: { licenseId: license.id } }),
    ]);
  }

  if (['rejected','cancelled','canceled','refunded','charged_back'].includes(status) && previous?.status !== status) {
    await notifyUser(user.id, { type: 'warning', title: 'PIX não concluído', message: `O pagamento PIX do plano ${plan.name} ficou com status ${status}. Gere um novo PIX se quiser tentar novamente.`, metadata: { paymentId: id } });
  }

  return { synced: true, id, status };
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
        await syncPixPayment(await getMercadoPagoPayment(dataId));
      }
    } catch (processingError) {
      await db().execute({ sql: `DELETE FROM mercadopago_events WHERE id=?`, args: [eventId] });
      throw processingError;
    }

    return json(res, 200, { received: true });
  } catch (error) { return fail(res, error); }
}
