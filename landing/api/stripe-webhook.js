import Stripe from 'stripe';
import { audit, db, ensureSchema } from './_lib/db.js';
import { issueLicense, revokeLicensesForSubscription } from './_lib/license.js';
import { sendLicenseIssued, sendPlanActivated } from './_lib/email.js';
import { fail, json, rawBody } from './_lib/http.js';

export const config = { api: { bodyParser: false } };

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Stripe não configurado no servidor'), { statusCode: 503 });
  return new Stripe(process.env.STRIPE_SECRET_KEY);
};

async function syncSubscription(subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (!customerId) return { skipped: 'customer_missing' };
  const userResult = await db().execute({ sql: `SELECT * FROM users WHERE stripe_customer_id=? LIMIT 1`, args: [customerId] });
  const user = userResult.rows[0];
  if (!user) return { skipped: 'user_missing' };

  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id || '';
  const metadataPlanId = subscription.metadata?.planId || '';
  const planResult = await db().execute({
    sql: `SELECT * FROM plans WHERE id=? OR stripe_price_id=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1`,
    args: [metadataPlanId,priceId,metadataPlanId],
  });
  const plan = planResult.rows[0];
  if (!plan) return { skipped: 'plan_missing' };

  const previousResult = await db().execute({
    sql: `SELECT * FROM subscriptions WHERE stripe_subscription_id=? LIMIT 1`,
    args: [subscription.id],
  });
  const previous = previousResult.rows[0];
  const hadLicense = await db().execute({
    sql: `SELECT id,status FROM licenses WHERE subscription_id=? ORDER BY created_at DESC LIMIT 1`,
    args: [subscription.id],
  });

  const expiresAt = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
  await db().execute({
    sql: `INSERT INTO subscriptions (id,user_id,plan_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(stripe_subscription_id) DO UPDATE SET
            plan_id=excluded.plan_id,
            status=excluded.status,
            current_period_end=excluded.current_period_end,
            cancel_at_period_end=excluded.cancel_at_period_end,
            updated_at=CURRENT_TIMESTAMP`,
    args: [`sub_${subscription.id}`,user.id,plan.id,subscription.id,subscription.status,expiresAt,subscription.cancel_at_period_end ? 1 : 0],
  });
  await audit(user.id, 'stripe.subscription.sync', 'subscription', subscription.id, { status: subscription.status, planId: plan.id });

  const isActive = ['active','trialing'].includes(subscription.status);
  const wasActive = previous && ['active','trialing'].includes(previous.status);
  const planChanged = Boolean(previous && previous.plan_id !== plan.id);
  const shouldNotifyActivation = isActive && (!wasActive || planChanged || !hadLicense.rows[0]);

  if (isActive) {
    const license = await issueLicense({
      userId: user.id,
      planId: plan.id,
      subscriptionId: subscription.id,
      expiresAt,
      actorId: user.id,
    });
    if (shouldNotifyActivation) {
      await Promise.allSettled([
        sendPlanActivated(user, plan),
        sendLicenseIssued(user, plan, license),
      ]);
    }
  }

  if (['canceled','unpaid','incomplete_expired'].includes(subscription.status)) {
    await revokeLicensesForSubscription(subscription.id, user.id);
  }

  return { synced: true, userId: user.id, planId: plan.id, status: subscription.status };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido' });
    await ensureSchema();
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw Object.assign(new Error('Webhook Stripe não configurado'), { statusCode: 503 });

    const stripe = getStripe();
    const signature = req.headers['stripe-signature'];
    if (!signature) return json(res, 400, { ok: false, error: 'Assinatura Stripe ausente' });
    const event = stripe.webhooks.constructEvent(await rawBody(req), signature, process.env.STRIPE_WEBHOOK_SECRET);

    const recorded = await db().execute({
      sql: `INSERT OR IGNORE INTO stripe_events (id,type,event_created) VALUES (?,?,?)`,
      args: [event.id,event.type,Number(event.created || 0)],
    });
    if (!recorded.rowsAffected) return json(res, 200, { received: true, duplicate: true });

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.metadata?.userId && session.customer) {
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
          await db().execute({
            sql: `UPDATE users SET stripe_customer_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            args: [customerId,session.metadata.userId],
          });
        }
        if (session.subscription) {
          const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          await syncSubscription(await stripe.subscriptions.retrieve(id));
        }
      }

      if (['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)) {
        await syncSubscription(event.data.object);
      }
    } catch (processingError) {
      // Permite que o Stripe tente novamente se o processamento real falhar.
      await db().execute({ sql: `DELETE FROM stripe_events WHERE id=?`, args: [event.id] });
      throw processingError;
    }

    return json(res, 200, { received: true });
  } catch (error) { return fail(res, error); }
}
