import { createHash, randomBytes } from 'node:crypto';
import { audit, db, normalizeEmail } from './db.js';
import { ensurePlatformSchema, getSetting, newId } from './platform.js';
import { notifyUser } from './notifications.js';
import { sendReferralReward } from './email.js';

const APP_URL = String(process.env.APP_URL || 'https://attozap.orbitalcode.shop').replace(/\/$/, '');

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
}

function randomCode() {
  return `ATTO-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export async function ensureReferralCode(userId) {
  await ensurePlatformSchema();
  const existing = (await db().execute({ sql: `SELECT code FROM referral_codes WHERE user_id=? LIMIT 1`, args: [userId] })).rows[0];
  if (existing?.code) return String(existing.code);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    try {
      await db().execute({ sql: `INSERT INTO referral_codes (user_id,code) VALUES (?,?)`, args: [userId,code] });
      return code;
    } catch (error) {
      if (!String(error?.message || error).toLowerCase().includes('unique')) throw error;
    }
  }
  throw new Error('Não foi possível gerar seu código de indicação');
}

export async function applyReferralCode(referredUserId, rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { applied: false };
  await ensurePlatformSchema();
  const owner = (await db().execute({
    sql: `SELECT rc.user_id,u.email FROM referral_codes rc JOIN users u ON u.id=rc.user_id WHERE rc.code=? AND u.status='active' LIMIT 1`,
    args: [code],
  })).rows[0];
  if (!owner || owner.user_id === referredUserId) return { applied: false };
  const exists = (await db().execute({ sql: `SELECT id FROM referrals WHERE referred_user_id=? LIMIT 1`, args: [referredUserId] })).rows[0];
  if (exists) return { applied: false, existing: true };
  const referralId = newId('ref');
  const rewardId = newId('reward');
  const reward = Number(await getSetting('referral_reward_cents', 1000)) || 1000;
  await db().batch([
    { sql: `INSERT INTO referrals (id,referrer_user_id,referred_user_id,code,status) VALUES (?,?,?,?, 'signup')`, args: [referralId,owner.user_id,referredUserId,code] },
    { sql: `INSERT INTO referral_rewards (id,referral_id,referrer_user_id,amount_cents,status) VALUES (?,?,?,?, 'pending')`, args: [rewardId,referralId,owner.user_id,reward] },
  ], 'write');
  await audit(referredUserId, 'referral.applied', 'referral', referralId, { referrerUserId: owner.user_id, code });
  await notifyUser(owner.user_id, { type: 'referral', title: 'Nova indicação', message: 'Uma pessoa se cadastrou usando seu link. A recompensa é liberada após o primeiro pagamento aprovado.', metadata: { referralId } }).catch(() => {});
  return { applied: true, referralId };
}

export async function qualifyReferralForUser(referredUserId, sourceId) {
  await ensurePlatformSchema();
  const referral = (await db().execute({
    sql: `SELECT r.*,rr.id AS reward_id,rr.amount_cents,rr.status AS reward_status,u.name AS referrer_name,u.email AS referrer_email
          FROM referrals r JOIN referral_rewards rr ON rr.referral_id=r.id JOIN users u ON u.id=r.referrer_user_id
          WHERE r.referred_user_id=? LIMIT 1`,
    args: [referredUserId],
  })).rows[0];
  if (!referral || referral.status === 'qualified' || referral.reward_status !== 'pending') return { qualified: false };
  await db().batch([
    { sql: `UPDATE referrals SET status='qualified',qualified_at=CURRENT_TIMESTAMP WHERE id=?`, args: [referral.id] },
    { sql: `UPDATE referral_rewards SET status='available',available_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,note=? WHERE id=?`, args: [`Pagamento aprovado: ${String(sourceId || '')}`.slice(0,240),referral.reward_id] },
  ], 'write');
  await audit(referredUserId, 'referral.qualified', 'referral', referral.id, { sourceId, rewardCents: referral.amount_cents });
  await Promise.allSettled([
    notifyUser(referral.referrer_user_id, { type: 'referral', title: 'Recompensa liberada', message: `Sua indicação realizou o primeiro pagamento. Você ganhou R$ ${(Number(referral.amount_cents || 0)/100).toFixed(2).replace('.',',')}.`, metadata: { referralId: referral.id, rewardId: referral.reward_id } }),
    sendReferralReward({ name: referral.referrer_name, email: referral.referrer_email }, Number(referral.amount_cents || 0)),
  ]);
  return { qualified: true, referralId: referral.id, rewardId: referral.reward_id };
}

export async function memberReferralView(user) {
  await ensurePlatformSchema();
  const code = await ensureReferralCode(user.id);
  const [referrals, rewards] = await Promise.all([
    db().execute({
      sql: `SELECT r.id,r.status,r.qualified_at,r.created_at,u.name,u.email FROM referrals r JOIN users u ON u.id=r.referred_user_id WHERE r.referrer_user_id=? ORDER BY r.created_at DESC LIMIT 100`,
      args: [user.id],
    }),
    db().execute({
      sql: `SELECT id,referral_id,amount_cents,status,available_at,paid_at,note,created_at FROM referral_rewards WHERE referrer_user_id=? ORDER BY created_at DESC LIMIT 100`,
      args: [user.id],
    }),
  ]);
  const rewardRows = rewards.rows.map(row => ({
    id: row.id, referralId: row.referral_id, amountCents: Number(row.amount_cents || 0), status: row.status,
    availableAt: row.available_at, paidAt: row.paid_at, note: row.note, createdAt: row.created_at,
  }));
  const totals = rewardRows.reduce((acc,row) => {
    acc.total += row.amountCents;
    if (row.status === 'available') acc.available += row.amountCents;
    if (row.status === 'paid') acc.paid += row.amountCents;
    if (row.status === 'pending') acc.pending += row.amountCents;
    return acc;
  }, { total:0, available:0, paid:0, pending:0 });
  return {
    code,
    link: `${APP_URL}/cadastro?ref=${encodeURIComponent(code)}`,
    rewardCents: Number(await getSetting('referral_reward_cents', 1000)) || 1000,
    totals,
    referrals: referrals.rows.map(row => ({ id: row.id, name: row.name, email: row.email, status: row.status, qualifiedAt: row.qualified_at, createdAt: row.created_at })),
    rewards: rewardRows,
  };
}
