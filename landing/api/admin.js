import { randomUUID } from 'node:crypto';
import { audit, db, ensureSchema, publicPlan, publicUser, safeJson } from './_lib/db.js';
import { requireAdmin } from './_lib/auth.js';
import { issueLicense, resignLicense } from './_lib/license.js';
import { sendLicenseIssued, sendReleaseNotice } from './_lib/email.js';
import { body, fail, json } from './_lib/http.js';

const licensePlans = new Set(['solo','solo_plus','solo_pro','team','team_plus','team_pro','enterprise']);
const releaseChannels = new Set(['stable','beta','rc']);

function licenseView(row) {
  return {
    id: row.id, userId: row.user_id, userName: row.user_name, userEmail: row.user_email,
    planId: row.plan_id, planName: row.plan_name, status: row.status, key: row.license_key,
    fingerprint: row.fingerprint, issuedAt: row.issued_at, expiresAt: row.expires_at,
    maxSeats: row.max_seats, maxInstances: row.max_instances, features: safeJson(row.features_json),
  };
}

function positiveInt(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const admin = await requireAdmin(req);

    if (req.method === 'GET') {
      const [users, plans, licenses, releases, subscriptions, auditRows] = await Promise.all([
        db().execute(`SELECT id,name,email,role,status,stripe_customer_id,created_at,updated_at FROM users ORDER BY created_at DESC LIMIT 500`),
        db().execute(`SELECT * FROM plans ORDER BY sort_order ASC,name ASC`),
        db().execute(`SELECT l.*,u.name AS user_name,u.email AS user_email,p.name AS plan_name FROM licenses l JOIN users u ON u.id=l.user_id JOIN plans p ON p.id=l.plan_id ORDER BY l.created_at DESC LIMIT 500`),
        db().execute(`SELECT * FROM releases ORDER BY published_at DESC LIMIT 100`),
        db().execute(`SELECT s.*,u.name AS user_name,u.email AS user_email,p.name AS plan_name FROM subscriptions s JOIN users u ON u.id=s.user_id JOIN plans p ON p.id=s.plan_id ORDER BY s.updated_at DESC LIMIT 500`),
        db().execute(`SELECT a.*,u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100`),
      ]);
      return json(res, 200, {
        ok: true, admin: publicUser(admin),
        users: users.rows.map(publicUser), plans: plans.rows.map(publicPlan), licenses: licenses.rows.map(licenseView),
        releases: releases.rows.map(row => ({ id: row.id, version: row.version, channel: row.channel, downloadUrl: row.download_url, notes: row.notes, mandatory: Boolean(row.mandatory), active: Boolean(row.active), publishedAt: row.published_at })),
        subscriptions: subscriptions.rows.map(row => ({ id: row.id, userId: row.user_id, userName: row.user_name, userEmail: row.user_email, planId: row.plan_id, planName: row.plan_name, status: row.status, currentPeriodEnd: row.current_period_end, cancelAtPeriodEnd: Boolean(row.cancel_at_period_end) })),
        audit: auditRows.rows.map(row => ({ id: row.id, userId: row.user_id, userName: row.user_name, action: row.action, entityType: row.entity_type, entityId: row.entity_id, metadata: safeJson(row.metadata_json, {}), createdAt: row.created_at })),
      });
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido' });
    const input = await body(req);
    const action = String(input.action || '');

    if (action === 'updateUser') {
      const id = String(input.id || '');
      if (!id) throw Object.assign(new Error('Usuário não informado'), { statusCode: 400 });
      const found = await db().execute({ sql: `SELECT id,role,status FROM users WHERE id=? LIMIT 1`, args: [id] });
      const target = found.rows[0];
      if (!target) throw Object.assign(new Error('Usuário não encontrado'), { statusCode: 404 });
      const role = ['customer','admin'].includes(input.role) ? input.role : target.role;
      const status = ['active','blocked'].includes(input.status) ? input.status : target.status;
      if (id === admin.id && (role !== 'admin' || status !== 'active')) throw Object.assign(new Error('Você não pode remover seu próprio acesso administrativo'), { statusCode: 400 });
      if (target.role === 'admin' && target.status === 'active' && (role !== 'admin' || status !== 'active')) {
        const remaining = await db().execute({ sql: `SELECT COUNT(*) AS total FROM users WHERE role='admin' AND status='active' AND id<>?`, args: [id] });
        if (Number(remaining.rows[0]?.total || 0) < 1) throw Object.assign(new Error('É necessário manter pelo menos um administrador ativo'), { statusCode: 409 });
      }
      await db().execute({ sql: `UPDATE users SET role=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, args: [role,status,id] });
      await audit(admin.id, 'admin.user.update', 'user', id, { role, status });
      return json(res, 200, { ok: true });
    }

    if (action === 'savePlan') {
      const id = String(input.id || `plan_${randomUUID()}`);
      const slug = String(input.slug || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const name = String(input.name || '').trim();
      const licensePlan = String(input.licensePlan || 'solo');
      if (!slug || !name) throw Object.assign(new Error('Informe nome e slug do plano'), { statusCode: 400 });
      if (!licensePlans.has(licensePlan)) throw Object.assign(new Error('Plano de licença incompatível com o desktop'), { statusCode: 400 });
      const priceCents = input.priceCents == null || input.priceCents === '' ? null : Math.floor(Number(input.priceCents));
      if (priceCents != null && (!Number.isFinite(priceCents) || priceCents < 0)) throw Object.assign(new Error('Preço inválido'), { statusCode: 400 });
      const stripePriceId = String(input.stripePriceId || '').trim() || null;
      if (stripePriceId && !/^price_[A-Za-z0-9]+$/.test(stripePriceId)) throw Object.assign(new Error('Stripe Price ID inválido'), { statusCode: 400 });
      const features = Array.isArray(input.features) ? input.features.map(value => String(value).trim()).filter(Boolean) : [];
      await db().execute({
        sql: `INSERT INTO plans (id,slug,name,description,price_cents,currency,interval,license_plan,max_seats,max_instances,features_json,stripe_price_id,active,featured,sort_order)
              VALUES (?,?,?,?,?,'brl','month',?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,name=excluded.name,description=excluded.description,price_cents=excluded.price_cents,license_plan=excluded.license_plan,max_seats=excluded.max_seats,max_instances=excluded.max_instances,features_json=excluded.features_json,stripe_price_id=COALESCE(excluded.stripe_price_id,plans.stripe_price_id),active=excluded.active,featured=excluded.featured,sort_order=excluded.sort_order,updated_at=CURRENT_TIMESTAMP`,
        args: [id,slug,name,String(input.description || ''),priceCents,licensePlan,positiveInt(input.maxSeats),positiveInt(input.maxInstances),JSON.stringify(features),stripePriceId,input.active === false ? 0 : 1,input.featured ? 1 : 0,Math.floor(Number(input.sortOrder || 0))],
      });
      await audit(admin.id, 'admin.plan.save', 'plan', id, { slug, name });
      return json(res, 200, { ok: true, id });
    }

    if (action === 'issueLicense') {
      const userId = String(input.userId || '');
      const planId = String(input.planId || '');
      const license = await issueLicense({ userId, planId, expiresAt: input.expiresAt || null, fingerprint: input.fingerprint || undefined, actorId: admin.id });
      const user = (await db().execute({ sql: `SELECT * FROM users WHERE id=?`, args: [userId] })).rows[0];
      const plan = (await db().execute({ sql: `SELECT * FROM plans WHERE id=?`, args: [planId] })).rows[0];
      if (user && plan) void sendLicenseIssued(user, plan, license).catch(error => console.error('[license-email]', error));
      return json(res, 201, { ok: true, license: licenseView({ ...license, user_name: user?.name, user_email: user?.email, plan_name: plan?.name }) });
    }

    if (action === 'revokeLicense') {
      const id = String(input.id || '');
      const found = await db().execute({ sql: `SELECT id,status FROM licenses WHERE id=? LIMIT 1`, args: [id] });
      if (!found.rows[0]) throw Object.assign(new Error('Licença não encontrada'), { statusCode: 404 });
      if (found.rows[0].status !== 'active') throw Object.assign(new Error('A licença já não está ativa'), { statusCode: 409 });
      await db().execute({ sql: `UPDATE licenses SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'`, args: [id] });
      await audit(admin.id, 'admin.license.revoke', 'license', id);
      return json(res, 200, { ok: true });
    }

    if (action === 'resetFingerprint') {
      const id = String(input.id || '');
      const found = await db().execute({ sql: `SELECT id,status FROM licenses WHERE id=? LIMIT 1`, args: [id] });
      if (!found.rows[0]) throw Object.assign(new Error('Licença não encontrada'), { statusCode: 404 });
      if (found.rows[0].status !== 'active') throw Object.assign(new Error('Somente licenças ativas podem ter o fingerprint redefinido'), { statusCode: 409 });
      await resignLicense(id, { fingerprint: null, actorId: admin.id });
      await audit(admin.id, 'admin.license.fingerprint.reset', 'license', id);
      return json(res, 200, { ok: true });
    }

    if (action === 'saveRelease') {
      const id = String(input.id || `release_${randomUUID()}`);
      const version = String(input.version || '').trim();
      const channel = String(input.channel || 'stable').toLowerCase();
      const downloadUrl = String(input.downloadUrl || '').trim();
      if (!version || version.length > 80) throw Object.assign(new Error('Informe uma versão válida'), { statusCode: 400 });
      if (!releaseChannels.has(channel)) throw Object.assign(new Error('Canal de release inválido'), { statusCode: 400 });
      let parsedUrl;
      try { parsedUrl = new URL(downloadUrl); } catch { throw Object.assign(new Error('URL de download inválida'), { statusCode: 400 }); }
      if (parsedUrl.protocol !== 'https:') throw Object.assign(new Error('A URL de download deve usar HTTPS'), { statusCode: 400 });
      const release = { id, version, channel, download_url: downloadUrl, notes: String(input.notes || '').slice(0, 10000), mandatory: input.mandatory ? 1 : 0, active: input.active === false ? 0 : 1 };
      await db().execute({
        sql: `INSERT INTO releases (id,version,channel,download_url,notes,mandatory,active,published_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET version=excluded.version,channel=excluded.channel,download_url=excluded.download_url,notes=excluded.notes,mandatory=excluded.mandatory,active=excluded.active,published_at=CURRENT_TIMESTAMP`,
        args: [id,release.version,release.channel,release.download_url,release.notes,release.mandatory,release.active],
      });
      await audit(admin.id, 'admin.release.save', 'release', id, { version, notify: Boolean(input.notify) });
      let emailSummary = null;
      if (input.notify) {
        const users = await db().execute(`SELECT name,email FROM users WHERE status='active'`);
        const payload = { ...release, mandatory: Boolean(release.mandatory) };
        const results = await Promise.allSettled(users.rows.map(user => sendReleaseNotice(user, payload)));
        emailSummary = {
          total: results.length,
          sent: results.filter(item => item.status === 'fulfilled').length,
          failed: results.filter(item => item.status === 'rejected').length,
        };
      }
      return json(res, 200, { ok: true, id, emailSummary });
    }

    if (action === 'toggleRelease') {
      const id = String(input.id || '');
      const found = await db().execute({ sql: `SELECT id FROM releases WHERE id=? LIMIT 1`, args: [id] });
      if (!found.rows[0]) throw Object.assign(new Error('Release não encontrada'), { statusCode: 404 });
      await db().execute({ sql: `UPDATE releases SET active=? WHERE id=?`, args: [input.active ? 1 : 0,id] });
      await audit(admin.id, 'admin.release.toggle', 'release', id, { active: Boolean(input.active) });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { ok: false, error: 'Ação administrativa inválida' });
  } catch (error) { return fail(res, error); }
}
