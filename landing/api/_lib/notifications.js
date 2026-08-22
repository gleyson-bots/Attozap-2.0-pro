import { randomUUID } from 'node:crypto';
import { db, ensureSchema } from './db.js';

export async function notifyUser(userId, { type = 'info', title, message, metadata = null } = {}) {
  if (!userId || !title || !message) return null;
  await ensureSchema();
  const id = randomUUID();
  await db().execute({
    sql: `INSERT INTO notifications (id,user_id,type,title,message,metadata_json) VALUES (?,?,?,?,?,?)`,
    args: [id,userId,String(type || 'info'),String(title).slice(0,120),String(message).slice(0,1200),metadata ? JSON.stringify(metadata) : null],
  });
  return id;
}

export async function notifyUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  await Promise.allSettled(ids.map(userId => notifyUser(userId, payload)));
}
