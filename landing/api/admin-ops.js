import { randomUUID } from 'node:crypto';
import { assertAdmin, requireStaff } from './_lib/auth.js';
import { audit, db, ensureSchema, safeJson } from './_lib/db.js';
import { body, fail, json } from './_lib/http.js';
import { notifyUser } from './_lib/notifications.js';
import { ensurePlatformSchema, getSetting, setSetting } from './_lib/platform.js';

function serviceStatus() {
  return {
    turso: Boolean(process.env.TURSO_DATABASE_URL),
    auth: Boolean((process.env.AUTH_SECRET || '').length >= 32 || (process.env.TURSO_AUTH_TOKEN || '').length >= 32),
    adminBootstrap: Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD),
    resend: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM),
    recaptcha: Boolean(process.env.RECAPTCHA_SECRET_KEY && process.env.VITE_RECAPTCHA_SITE_KEY),
    mercadoPago: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.MERCADOPAGO_WEBHOOK_SECRET),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    licensing: Boolean(process.env.LICENSE_PRIVATE_KEY),
  };
}

export default async function handler(req, res) {
  try {
    await ensureSchema();
    await ensurePlatformSchema();
    const staff = await requireStaff(req);

    if (req.method === 'GET') {
      const [users, payments, subscriptions, licenses, releases, referrals, rewards] = await Promise.all([
        db().execute(`SELECT role,status,COUNT(*) AS total FROM users GROUP BY role,status`),
        db().execute(`SELECT provider,method,status,COUNT(*) AS total,COALESCE(SUM(amount_cents),0) AS amount FROM payments GROUP BY provider,method,status`),
        db().execute(`SELECT provider,status,COUNT(*) AS total FROM subscriptions GROUP BY provider,status`),
        db().execute(`SELECT status,COUNT(*) AS total FROM licenses GROUP BY status`),
        db().execute(`SELECT channel,COUNT(*) AS total FROM releases WHERE active=1 GROUP BY channel`),
        db().execute(`SELECT r.id,r.status,r.created_at,r.qualified_at,ref.name AS referrer_name,ref.email AS referrer_email,ind.name AS referred_name,ind.email AS referred_email FROM referrals r JOIN users ref ON ref.id=r.referrer_user_id JOIN users ind ON ind.id=r.referred_user_id ORDER BY r.created_at DESC LIMIT 300`),
        db().execute(`SELECT rr.*,u.name AS referrer_name,u.email AS referrer_email FROM referral_rewards rr JOIN users u ON u.id=rr.referrer_user_id ORDER BY rr.created_at DESC LIMIT 300`),
      ]);
      return json(res, 200, {
        ok: true,
        operator: { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
        services: serviceStatus(),
        referralRewardCents: Number(await getSetting('referral_reward_cents', 1000)) || 1000,
        metrics: {
          users: users.rows,
          payments: payments.rows,
          subscriptions: subscriptions.rows,
          licenses: licenses.rows,
          releases: releases.rows,
        },
        referrals: referrals.rows.map(row => ({ id: row.id, status: row.status, referrerName: row.referrer_name, referrerEmail: row.referrer_email, referredName: row.referred_name, referredEmail: row.referred_email, createdAt: row.created_at, qualifiedAt: row.qualified_at })),
        rewards: rewards.rows.map(row => ({ id: row.id, referralId: row.referral_id, referrerName: row.referrer_name, referrerEmail: row.referrer_email, amountCents: Number(row.amount_cents || 0), status: row.status, availableAt: row.available_at, paidAt: row.paid_at, note: row.note, createdAt: row.created_at })),
      });
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido' });
    const input = await body(req);
    const action = String(input.action || '');

    if (action === 'setReferralReward') {
      assertAdmin(staff);
      const amountCents = Math.floor(Number(input.amountCents));
      if (!Number.isFinite(amountCents) || amountCents < 0 || amountCents > 1000000) throw Object.assign(new Error('Valor de recompensa inválido'), { statusCode: 400 });
      await setSetting('referral_reward_cents', amountCents);
      await audit(staff.id, 'admin.referral.reward.config', 'setting', 'referral_reward_cents', { amountCents });
      return json(res, 200, { ok: true, amountCents });
    }

    if (action === 'updateReward') {
      assertAdmin(staff);
      const id = String(input.id || '');
      const status = String(input.status || '');
      if (!['pending','available','paid','void'].includes(status)) throw Object.assign(new Error('Status de recompensa inválido'), { statusCode: 400 });
      const reward = (await db().execute({ sql: `SELECT * FROM referral_rewards WHERE id=? LIMIT 1`, args: [id] })).rows[0];
      if (!reward) throw Object.assign(new Error('Recompensa não encontrada'), { statusCode: 404 });
      await db().execute({
        sql: `UPDATE referral_rewards SET status=?,paid_at=CASE WHEN ?='paid' THEN CURRENT_TIMESTAMP ELSE paid_at END,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        args: [status,status,String(input.note || '').slice(0,500) || null,id],
      });
      await audit(staff.id, 'admin.referral.reward.update', 'referral_reward', id, { status });
      await notifyUser(reward.referrer_user_id, { type:'referral', title:'Recompensa atualizada', message:`O status da sua recompensa foi atualizado para ${status}.`, metadata:{ rewardId:id } }).catch(()=>{});
      return json(res, 200, { ok: true });
    }

    if (action === 'broadcastNotification') {
      assertAdmin(staff);
      const title = String(input.title || '').trim().slice(0,120);
      const message = String(input.message || '').trim().slice(0,1200);
      const type = ['info','warning','success','update'].includes(String(input.type)) ? String(input.type) : 'info';
      if (!title || !message) throw Object.assign(new Error('Informe título e mensagem'), { statusCode: 400 });
      const users = await db().execute(`SELECT id FROM users WHERE status='active' LIMIT 5000`);
      const results = await Promise.allSettled(users.rows.map(row => notifyUser(row.id, { type, title, message, metadata:{ broadcastId: randomUUID() } })));
      await audit(staff.id, 'admin.notification.broadcast', 'notification', null, { title, total: results.length });
      return json(res, 200, { ok: true, total: results.length, sent: results.filter(item => item.status === 'fulfilled').length });
    }

    return json(res, 400, { ok: false, error: 'Ação operacional inválida' });
  } catch (error) { return fail(res, error); }
}
