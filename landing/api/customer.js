import Stripe from 'stripe';
import { audit, db, ensureSchema, publicPlan, publicUser, safeJson } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { resignLicense } from './_lib/license.js';
import { cancelMercadoPagoSubscription, createMercadoPagoPixPayment, createMercadoPagoSubscription } from './_lib/mercadopago.js';
import { notifyUser } from './_lib/notifications.js';
import { body, fail, json, origin } from './_lib/http.js';

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Stripe ainda não configurado no portal'), { statusCode: 503 });
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function mercadoPagoReady() {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.MERCADOPAGO_WEBHOOK_SECRET);
}

function subscriptionView(row) {
  if (!row) return null;
  return {
    id: row.subscription_id,
    status: row.subscription_status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    provider: row.provider || 'stripe',
    providerSubscriptionId: row.provider_subscription_id || row.stripe_subscription_id || null,
    stripeSubscriptionId: row.stripe_subscription_id,
    plan: publicPlan(row),
  };
}

function licenseView(row) {
  return {
    id: row.id, planId: row.plan_id, planName: row.plan_name, status: row.status,
    key: row.license_key, fingerprint: row.fingerprint, issuedAt: row.issued_at, expiresAt: row.expires_at,
    maxSeats: row.max_seats, maxInstances: row.max_instances, features: safeJson(row.features_json),
  };
}

