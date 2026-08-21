import { audit } from './_lib/db.js';
import { clearSessionCookie, createSession, currentUser, loginUser, publicUser, registerUser, setSessionCookie } from './_lib/auth.js';
import { sendWelcome } from './_lib/email.js';
import { body, fail, json } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const user = await currentUser(req);
      return json(res, 200, { ok: true, user: publicUser(user) });
    }
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido' });
    const input = await body(req);
    const action = String(input.action || 'login');

    if (action === 'register') {
      const user = await registerUser(input);
      const token = await createSession(user);
      setSessionCookie(res, token);
      let emailSent = true;
      try { await sendWelcome(user); }
      catch (error) { emailSent = false; console.error('[welcome-email]', error); }
      return json(res, 201, { ok: true, user: publicUser(user), emailSent });
    }

    if (action === 'login') {
      const user = await loginUser(input.email, input.password);
      const token = await createSession(user);
      setSessionCookie(res, token);
      return json(res, 200, { ok: true, user: publicUser(user) });
    }

    if (action === 'logout') {
      const user = await currentUser(req);
      if (user) await audit(user.id, 'user.logout', 'user', user.id);
      clearSessionCookie(res);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { ok: false, error: 'Ação de autenticação inválida' });
  } catch (error) { return fail(res, error); }
}
