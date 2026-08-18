import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from '../database.js';
import type { AccountManager } from './account-manager.js';
import type { MessagingProvider, PollInput, SendMediaInput } from './provider.js';

function digits(value: string) { return value.replace(/\D/g, ''); }
function isJid(value: string) { return value.includes('@'); }
function at(value: unknown) { const parsed = Date.parse(String(value ?? '')); return Number.isFinite(parsed) ? parsed : 0; }

export class ChatService {
  constructor(private readonly db: AttozapDatabase, private readonly accounts: AccountManager) {
    accounts.on('message', payload => {
      try {
        const message = payload?.message;
        if (!message?.remoteJid || !message?.id) return;
        const isGroup = message.remoteJid.endsWith('@g.us');
        const canonicalRemote = isGroup ? message.remoteJid : payload?.identity?.jid ?? message.remoteJid;
        const canonicalParticipant = payload?.participantIdentity?.jid ?? message.participant ?? null;
        this.db.prepare(`
          INSERT OR IGNORE INTO message_log
            (id, account_id, remote_jid, participant_jid, direction, message_type, text, status, media_path, file_name, mimetype, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          message.id,
          payload.accountId,
          canonicalRemote,
          canonicalParticipant,
          message.fromMe ? 'out' : 'in',
          message.messageType ?? 'text',
          message.text || null,
          message.fromMe ? 'sent' : 'received',
          message.mediaPath ?? null,
          message.fileName ?? null,
          message.mimetype ?? null,
          JSON.stringify({ ...(message.metadata ?? {}), rawRemoteJid: message.remoteJid, remoteJidAlt: message.remoteJidAlt ?? null }),
          new Date(message.timestamp || Date.now()).toISOString(),
        );
      } catch (error) {
        console.error('[webchat:incoming:persist]', error);
      }
    });
  }

  async ensureAccountLive(accountId: string): Promise<MessagingProvider> {
    return this.accounts.ensureConnected(accountId);
  }

  async sendPresence(accountId: string, target: string, state: 'composing' | 'paused') {
    const provider = await this.ensureAccountLive(accountId);
    const remoteJid = await this.resolveTargetWithProvider(provider, target);
    await provider.sendPresence?.(remoteJid, state);
    return remoteJid;
  }

  listChats(accountId: string, search = '') {
    const term = `%${search.trim()}%`;
    const rows = this.db.prepare(`
      SELECT c.*,
        i.canonical_jid AS identity_jid,
        i.lid AS identity_lid,
        i.pn_jid AS identity_pn_jid,
        i.push_name AS identity_push_name,
        COALESCE(g.subject, i.push_name, c.name) AS display_name,
        (SELECT text FROM message_log m WHERE m.account_id=c.account_id AND (m.remote_jid=c.jid OR m.remote_jid=c.lid OR m.remote_jid=c.pn_jid OR m.remote_jid=i.canonical_jid OR m.remote_jid=i.lid OR m.remote_jid=i.pn_jid) ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_text,
        (SELECT message_type FROM message_log m WHERE m.account_id=c.account_id AND (m.remote_jid=c.jid OR m.remote_jid=c.lid OR m.remote_jid=c.pn_jid OR m.remote_jid=i.canonical_jid OR m.remote_jid=i.lid OR m.remote_jid=i.pn_jid) ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_message_type,
        (SELECT direction FROM message_log m WHERE m.account_id=c.account_id AND (m.remote_jid=c.jid OR m.remote_jid=c.lid OR m.remote_jid=c.pn_jid OR m.remote_jid=i.canonical_jid OR m.remote_jid=i.lid OR m.remote_jid=i.pn_jid) ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_direction,
        (SELECT status FROM message_log m WHERE m.account_id=c.account_id AND (m.remote_jid=c.jid OR m.remote_jid=c.lid OR m.remote_jid=c.pn_jid OR m.remote_jid=i.canonical_jid OR m.remote_jid=i.lid OR m.remote_jid=i.pn_jid) ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_status
      FROM chat_cache c
      LEFT JOIN group_cache g ON g.account_id=c.account_id AND g.group_id=c.jid
      LEFT JOIN wa_identities i ON i.account_id=c.account_id AND (i.canonical_jid=c.jid OR i.lid=c.jid OR i.pn_jid=c.jid)
      WHERE c.account_id=? AND (?='' OR COALESCE(g.subject,i.push_name,c.name,'') LIKE ? OR c.jid LIKE ? OR COALESCE(c.phone,'') LIKE ?)
      ORDER BY c.last_message_at DESC, c.jid ASC
      LIMIT 500
    `).all(accountId, search.trim(), term, term, term) as any[];

    const merged = new Map<string, any>();
    for (const row of rows) {
      const key = String(row.identity_jid || row.jid);
      const normalized = {
        ...row,
        jid: key,
        lid: row.identity_lid ?? row.lid ?? (String(row.jid).endsWith('@lid') ? row.jid : null),
        pn_jid: row.identity_pn_jid ?? row.pn_jid ?? (String(row.jid).endsWith('@s.whatsapp.net') ? row.jid : null),
        display_name: row.display_name || row.identity_push_name || row.name || row.phone || key,
      };
      delete normalized.identity_jid;
      delete normalized.identity_lid;
      delete normalized.identity_pn_jid;
      delete normalized.identity_push_name;
      const previous = merged.get(key);
      if (!previous) { merged.set(key, normalized); continue; }
      const latest = at(normalized.last_message_at) >= at(previous.last_message_at) ? normalized : previous;
      const older = latest === normalized ? previous : normalized;
      merged.set(key, {
        ...older,
        ...latest,
        jid: key,
        lid: latest.lid ?? older.lid,
        pn_jid: latest.pn_jid ?? older.pn_jid,
        phone: latest.phone ?? older.phone,
        name: latest.name ?? older.name,
        display_name: latest.display_name ?? older.display_name,
        profile_url: latest.profile_url ?? older.profile_url,
        message_count: Number(previous.message_count || 0) + Number(normalized.message_count || 0),
      });
    }
    return [...merged.values()].sort((a, b) => at(b.last_message_at) - at(a.last_message_at) || String(a.jid).localeCompare(String(b.jid)));
  }

  listMessages(accountId: string, remoteJid: string, limit = 250) {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 250));
    const identity = this.db.prepare(`
      SELECT canonical_jid, lid, pn_jid FROM wa_identities
      WHERE account_id=? AND (canonical_jid=? OR lid=? OR pn_jid=?) LIMIT 1
    `).get(accountId, remoteJid, remoteJid, remoteJid) as { canonical_jid?: string; lid?: string; pn_jid?: string } | undefined;
    const aliases = [...new Set([remoteJid, identity?.canonical_jid, identity?.lid, identity?.pn_jid].filter(Boolean) as string[])];
    const placeholders = aliases.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT * FROM (
        SELECT rowid AS _seq, * FROM message_log
        WHERE account_id=? AND remote_jid IN (${placeholders})
        ORDER BY created_at DESC, rowid DESC LIMIT ?
      ) ORDER BY created_at ASC, _seq ASC
    `).all(accountId, ...aliases, safeLimit) as any[];
    return rows.map(row => ({
      ...row,
      media_url: row.media_path ? pathToFileURL(String(row.media_path)).href : undefined,
      metadata: (() => { try { return JSON.parse(String(row.metadata_json || '{}')); } catch { return {}; } })(),
    }));
  }

  private async resolveTargetWithProvider(provider: MessagingProvider, target: string) {
    const clean = target.trim();
    if (!clean) throw new Error('Informe o destinatário');
    if (clean.endsWith('@g.us')) return clean;
    if (isJid(clean)) {
      const resolved = await provider.resolveIdentity(clean).catch(() => undefined);
      // PN is the preferred wire address for direct outbound sends when the
      // provider already knows the PN<->LID mapping. LID remains an identity alias.
      return resolved?.pnJid ?? resolved?.jid ?? clean;
    }
    const phone = digits(clean);
    if (!phone) throw new Error('Destinatário inválido');
    const [resolved] = await provider.checkNumbers([phone]);
    if (!resolved?.exists) throw new Error(`O número ${phone} não foi localizado no WhatsApp`);
    return resolved.pnJid ?? resolved.jid ?? `${phone}@s.whatsapp.net`;
  }

  async resolveTarget(accountId: string, target: string) {
    const provider = await this.ensureAccountLive(accountId);
    return this.resolveTargetWithProvider(provider, target);
  }

  async sendText(accountId: string, target: string, text: string) {
    const cleanText = text.trim();
    if (!cleanText) throw new Error('Digite uma mensagem');
    const provider = await this.ensureAccountLive(accountId);
    const remoteJid = await this.resolveTargetWithProvider(provider, target);
    try {
      const result = await provider.sendText(remoteJid, cleanText);
      const canonical = await this.canonicalJid(accountId, result.remoteJid || remoteJid);
      this.log(result.id, accountId, canonical, 'text', cleanText, 'pending', undefined, undefined, undefined, undefined, { transportJid: remoteJid });
      await this.touchChat(accountId, canonical);
      return { ...result, remoteJid: canonical, resolvedTarget: canonical, transportJid: remoteJid };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(randomUUID(), accountId, remoteJid, 'text', cleanText, 'failed', message);
      throw new Error(`Falha ao enviar para ${remoteJid}: ${message}`);
    }
  }

  async sendMedia(accountId: string, target: string, type: 'image'|'video'|'document'|'audio'|'sticker', input: SendMediaInput) {
    const provider = await this.ensureAccountLive(accountId);
    const remoteJid = await this.resolveTargetWithProvider(provider, target);
    try {
      const result = type === 'image' ? await provider.sendImage(remoteJid, input)
        : type === 'video' ? await provider.sendVideo(remoteJid, input)
        : type === 'document' ? await provider.sendDocument(remoteJid, input)
        : type === 'audio' ? await provider.sendAudio(remoteJid, input)
        : await provider.sendSticker(remoteJid, input);
      const canonical = await this.canonicalJid(accountId, result.remoteJid || remoteJid);
      this.log(result.id, accountId, canonical, type, input.caption ?? input.fileName ?? '', 'pending', undefined, input.path, input.fileName, input.mimetype, { ptt: input.ptt ?? false, transportJid: remoteJid });
      await this.touchChat(accountId, canonical);
      return { ...result, remoteJid: canonical, resolvedTarget: canonical, transportJid: remoteJid };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(randomUUID(), accountId, remoteJid, type, input.caption ?? input.fileName ?? '', 'failed', message, input.path, input.fileName, input.mimetype);
      throw new Error(`Falha ao enviar ${type} para ${remoteJid}: ${message}`);
    }
  }

  async sendPoll(accountId: string, target: string, input: PollInput) {
    const provider = await this.ensureAccountLive(accountId);
    const remoteJid = await this.resolveTargetWithProvider(provider, target);
    const question = input.name.trim();
    const values = [...new Set(input.values.map(item => item.trim()).filter(Boolean))].slice(0, 12);
    if (!question || values.length < 2) throw new Error('A enquete precisa de pergunta e pelo menos duas opções');
    try {
      const result = await provider.sendPoll(remoteJid, { name: question, values, selectableCount: Math.max(1, Math.min(values.length, input.selectableCount ?? 1)) });
      const canonical = await this.canonicalJid(accountId, result.remoteJid || remoteJid);
      this.log(result.id, accountId, canonical, 'poll', question, 'pending', undefined, undefined, undefined, undefined, { question, options: values, selectableCount: input.selectableCount ?? 1, transportJid: remoteJid });
      await this.touchChat(accountId, canonical);
      return { ...result, remoteJid: canonical, resolvedTarget: canonical, transportJid: remoteJid };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(randomUUID(), accountId, remoteJid, 'poll', question, 'failed', message, undefined, undefined, undefined, { question, options: values });
      throw new Error(`Falha ao enviar enquete para ${remoteJid}: ${message}`);
    }
  }

  private async canonicalJid(accountId: string, jid: string) {
    if (jid.endsWith('@g.us')) return jid;
    try { return (await this.ensureAccountLive(accountId)).resolveIdentity(jid).then(identity => identity.jid || jid); }
    catch { return jid; }
  }

  private log(id: string, accountId: string, remoteJid: string, type: string, text: string, status: string, error?: string, mediaPath?: string, fileName?: string, mimetype?: string, metadata?: unknown) {
    const existing = this.db.prepare(`SELECT status,created_at FROM message_log WHERE account_id=? AND id=? LIMIT 1`).get(accountId, id) as { status?: string; created_at?: string } | undefined;
    const keepExistingStatus = status === 'pending' && existing?.status && !['pending', 'failed'].includes(existing.status);
    const finalStatus = keepExistingStatus ? existing!.status! : status;
    const createdAt = existing?.created_at ?? new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO message_log
        (id, account_id, remote_jid, direction, message_type, text, status, error, media_path, file_name, mimetype, metadata_json, created_at)
      VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, accountId, remoteJid, type, text || null, finalStatus, error ?? null, mediaPath ?? null, fileName ?? null, mimetype ?? null, JSON.stringify(metadata ?? {}), createdAt);
  }

  private async touchChat(accountId: string, remoteJid: string) {
    const provider = await this.ensureAccountLive(accountId);
    const canonical = await this.canonicalJid(accountId, remoteJid);
    const identity = canonical.endsWith('@g.us') ? undefined : await provider.resolveIdentity(canonical).catch(() => undefined);
    const profileUrl = await provider.profilePictureUrl(canonical).catch(() => undefined);
    const existing = this.db.prepare(`SELECT jid FROM chat_cache WHERE account_id=? AND (jid=? OR lid=? OR pn_jid=?) LIMIT 1`).get(accountId, canonical, canonical, canonical) as { jid?: string } | undefined;
    const now = new Date().toISOString();
    if (existing?.jid) {
      this.db.prepare(`UPDATE chat_cache SET message_count=message_count+1,last_message_at=?,profile_url=COALESCE(?,profile_url),lid=COALESCE(?,lid),pn_jid=COALESCE(?,pn_jid),phone=COALESCE(?,phone) WHERE account_id=? AND jid=?`).run(now, profileUrl ?? null, identity?.lid ?? null, identity?.pnJid ?? null, identity?.phone ?? null, accountId, existing.jid);
    } else {
      this.db.prepare(`
        INSERT INTO chat_cache (account_id,jid,lid,pn_jid,phone,name,is_group,message_count,first_message_at,last_message_at,profile_url)
        VALUES (?,?,?,?,?,NULL,?,1,?,?,?)
      `).run(accountId, canonical, identity?.lid ?? null, identity?.pnJid ?? null, identity?.phone ?? null, canonical.endsWith('@g.us') ? 1 : 0, now, now, profileUrl ?? null);
    }
  }
}
