import { db, ensureSchema } from './_lib/db.js';
import { json } from './_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido' });

  try {
    await ensureSchema();
    await db().execute('SELECT 1 AS healthy');

    return json(res, 200, {
      ok: true,
      database: 'ok',
      services: {
        auth: Boolean((process.env.AUTH_SECRET || '').length >= 32 || (process.env.TURSO_AUTH_TOKEN || '').length >= 32),
        email: Boolean(process.env.RESEND_API_KEY),
        stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
        mercadoPago: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.MERCADOPAGO_WEBHOOK_SECRET),
        licensing: Boolean(process.env.LICENSE_PRIVATE_KEY),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[portal-health]', error);
    return json(res, 503, { ok: false, database: 'error', error: 'Portal indisponível' });
  }
}
