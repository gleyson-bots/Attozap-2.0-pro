import type { AttozapDatabase } from './database.js';

export type DeliverySource = 'all' | 'webchat' | 'campaign' | 'warmup';
export type DeliveryQuery = {
  accountId?: string;
  source?: DeliverySource;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

function parseJson(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizedLimit(value: unknown, fallback = 100) {
  return Math.max(1, Math.min(500, Number(value) || fallback));
}

function normalizedOffset(value: unknown) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export class DeliveryCenter {
  constructor(private readonly db: AttozapDatabase) {}

  query(input: DeliveryQuery = {}) {
    const sourceExpr = `CASE
      WHEN cd.message_id IS NOT NULL THEN 'campaign'
      WHEN wl.message_id IS NOT NULL THEN 'warmup'
      ELSE COALESCE(json_extract(m.metadata_json, '$.source'), 'webchat')
    END`;
    const where = [`m.direction='out'`];
    const params: Array<string | number> = [];

    if (input.accountId?.trim()) {
      where.push('m.account_id=?');
      params.push(input.accountId.trim());
    }
    if (input.status && input.status !== 'all') {
      where.push('m.status=?');
      params.push(input.status);
    }
    if (input.source && input.source !== 'all') {
      where.push(`${sourceExpr}=?`);
      params.push(input.source);
    }
    if (input.search?.trim()) {
      const term = `%${input.search.trim()}%`;
      where.push(`(
        m.id LIKE ? OR m.remote_jid LIKE ? OR m.text LIKE ? OR m.error LIKE ? OR
        i.name LIKE ? OR c.name LIKE ? OR wp.name LIKE ? OR
        json_extract(m.metadata_json, '$.transportJid') LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term, term);
    }

    const filterSql = where.join(' AND ');
    const totalRow = this.db.prepare(`
      SELECT COUNT(*) AS total
      FROM message_log m
      LEFT JOIN instances i ON i.id=m.account_id
      LEFT JOIN campaign_deliveries cd ON cd.account_id=m.account_id AND cd.message_id=m.id
      LEFT JOIN campaigns c ON c.id=cd.campaign_id
      LEFT JOIN warmup_logs wl ON wl.account_id=m.account_id AND wl.message_id=m.id
      LEFT JOIN warmup_profiles wp ON wp.id=wl.profile_id
      WHERE ${filterSql}
    `).get(...params) as { total?: number } | undefined;

    const statusRows = this.db.prepare(`
      SELECT m.status, COUNT(*) AS total
      FROM message_log m
      LEFT JOIN instances i ON i.id=m.account_id
      LEFT JOIN campaign_deliveries cd ON cd.account_id=m.account_id AND cd.message_id=m.id
      LEFT JOIN campaigns c ON c.id=cd.campaign_id
      LEFT JOIN warmup_logs wl ON wl.account_id=m.account_id AND wl.message_id=m.id
      LEFT JOIN warmup_profiles wp ON wp.id=wl.profile_id
      WHERE ${filterSql}
      GROUP BY m.status
      ORDER BY total DESC
    `).all(...params) as Array<{ status?: string; total?: number }>;

    const limit = normalizedLimit(input.limit);
    const offset = normalizedOffset(input.offset);
    const rows = this.db.prepare(`
      SELECT
        m.id,
        m.account_id,
        i.name AS account_name,
        m.remote_jid,
        m.participant_jid,
        m.message_type,
        m.text,
        m.status,
        m.error,
        m.media_path,
        m.file_name,
        m.mimetype,
        m.metadata_json,
        m.created_at,
        ${sourceExpr} AS source,
        cd.campaign_id,
        c.name AS campaign_name,
        cr.target AS recipient_target,
        wl.profile_id AS warmup_profile_id,
        wp.name AS warmup_name,
        json_extract(m.metadata_json, '$.transportJid') AS transport_jid,
        json_extract(m.metadata_json, '$.failureCode') AS failure_code,
        json_extract(m.metadata_json, '$.failureClass') AS failure_class
      FROM message_log m
      LEFT JOIN instances i ON i.id=m.account_id
      LEFT JOIN campaign_deliveries cd ON cd.account_id=m.account_id AND cd.message_id=m.id
      LEFT JOIN campaigns c ON c.id=cd.campaign_id
      LEFT JOIN campaign_recipients cr ON cr.id=cd.recipient_id
      LEFT JOIN warmup_logs wl ON wl.account_id=m.account_id AND wl.message_id=m.id
      LEFT JOIN warmup_profiles wp ON wp.id=wl.profile_id
      WHERE ${filterSql}
      ORDER BY datetime(m.created_at) DESC, m.rowid DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Array<Record<string, unknown>>;

    const items = rows.map(row => ({
      ...row,
      metadata: parseJson(row.metadata_json),
      media_url: row.media_path ? String(row.media_path) : undefined,
      failure_code: row.failure_code ?? (parseJson(row.metadata_json) as any).failureCode ?? undefined,
      failure_class: row.failure_class ?? (parseJson(row.metadata_json) as any).failureClass ?? undefined,
    }));

    return {
      items,
      total: Number(totalRow?.total ?? 0),
      limit,
      offset,
      statusCounts: Object.fromEntries(statusRows.map(row => [String(row.status ?? 'unknown'), Number(row.total ?? 0)])),
      generatedAt: new Date().toISOString(),
    };
  }
}
