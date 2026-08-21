import Stripe from 'stripe';
import { audit, db, ensureSchema } from './_lib/db.js';
import { issueLicense, revokeLicensesForSubscription } from './_lib/license.js';
import { sendLicenseIssued, sendPlanActivated } from './_lib/email.js';
import { fail, json, rawBody } from './_lib/http.js';

export const config = { api: { bodyParser: false } };

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY não configurada');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
};

async function syncSubscription(subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;
  const userResult = await db().execute({ sql: `SELECT * FROM users WHERE stripe_customer_id=? LIMIT 1`, args: [customerId] });
  const user = userResult.rows[0];
  if (!user) return;
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id || '';
  const metadataPlanId = subscription.metadata?.planId || '';
  const planResult = await db().execute({ sql: `SELECT * FROM plans WHERE id=? OR stripe_price_id=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1`, args: [metadataPlanId,priceId,metadataPlanId] });
  const plan = planResult.rows[0];
  if (!plan) return;
  const expiresAt = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
  await db().execute({
    sql: `INSERT INTO subscriptions (id,user_id,plan_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(stripe_subscription_id) DO UPDATE SET plan_id=excluded.plan_id,status=excluded.status,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=CURRENT_TIMESTAMP`,
    args: [`sub_${subscription.id}`,user.id,plan.id,subscription.id,subscription.status,expiresAt,subscription.cancel_at_period_end ? 1 : 0],
  });
  await audit(user.id, 'stripe.subscription.sync', 'subscription', subscription.id, { status: subscription.status, planId: plan.id });
  if (['active','trialing'].includes(subscription.status)) {
    const license = await issueLicense({ userId: user.id, planId: plan.id, subscriptionId: subscription.id, expiresAt, actorId: user.id });
    void sendPlanActivated(user, plan).catch(console.error);
    void sendLicenseIssued(user, plan, license).catch(console.error);
  }
  if (['canceled','unpaid','incomplete_expired'].includes(subscription.status)) {
    await revokeLicensesForSubscription(subscription.id, user.id);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido' });
    await ensureSchema();
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET não configurado');
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.metadata?.userId && session.customer) {
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
        await db().execute({ sql: `UPDATE users SET stripe_customer_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, args: [customerId,session.metadata.userId] });
      }
      if (session.subscription) {
        const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        await syncSubscription(await stripe.subscriptions.retrieve(id));
      }
    }
    if (['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)) await syncSubscription(event.data.object);
    return json(res, 200, { received: true });
  } catch (error) { return fail(res, error); }
}
