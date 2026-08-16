import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from '../database.js';
import type { AccountManager } from './account-manager.js';
import type { PollInput, SendMediaInput } from './provider.js';

function digits(value: string) { return value.replace(/\D/g, ''); }
function isJid(value: string) { return value.includes('@'); }

export class ChatService {
  constructor(private readonly db: AttozapDatabase, private readonly accounts: AccountManager) {
    accounts.on('message', payload => {
      const message = payload?.message;
      if (!message?.remoteJid || !message?.id) return;
      this.db.prepare(`
        INSERT OR IGNORE INTO message_log
          (id, account_id, remote_jid, participant_jid, direction, message_type, text, status, media_path, file_name, mimetype, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?)
      `).run(
        message.id,
        payload.accountId,
        message.remoteJid,
        message.participant ?? null,
        message.fromMe ? 'out' : 'in',
        message.messageType ?? 'text',
        message.text || null,
        message.mediaPath ?? null,
        message.fileName ?? null,
        message.mimetype ?? null,
        JSON.stringify(message.metadata ?? {}),
        new Date(message.timestamp || Date.now()).toISOString(),
      );
    });
  }

  listChats(accountId: string, search = '') {
    const term = `%${search.trim()}%`;
    return this.db.prepare(`
      SELECT c.*,
        COALESCE(g.subject, c.name, i.push_name) AS display_name,
        (SELECT text FROM message_log m WHERE m.account_id=c.account_id AND m.remote_jid=c.jid ORDER BY m.created_at DESC LIMIT 1) AS last_text,
        (SELECT message_type FROM message_log m WHERE m.account_id=c.account_id AND m.remote_jid=c.jid ORDER BY m.created_at DESC LIMIT 1) AS last_message_type,
        (SELECT direction FROM message_log m WHERE m.account_id=c.account_id AND m.remote_jid=c.jid ORDER BY m.created_at DESC LIMIT 1) AS last_direction,
        (SELECT status FROM message_log m WHERE m.account_id=c.account_id AND m.remote_jid=c.jid ORDER BY m.created_at DESC LIMIT 1) AS last_status
      FROM chat_cache c
      LEFT JOIN group_cache g ON g.account_id=c.account_id AND g.group_id=c.jid
      LEFT JOIN wa_identities i ON i.account_id=c.account_id AND i.canonical_jid=c.jid
      WHERE c.account_id=? AND (?='' OR COALESCE(g.subject,c.name,i.push_name,'') LIKE ? OR c.jid LIKE ? OR COALESCE(c.phone,'') LIKE ?)
      ORDER BY c.last_message_at DESC
      LIMIT 500
    `).all(accountId, search.trim(), term, term, term);
  }

