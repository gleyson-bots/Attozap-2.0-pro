import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { audit, db, ensureSchema, normalizeEmail } from './_lib/db.js';
import { sendPasswordChanged, sendPasswordReset } from './_lib/email.js';
import { body, fail, json } from './_lib/http.js';
import { ensurePlatformSchema, newId, newToken } from './_lib/platform.js';
import { verifyRecaptcha } from './_lib/recaptcha.js';

function hashToken(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido' });
    await ensureSchema();
    await ensurePlatformSchema();
    const input = await body(req);
    const action = String(input.action || 'request');

    if (action === 'request') {
      await verifyRecaptcha(req, input.recaptchaToken, { siteKeyPresent: Boolean(process.env.VITE_RECAPTCHA_SITE_KEY) });
      const email = normalizeEmail(input.email);
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 200, { ok: true, message: 'Se existir uma conta com este e-mail, enviaremos as instruções.' });
      const user = (await db().execute({ sql: `SELECT id,name,email,status FROM users WHERE email=? LIMIT 1`, args: [email] })).rows[0];
      if (!user || user.status !== 'active') return json(res, 200, { ok: true, message: 'Se existir uma conta com este e-mail, enviaremos as instruções.' });

      await db().execute({ sql: `UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL`, args: [user.id] });
      const token = newToken(32);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await db().execute({
        sql: `INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)`,
        args: [newId('pwd'),user.id,hashToken(token),expiresAt],
      });
      await audit(user.id, 'password.reset.request', 'user', user.id);
      await sendPasswordReset(user, token);
      return json(res, 200, { ok: true, message: 'Se existir uma conta com este e-mail, enviaremos as instruções.' });
    }

    if (action === 'reset') {
      const tokenHash = hashToken(input.token);
      const password = String(input.password || '');
      if (!tokenHash || password.length < 8) throw Object.assign(new Error('Token inválido ou senha com menos de 8 caracteres'), { statusCode: 400 });
      const row = (await db().execute({
        sql: `SELECT t.id,t.user_id,t.expires_at,t.used_at,u.name,u.email,u.status FROM password_reset_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? LIMIT 1`,
        args: [tokenHash],
      })).rows[0];
      if (!row || row.used_at || row.status !== 'active' || new Date(row.expires_at).getTime() < Date.now()) {
        throw Object.assign(new Error('Este link é inválido, expirou ou já foi utilizado'), { statusCode: 400 });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      await db().batch([
        { sql: `UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, args: [passwordHash,row.user_id] },
        { sql: `UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?`, args: [row.id] },
        { sql: `UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL AND id<>?`, args: [row.user_id,row.id] },
      ], 'write');
      await audit(row.user_id, 'password.reset.complete', 'user', row.user_id);
      await sendPasswordChanged({ id: row.user_id, name: row.name, email: row.email }).catch(error => console.error('[password-changed-email]', error));
      return json(res, 200, { ok: true, message: 'Senha alterada com sucesso.' });
    }

    return json(res, 400, { ok: false, error: 'Ação inválida' });
  } catch (error) { return fail(res, error); }
}
