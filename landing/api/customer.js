import Stripe from 'stripe';
import { audit, db, ensureSchema, publicPlan, publicUser, safeJson } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { resignLicense } from './_lib/license.js';
import { body, fail, json, origin } from './_lib/http.js';

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Stripe ainda não configurado no portal'), { statusCode: 503 });
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function subscriptionView(row) {
  if (!row) return null;
  return {
    id: row.subscription_id,
    status: row.subscription_status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
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

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const user = await requireUser(req);

    if (req.method === 'GET') {
      const plans = await db().execute(`SELECT * FROM plans WHERE active=1 ORDER BY sort_order ASC,name ASC`);
      const subscriptions = await db().execute({
        sql: `SELECT
                s.id AS subscription_id,
                s.status AS subscription_status,
                s.current_period_end,
                s.cancel_at_period_end,
                s.stripe_subscription_id,
                p.*
              FROM subscriptions s
              JOIN plans p ON p.id=s.plan_id
              WHERE s.user_id=?
              ORDER BY s.updated_at DESC`,
        args: [user.id],
      });
      const licenses = await db().execute({
        sql: `SELECT l.*,p.name AS plan_name FROM licenses l JOIN plans p ON p.id=l.plan_id WHERE l.user_id=? ORDER BY l.created_at DESC`,
        args: [user.id],
      });
      const releases = await db().execute(`SELECT * FROM releases WHERE active=1 ORDER BY published_at DESC LIMIT 20`);
      return json(res, 200, {
        ok: true,
        user: publicUser(user),
        plans: plans.rows.map(publicPlan),
        subscriptions: subscriptions.rows.map(subscriptionView),
        licenses: licenses.rows.map(licenseView),
        releases: releases.rows.map(row => ({ id: row.id, version: row.version, channel: row.channel, downloadUrl: row.download_url, notes: row.notes, mandatory: Boolean(row.mandatory), publishedAt: row.published_at })),
      });
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido' });
    const input = await body(req);
    const action = String(input.action || '');

    if (action === 'checkout') {
      const planResult = await db().execute({ sql: `SELECT * FROM plans WHERE (id=? OR slug=?) AND active=1 LIMIT 1`, args: [input.planId || '', input.planId || ''] });
      const plan = planResult.rows[0];
      if (!plan) throw Object.assign(new Error('Plano não encontrado'), { statusCode: 404 });
      if (plan.slug === 'enterprise') throw Object.assign(new Error('Enterprise é contratado por proposta comercial'), { statusCode: 400 });
      if (!plan.stripe_price_id) throw Object.assign(new Error(`Preço Stripe do plano ${plan.name} ainda não configurado`), { statusCode: 409 });

      const stripe = stripeClient();
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({ name: user.name, email: user.email, metadata: { attozapUserId: user.id } });
        customerId = customer.id;
        await db().execute({ sql: `UPDATE users SET stripe_customer_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, args: [customerId, user.id] });
      }
      const base = origin(req);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription', customer: customerId,
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${base}/portal?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/portal?checkout=cancelled`,
        metadata: { userId: user.id, planId: plan.id },
        subscription_data: { metadata: { userId: user.id, planId: plan.id } },
      });
      await audit(user.id, 'billing.checkout.create', 'plan', plan.id, { sessionId: session.id });
      return json(res, 200, { ok: true, url: session.url });
    }

    if (action === 'billingPortal') {
      if (!user.stripe_customer_id) throw Object.assign(new Error('Nenhuma conta de cobrança vinculada ainda'), { statusCode: 409 });
      const stripe = stripeClient();
      const session = await stripe.billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: `${origin(req)}/portal` });
      await audit(user.id, 'billing.portal.open', 'user', user.id);
      return json(res, 200, { ok: true, url: session.url });
    }

    if (action === 'requestLicenseReset') {
      const licenseId = String(input.licenseId || '');
      const found = await db().execute({ sql: `SELECT id FROM licenses WHERE id=? AND user_id=? LIMIT 1`, args: [licenseId, user.id] });
      if (!found.rows[0]) throw Object.assign(new Error('Licença não encontrada'), { statusCode: 404 });
      await audit(user.id, 'license.reset.request', 'license', licenseId, { reason: String(input.reason || '') });
      return json(res, 200, { ok: true, message: 'Solicitação registrada. O administrador poderá liberar a troca de dispositivo.' });
    }

    if (action === 'bindFingerprint') {
      const licenseId = String(input.licenseId || '');
      const fingerprint = String(input.fingerprint || '').trim();
      if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw Object.assign(new Error('Fingerprint inválido'), { statusCode: 400 });
      const found = await db().execute({ sql: `SELECT * FROM licenses WHERE id=? AND user_id=? AND status='active' LIMIT 1`, args: [licenseId, user.id] });
      const license = found.rows[0];
      if (!license) throw Object.assign(new Error('Licença ativa não encontrada'), { statusCode: 404 });
      if (license.fingerprint && license.fingerprint !== fingerprint) throw Object.assign(new Error('Esta licença já está vinculada a outro dispositivo. Solicite uma redefinição.'), { statusCode: 409 });
      const resigned = await resignLicense(licenseId, { fingerprint, actorId: user.id });
      return json(res, 200, { ok: true, license: licenseView({ ...resigned, plan_name: license.plan_name }) });
    }

    return json(res, 400, { ok: false, error: 'Ação inválida' });
  } catch (error) { return fail(res, error); }
}
