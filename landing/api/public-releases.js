import { db, ensureSchema } from './_lib/db.js';
import { fail, json } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido' });
    await ensureSchema();
    const result = await db().execute(`SELECT id,version,channel,download_url,notes,mandatory,published_at FROM releases WHERE active=1 ORDER BY published_at DESC LIMIT 50`);
    return json(res, 200, {
      ok: true,
      releases: result.rows.map(row => ({
        id: row.id, version: row.version, channel: row.channel, downloadUrl: row.download_url,
        notes: row.notes || '', mandatory: Boolean(row.mandatory), publishedAt: row.published_at,
      })),
    });
  } catch (error) { return fail(res, error); }
}
