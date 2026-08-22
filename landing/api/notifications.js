import { db, ensureSchema, safeJson } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { body, fail, json } from './_lib/http.js';

function view(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    metadata: safeJson(row.metadata_json, {}),
    read: Boolean(row.read_at),
    readAt: row.read_at || null,
    createdAt: row.created_at,
  };
}

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const user = await requireUser(req);

    if (req.method === 'GET') {
      const result = await db().execute({
        sql: `SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 60`,
        args: [user.id],
      });
      const unread = result.rows.reduce((total, row) => total + (row.read_at ? 0 : 1), 0);
      return json(res, 200, { ok: true, unread, notifications: result.rows.map(view) });
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido' });
    const input = await body(req);
    const action = String(input.action || '');

    if (action === 'markAllRead') {
      await db().execute({ sql: `UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE user_id=?`, args: [user.id] });
      return json(res, 200, { ok: true });
    }

    if (action === 'markRead') {
      const id = String(input.id || '');
      if (!id) throw Object.assign(new Error('Notificação não informada'), { statusCode: 400 });
      await db().execute({ sql: `UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?`, args: [id,user.id] });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { ok: false, error: 'Ação de notificação inválida' });
  } catch (error) { return fail(res, error); }
}