function paymentView(row) {
  return {
    id: row.id, providerPaymentId: row.provider_payment_id, provider: row.provider, method: row.method,
    status: row.status, amountCents: row.amount_cents, currency: row.currency, planId: row.plan_id,
    planName: row.plan_name || null, ticketUrl: row.ticket_url || null, expiresAt: row.expires_at || null,
    paidAt: row.paid_at || null, createdAt: row.created_at,
  };
}

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const user = await requireUser(req);

    if (req.method === 'GET') {
      const plans = await db().execute(`SELECT * FROM plans WHERE active=1 ORDER BY sort_order ASC,name ASC`);
      const subscriptions = await db().execute({
        sql: `SELECT s.id AS subscription_id,s.status AS subscription_status,s.current_period_end,s.cancel_at_period_end,
                    s.stripe_subscription_id,s.provider,s.provider_subscription_id,p.*
              FROM subscriptions s JOIN plans p ON p.id=s.plan_id
              WHERE s.user_id=? ORDER BY s.updated_at DESC`,
        args: [user.id],
      });
      const licenses = await db().execute({
        sql: `SELECT l.*,p.name AS plan_name FROM licenses l JOIN plans p ON p.id=l.plan_id WHERE l.user_id=? ORDER BY l.created_at DESC`,
        args: [user.id],
      });
      const payments = await db().execute({
        sql: `SELECT pay.*,p.name AS plan_name FROM payments pay JOIN plans p ON p.id=pay.plan_id WHERE pay.user_id=? ORDER BY pay.created_at DESC LIMIT 30`,
        args: [user.id],
      });
      const releases = await db().execute(`SELECT * FROM releases WHERE active=1 ORDER BY published_at DESC LIMIT 20`);
      return json(res, 200, {
        ok: true,
        user: publicUser(user),
        plans: plans.rows.map(publicPlan),
        subscriptions: subscriptions.rows.map(subscriptionView),
        payments: payments.rows.map(paymentView),
        licenses: licenses.rows.map(licenseView),
        paymentProviders: {
          stripe: Boolean(process.env.STRIPE_SECRET_KEY),
          mercadoPago: mercadoPagoReady(),
          pix: mercadoPagoReady(),
        },
        releases: releases.rows.map(row => ({ id: row.id, version: row.version, channel: row.channel, downloadUrl: row.download_url, notes: row.notes, mandatory: Boolean(row.mandatory), publishedAt: row.published_at })),
      });
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido' });
    const input = await body(req);
    const action = String(input.action || '');

    if (action === 'createPix') {
      const plan = (await db().execute({ sql: `SELECT * FROM plans WHERE (id=? OR slug=?) AND active=1 LIMIT 1`, args: [input.planId || '', input.planId || ''] })).rows[0];
      if (!plan) throw Object.assign(new Error('Plano não encontrado'), { statusCode: 404 });
      if (plan.slug === 'enterprise') throw Object.assign(new Error('Enterprise é contratado por proposta comercial'), { statusCode: 400 });
      if (!mercadoPagoReady()) throw Object.assign(new Error('PIX ainda não configurado por completo no Mercado Pago'), { statusCode: 503 });
      const activeRecurring = (await db().execute({
        sql: `SELECT id,provider FROM subscriptions WHERE user_id=? AND status IN ('active','trialing') ORDER BY updated_at DESC LIMIT 1`,
        args: [user.id],
      })).rows[0];
      if (activeRecurring) throw Object.assign(new Error('Você já possui uma assinatura recorrente ativa. Gerencie-a antes de comprar um período via PIX.'), { statusCode: 409 });

      const payment = await createMercadoPagoPixPayment({ user, plan, payerDocument: input.payerDocument, baseUrl: origin(req) });
      const transaction = payment.point_of_interaction?.transaction_data || {};
      const id = `pix_${payment.id}`;
      await db().execute({
        sql: `INSERT INTO payments (id,user_id,plan_id,provider,provider_payment_id,method,status,amount_cents,currency,external_reference,qr_code,ticket_url,expires_at)
              VALUES (?,?,?,'mercadopago',?,'pix',?,?,?,?,?,?,?)
              ON CONFLICT(provider_payment_id) DO UPDATE SET status=excluded.status,qr_code=excluded.qr_code,ticket_url=excluded.ticket_url,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP`,
        args: [id,user.id,plan.id,String(payment.id),String(payment.status || 'pending'),Number(plan.price_cents),String(payment.currency_id || 'BRL').toLowerCase(),String(payment.external_reference || ''),String(transaction.qr_code || ''),String(transaction.ticket_url || ''),payment.pixExpiresAt || payment.date_of_expiration || null],
      });
      await audit(user.id, 'billing.pix.create', 'payment', id, { providerPaymentId: payment.id, planId: plan.id, amountCents: plan.price_cents });
      await notifyUser(user.id, {
        type: 'payment', title: 'PIX gerado',
        message: `Seu PIX do plano ${plan.name} foi gerado. A licença será liberada automaticamente após a confirmação do pagamento.`,
        metadata: { paymentId: id, planId: plan.id },
      });
      return json(res, 201, {
        ok: true,
        pix: {
          id, providerPaymentId: String(payment.id), status: String(payment.status || 'pending'),
          planId: plan.id, planName: plan.name, amountCents: Number(plan.price_cents),
          qrCode: String(transaction.qr_code || ''), qrCodeBase64: String(transaction.qr_code_base64 || ''),
          ticketUrl: String(transaction.ticket_url || ''), expiresAt: payment.pixExpiresAt || payment.date_of_expiration || null,
        },
      });
    }

    if (action === 'pixStatus') {
      const id = String(input.paymentId || '');
      const row = (await db().execute({ sql: `SELECT * FROM payments WHERE id=? AND user_id=? AND method='pix' LIMIT 1`, args: [id,user.id] })).rows[0];
      if (!row) throw Object.assign(new Error('Pagamento PIX não encontrado'), { statusCode: 404 });
      return json(res, 200, { ok: true, payment: paymentView(row) });
    }

    if (action === 'checkout') {
      const plan = (await db().execute({ sql: `SELECT * FROM plans WHERE (id=? OR slug=?) AND active=1 LIMIT 1`, args: [input.planId || '', input.planId || ''] })).rows[0];
      if (!plan) throw Object.assign(new Error('Plano não encontrado'), { statusCode: 404 });
      if (plan.slug === 'enterprise') throw Object.assign(new Error('Enterprise é contratado por proposta comercial'), { statusCode: 400 });
      const provider = input.provider === 'mercadopago' ? 'mercadopago' : 'stripe';
      const current = (await db().execute({
        sql: `SELECT id,plan_id,stripe_subscription_id,provider,provider_subscription_id,status FROM subscriptions WHERE user_id=? AND status IN ('active','trialing') ORDER BY updated_at DESC LIMIT 1`,
        args: [user.id],
      })).rows[0];

      if (provider === 'mercadopago') {
        if (!mercadoPagoReady()) throw Object.assign(new Error('Mercado Pago ainda não configurado por completo'), { statusCode: 503 });
        if (current) {
          if (current.provider === 'mercadopago' && current.plan_id === plan.id) throw Object.assign(new Error('Este plano já está ativo no Mercado Pago'), { statusCode: 409 });
          throw Object.assign(new Error('Você já possui uma assinatura ativa. Cancele ou gerencie a assinatura atual antes de contratar outro plano.'), { statusCode: 409 });
        }
        const preapproval = await createMercadoPagoSubscription({ user, plan, baseUrl: origin(req) });
        const recordId = `mp_${preapproval.id}`;
        await db().execute({
          sql: `INSERT INTO subscriptions (id,user_id,plan_id,stripe_subscription_id,provider,provider_subscription_id,status,current_period_end,cancel_at_period_end)
                VALUES (?,?,?,NULL,'mercadopago',?,?,?,0)
                ON CONFLICT(id) DO UPDATE SET plan_id=excluded.plan_id,status=excluded.status,updated_at=CURRENT_TIMESTAMP`,
          args: [recordId,user.id,plan.id,String(preapproval.id),String(preapproval.status || 'pending'),preapproval.next_payment_date || null],
        });
        await audit(user.id, 'billing.mercadopago.create', 'subscription', recordId, { providerId: preapproval.id, planId: plan.id });
        await notifyUser(user.id, { type: 'payment', title: 'Assinatura criada', message: `A assinatura Mercado Pago do plano ${plan.name} foi iniciada.`, metadata: { subscriptionId: recordId } });
        return json(res, 200, { ok: true, url: preapproval.init_point, mode: 'mercadopago_subscription', provider: 'mercadopago' });
      }

      if (!plan.stripe_price_id) throw Object.assign(new Error(`Preço Stripe do plano ${plan.name} ainda não configurado`), { statusCode: 409 });
      const stripe = stripeClient();
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({ name: user.name, email: user.email, metadata: { attozapUserId: user.id } });
        customerId = customer.id;
        await db().execute({ sql: `UPDATE users SET stripe_customer_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, args: [customerId, user.id] });
      }
      const base = origin(req);
      if (current) {
        if (current.provider !== 'stripe') throw Object.assign(new Error('Você já possui uma assinatura ativa no Mercado Pago. Gerencie-a antes de migrar para Stripe.'), { statusCode: 409 });
        const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${base}/portal` });
        await audit(user.id, 'billing.plan.change.open', 'plan', plan.id, { subscriptionId: current.stripe_subscription_id, currentPlanId: current.plan_id });
        return json(res, 200, { ok: true, url: portal.url, mode: 'billing_portal', provider: 'stripe' });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription', customer: customerId,
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${base}/portal?checkout=success&provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/portal?checkout=cancelled`,
        metadata: { userId: user.id, planId: plan.id },
        subscription_data: { metadata: { userId: user.id, planId: plan.id } },
      });
      await audit(user.id, 'billing.checkout.create', 'plan', plan.id, { sessionId: session.id });
      return json(res, 200, { ok: true, url: session.url, mode: 'checkout', provider: 'stripe' });
    }

    if (action === 'billingPortal') {
      if (!user.stripe_customer_id) throw Object.assign(new Error('Nenhuma conta Stripe vinculada ainda'), { statusCode: 409 });
      const stripe = stripeClient();
      const session = await stripe.billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: `${origin(req)}/portal` });
      await audit(user.id, 'billing.portal.open', 'user', user.id);
      return json(res, 200, { ok: true, url: session.url });
    }

    if (action === 'cancelSubscription') {
      const subscriptionId = String(input.subscriptionId || '');
      const subscription = (await db().execute({ sql: `SELECT * FROM subscriptions WHERE id=? AND user_id=? LIMIT 1`, args: [subscriptionId,user.id] })).rows[0];
      if (!subscription) throw Object.assign(new Error('Assinatura não encontrada'), { statusCode: 404 });
      if (subscription.provider === 'mercadopago') {
        await cancelMercadoPagoSubscription(subscription.provider_subscription_id);
        await db().execute({ sql: `UPDATE subscriptions SET status='canceled',updated_at=CURRENT_TIMESTAMP WHERE id=?`, args: [subscription.id] });
        await audit(user.id, 'billing.mercadopago.cancel', 'subscription', subscription.id, { providerId: subscription.provider_subscription_id });
        await notifyUser(user.id, { type: 'warning', title: 'Assinatura cancelada', message: 'Sua assinatura Mercado Pago foi cancelada.', metadata: { subscriptionId: subscription.id } });
        return json(res, 200, { ok: true, message: 'Assinatura Mercado Pago cancelada.' });
      }
      if (!user.stripe_customer_id) throw Object.assign(new Error('Conta Stripe não vinculada'), { statusCode: 409 });
      const session = await stripeClient().billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: `${origin(req)}/portal` });
      return json(res, 200, { ok: true, url: session.url, mode: 'billing_portal' });
    }

    if (action === 'requestLicenseReset') {
      const licenseId = String(input.licenseId || '');
      const found = await db().execute({ sql: `SELECT id FROM licenses WHERE id=? AND user_id=? LIMIT 1`, args: [licenseId, user.id] });
      if (!found.rows[0]) throw Object.assign(new Error('Licença não encontrada'), { statusCode: 404 });
      await audit(user.id, 'license.reset.request', 'license', licenseId, { reason: String(input.reason || '') });
      await notifyUser(user.id, { type: 'info', title: 'Reset solicitado', message: 'Sua solicitação de redefinição de dispositivo foi registrada.', metadata: { licenseId } });
      return json(res, 200, { ok: true, message: 'Solicitação registrada. O administrador ou suporte poderá liberar a troca de dispositivo.' });
    }

    if (action === 'bindFingerprint') {
      const licenseId = String(input.licenseId || '');
      const fingerprint = String(input.fingerprint || '').trim();
      if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw Object.assign(new Error('Fingerprint inválido'), { statusCode: 400 });
      const license = (await db().execute({ sql: `SELECT * FROM licenses WHERE id=? AND user_id=? AND status='active' LIMIT 1`, args: [licenseId, user.id] })).rows[0];
      if (!license) throw Object.assign(new Error('Licença ativa não encontrada'), { statusCode: 404 });
      if (license.fingerprint && license.fingerprint !== fingerprint) throw Object.assign(new Error('Esta licença já está vinculada a outro dispositivo. Solicite uma redefinição.'), { statusCode: 409 });
      const resigned = await resignLicense(licenseId, { fingerprint, actorId: user.id });
      await notifyUser(user.id, { type: 'license', title: 'Dispositivo vinculado', message: 'A licença foi vinculada ao fingerprint informado.', metadata: { licenseId } });
      return json(res, 200, { ok: true, license: licenseView(resigned) });
    }

    return json(res, 400, { ok: false, error: 'Ação inválida' });
  } catch (error) { return fail(res, error); }
}