  listMessages(accountId: string, remoteJid: string, limit = 250) {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 250));
    const rows = this.db.prepare(`
      SELECT * FROM (
        SELECT * FROM message_log
        WHERE account_id=? AND remote_jid=?
        ORDER BY created_at DESC LIMIT ?
      ) ORDER BY created_at ASC
    `).all(accountId, remoteJid, safeLimit) as any[];
    return rows.map(row => ({
      ...row,
      media_url: row.media_path ? pathToFileURL(String(row.media_path)).href : undefined,
      metadata: (() => { try { return JSON.parse(String(row.metadata_json || '{}')); } catch { return {}; } })(),
    }));
  }

  async resolveTarget(accountId: string, target: string) {
    const provider = this.accounts.provider(accountId);
    const clean = target.trim();
    if (!clean) throw new Error('Informe o destinatário');
    if (isJid(clean)) {
      const resolved = await provider.resolveIdentity(clean).catch(() => undefined);
      return resolved?.jid ?? clean;
    }
    const phone = digits(clean);
    if (!phone) throw new Error('Destinatário inválido');
    const [resolved] = await provider.checkNumbers([phone]);
    if (!resolved?.exists) throw new Error(`O número ${phone} não foi localizado no WhatsApp`);
    return resolved.jid ?? resolved.pnJid ?? `${phone}@s.whatsapp.net`;
  }

  async sendText(accountId: string, target: string, text: string) {
    const cleanText = text.trim();
    if (!cleanText) throw new Error('Digite uma mensagem');
    const remoteJid = await this.resolveTarget(accountId, target);
    try {
      const result = await this.accounts.provider(accountId).sendText(remoteJid, cleanText);
      this.log(result.id, accountId, result.remoteJid || remoteJid, 'text', cleanText, 'sent');
      await this.touchChat(accountId, result.remoteJid || remoteJid);
      return { ...result, resolvedTarget: remoteJid };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(randomUUID(), accountId, remoteJid, 'text', cleanText, 'failed', message);
      throw new Error(`Falha ao enviar para ${remoteJid}: ${message}`);
    }
  }

  async sendMedia(accountId: string, target: string, type: 'image'|'video'|'document'|'audio'|'sticker', input: SendMediaInput) {
    const remoteJid = await this.resolveTarget(accountId, target);
    const provider = this.accounts.provider(accountId);
    try {
      const result = type === 'image' ? await provider.sendImage(remoteJid, input)
        : type === 'video' ? await provider.sendVideo(remoteJid, input)
        : type === 'document' ? await provider.sendDocument(remoteJid, input)
        : type === 'audio' ? await provider.sendAudio(remoteJid, input)
        : await provider.sendSticker(remoteJid, input);
      this.log(result.id, accountId, result.remoteJid || remoteJid, type, input.caption ?? input.fileName ?? '', 'sent', undefined, input.path, input.fileName, input.mimetype, { ptt: input.ptt ?? false });
      await this.touchChat(accountId, result.remoteJid || remoteJid);
      return { ...result, resolvedTarget: remoteJid };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(randomUUID(), accountId, remoteJid, type, input.caption ?? input.fileName ?? '', 'failed', message, input.path, input.fileName, input.mimetype);
      throw new Error(`Falha ao enviar ${type} para ${remoteJid}: ${message}`);
    }
  }

  async sendPoll(accountId: string, target: string, input: PollInput) {
    const remoteJid = await this.resolveTarget(accountId, target);
    const question = input.name.trim();
    const values = [...new Set(input.values.map(item => item.trim()).filter(Boolean))].slice(0, 12);
    if (!question || values.length < 2) throw new Error('A enquete precisa de pergunta e pelo menos duas opções');
    try {
      const result = await this.accounts.provider(accountId).sendPoll(remoteJid, { name: question, values, selectableCount: Math.max(1, Math.min(values.length, input.selectableCount ?? 1)) });
      this.log(result.id, accountId, result.remoteJid || remoteJid, 'poll', question, 'sent', undefined, undefined, undefined, undefined, { question, options: values, selectableCount: input.selectableCount ?? 1 });
      await this.touchChat(accountId, result.remoteJid || remoteJid);
      return { ...result, resolvedTarget: remoteJid };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(randomUUID(), accountId, remoteJid, 'poll', question, 'failed', message, undefined, undefined, undefined, { question, options: values });
      throw new Error(`Falha ao enviar enquete para ${remoteJid}: ${message}`);
    }
  }

  private log(id: string, accountId: string, remoteJid: string, type: string, text: string, status: string, error?: string, mediaPath?: string, fileName?: string, mimetype?: string, metadata?: unknown) {
    this.db.prepare(`
      INSERT OR REPLACE INTO message_log
        (id, account_id, remote_jid, direction, message_type, text, status, error, media_path, file_name, mimetype, metadata_json, created_at)
      VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, accountId, remoteJid, type, text || null, status, error ?? null, mediaPath ?? null, fileName ?? null, mimetype ?? null, JSON.stringify(metadata ?? {}));
  }

  private async touchChat(accountId: string, remoteJid: string) {
    const provider = this.accounts.provider(accountId);
    const profileUrl = await provider.profilePictureUrl(remoteJid).catch(() => undefined);
    const existing = this.db.prepare(`SELECT jid FROM chat_cache WHERE account_id=? AND jid=?`).get(accountId, remoteJid);
    if (existing) {
      this.db.prepare(`UPDATE chat_cache SET message_count=message_count+1,last_message_at=CURRENT_TIMESTAMP,profile_url=COALESCE(?,profile_url) WHERE account_id=? AND jid=?`).run(profileUrl ?? null, accountId, remoteJid);
    } else {
      this.db.prepare(`
        INSERT INTO chat_cache (account_id,jid,name,is_group,message_count,first_message_at,last_message_at,profile_url)
        VALUES (?,?,NULL,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)
      `).run(accountId, remoteJid, remoteJid.endsWith('@g.us') ? 1 : 0, profileUrl ?? null);
    }
  }
}
