import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import type { AttozapDatabase } from '../database.js';
import type { AccountManager } from './account-manager.js';
import type { ContactCardInput, ContactPresence, LocationInput, MessagingProvider, OutboundContent, PollInput, SendMediaInput } from './provider.js';
import { upsertWaIdentity } from './identity-store.js';
import { getCachedMessageStatus, mergeDeliveryStatus, type StoredDeliveryStatus } from './status.js';

function digits(value: string) { return value.replace(/\D/g, ''); }
function isJid(value: string) { return value.includes('@'); }
function at(value: unknown) { const parsed = Date.parse(String(value ?? '')); return Number.isFinite(parsed) ? parsed : 0; }
function jsonObject(value: unknown) { try { const parsed = JSON.parse(String(value ?? '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }

export class ChatService {
  constructor(private readonly db: AttozapDatabase, private readonly accounts: AccountManager) {
    accounts.on('message', payload => {
      try {
        const message = payload?.message;
        if (!message?.remoteJid || !message?.id) return;
        const isGroup = message.remoteJid.endsWith('@g.us');
        const canonicalRemote = isGroup ? message.remoteJid : payload?.identity?.jid ?? message.remoteJid;
        const canonicalParticipant = payload?.participantIdentity?.jid ?? message.participant ?? null;
        const existing = this.db.prepare(`
          SELECT status,error,metadata_json,created_at FROM message_log
          WHERE account_id=? AND id=? LIMIT 1
        `).get(payload.accountId, message.id) as { status?: string; error?: string | null; metadata_json?: string | null; created_at?: string } | undefined;
        const cached = message.fromMe ? getCachedMessageStatus(this.db, payload.accountId, message.id) : undefined;
        let incomingStatus: string = message.fromMe ? (cached?.status ?? 'pending') : 'received';
        let incomingError: string | null = message.fromMe && incomingStatus === 'failed' ? (cached?.error ?? 'WhatsApp rejeitou a mensagem') : null;
        if (message.fromMe && existing?.status) {
          incomingStatus = mergeDeliveryStatus(existing.status, incomingStatus as StoredDeliveryStatus);
          if (incomingStatus === 'failed') incomingError = incomingError ?? existing.error ?? 'WhatsApp rejeitou a mensagem';
        }
        const observedMetadata = { ...(message.metadata ?? {}), rawRemoteJid: message.remoteJid, remoteJidAlt: message.remoteJidAlt ?? null };
        const metadataJson = JSON.stringify({ ...jsonObject(existing?.metadata_json), ...observedMetadata });

        if (existing) {
          this.db.prepare(`
            UPDATE message_log SET
              remote_jid=?, participant_jid=COALESCE(?,participant_jid), direction=?, message_type=?,
              text=COALESCE(?,text), status=?, error=?,
              media_path=COALESCE(?,media_path), file_name=COALESCE(?,file_name), mimetype=COALESCE(?,mimetype),
              metadata_json=?
            WHERE account_id=? AND id=?
          `).run(
            canonicalRemote,
            canonicalParticipant,
            message.fromMe ? 'out' : 'in',
            message.messageType ?? 'text',
            message.text || null,
            incomingStatus,
            incomingError,
            message.mediaPath ?? null,
            message.fileName ?? null,
            message.mimetype ?? null,
            metadataJson,
            payload.accountId,
            message.id,
          );
        } else {
          this.db.prepare(`
            INSERT OR IGNORE INTO message_log
              (id, account_id, remote_jid, participant_jid, direction, message_type, text, status, error, media_path, file_name, mimetype, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            message.id,
            payload.accountId,
            canonicalRemote,
            canonicalParticipant,
            message.fromMe ? 'out' : 'in',
            message.messageType ?? 'text',
            message.text || null,
            incomingStatus,
            incomingError,
            message.mediaPath ?? null,
            message.fileName ?? null,
            message.mimetype ?? null,
            metadataJson,
            new Date(message.timestamp || Date.now()).toISOString(),
          );
        }
      } catch (error) {
        console.error('[webchat:incoming:persist]', error);
      }
    });
  }

  private async cacheProfilePicture(remoteUrl: string | undefined): Promise<string | undefined> {
    if (!remoteUrl || remoteUrl.startsWith('file:')) return remoteUrl;
    try {
      const parsed = new URL(remoteUrl);
      const host = parsed.hostname.toLowerCase();
      const allowedHost = host === 'whatsapp.net' || host.endsWith('.whatsapp.net') || host.endsWith('.fbcdn.net');
      if (parsed.protocol !== 'https:' || !allowedHost) return remoteUrl;

      const response = await fetch(parsed, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return remoteUrl;
      const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';', 1)[0].toLowerCase();
      if (!contentType.startsWith('image/')) return remoteUrl;
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > 5 * 1024 * 1024) return remoteUrl;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) return remoteUrl;

      const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
      const digest = createHash('sha256').update(bytes).digest('hex');
      const directory = join(app.getPath('userData'), 'cache', 'avatars');
      const destination = join(directory, `${digest}.${extension}`);
      await mkdir(directory, { recursive: true });
      const temporary = join(directory, `.${digest}.${process.pid}.tmp`);
      await writeFile(temporary, bytes, { flag: 'w' });
      try {
        await rename(temporary, destination);
      } catch (error: any) {
        if (error?.code !== 'EEXIST') throw error;
      }
      return pathToFileURL(destination).toString();
    } catch (error) {
      console.warn('[webchat:profile-cache]', error instanceof Error ? error.message : String(error));
      return remoteUrl;
    }
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
        COALESCE(i.canonical_jid, i.lid, i.pn_jid, c.lid, c.pn_jid, c.jid) AS identity_jid,
        COALESCE(i.lid, c.lid) AS identity_lid,
        COALESCE(i.pn_jid, c.pn_jid) AS identity_pn_jid,
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

  async refreshProfile(accountId: string, remoteJid: string) {
    const provider = await this.ensureAccountLive(accountId);
    const identity = await provider.resolveIdentity(remoteJid).catch(() => undefined);
    const aliases = [...new Set([remoteJid, identity?.jid, identity?.lid, identity?.pnJid].filter(Boolean) as string[])];
    let profileUrl: string | undefined;
    for (const alias of aliases) {
      profileUrl = await provider.profilePictureUrl(alias).catch(() => undefined);
      if (profileUrl) break;
    }
    const canonical = identity?.jid ?? remoteJid;
    profileUrl = await this.cacheProfilePicture(profileUrl);
    const existing = this.db.prepare(`
      SELECT jid FROM chat_cache
      WHERE account_id=? AND (jid IN (${aliases.map(() => '?').join(',')}) OR lid IN (${aliases.map(() => '?').join(',')}) OR pn_jid IN (${aliases.map(() => '?').join(',')}))
      LIMIT 1
    `).get(accountId, ...aliases, ...aliases, ...aliases) as { jid?: string } | undefined;
    const now = new Date().toISOString();
    if (identity?.jid) upsertWaIdentity(this.db, accountId, identity, 'webchat.profile');
    if (existing?.jid) {
      this.db.prepare(`
        UPDATE chat_cache SET
          profile_url=COALESCE(?,profile_url),
          lid=COALESCE(?,lid),
          pn_jid=COALESCE(?,pn_jid),
          phone=COALESCE(?,phone)
        WHERE account_id=? AND jid=?
      `).run(profileUrl ?? null, identity?.lid ?? null, identity?.pnJid ?? null, identity?.phone ?? null, accountId, existing.jid);
    } else {
      this.db.prepare(`
        INSERT OR IGNORE INTO chat_cache (account_id,jid,lid,pn_jid,phone,name,profile_url,is_group,message_count,first_message_at,last_message_at)
        VALUES (?,?,?,?,?,?,?,0,0,?,?)
      `).run(accountId, canonical, identity?.lid ?? null, identity?.pnJid ?? null, identity?.phone ?? null, remoteJid, profileUrl ?? null, now, now);
    }
    return {
      jid: canonical,
      profilePictureUrl: profileUrl,
      identity,
    };
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

  messageStatus(accountId: string, messageId: string) {
    const row = this.db.prepare(`SELECT id,status,error,created_at FROM message_log WHERE account_id=? AND id=? LIMIT 1`).get(accountId, messageId) as { id?: string; status?: string; error?: string | null; created_at?: string } | undefined;
    if (row) return row;
    const cached = getCachedMessageStatus(this.db, accountId, messageId);
    return cached ? { id: messageId, status: cached.status, error: cached.error ?? null, created_at: cached.updated_at } : undefined;
  }

  private async resolveContactWithProvider(provider: MessagingProvider, target: string): Promise<ContactPresence> {
    const clean = target.trim();
    if (!clean) throw new Error('Informe o destinatário');
    if (clean.endsWith('@g.us')) return { input: clean, jid: clean, exists: true };

    if (isJid(clean)) {
      if (clean.endsWith('@broadcast') || clean.endsWith('@newsletter')) throw new Error('Este identificador não pode ser aberto como conversa direta');
      if (clean.endsWith('@s.whatsapp.net')) {
        const pn = clean.split('@', 1)[0]?.split(':', 1)[0] ?? '';
        const [checked] = await provider.checkNumbers([digits(pn)]);
        if (!checked?.exists || !checked.jid) throw new Error('O PN JID informado não foi confirmado pelo WhatsApp');
        return { ...checked, input: clean, exists: true, phone: checked.phone ?? digits(pn) };
      }
      const resolved = await provider.resolveIdentity(clean).catch(() => undefined);
      if (!resolved?.exists || !resolved.jid || resolved.jid.endsWith('@broadcast') || resolved.jid.endsWith('@newsletter')) {
        throw new Error('O JID/LID informado não pôde ser confirmado pelo WhatsApp');
      }
      if (clean.endsWith('@lid') && !resolved.pnJid && !resolved.phone) {
        throw new Error('O LID informado não possui mapeamento PN confirmado pelo WhatsApp');
      }
      return { ...resolved, input: clean, exists: true };
    }

    const phone = digits(clean);
    if (!phone) throw new Error('Destinatário inválido');
    const [resolved] = await provider.checkNumbers([phone]);
    // Nunca gerar `${phone}@s.whatsapp.net` como fallback: sem retorno do
    // WhatsApp não existe identidade segura para abrir ou enviar a conversa.
    if (!resolved?.exists || !resolved.jid) throw new Error(`O número ${phone} não foi localizado no WhatsApp`);
    return { ...resolved, input: phone, exists: true, phone: resolved.phone ?? phone };
  }

  private async resolveTargetWithProvider(provider: MessagingProvider, target: string) {
    const resolved = await this.resolveContactWithProvider(provider, target);
    return resolved?.lid ?? resolved?.pnJid ?? resolved?.jid ?? (() => { throw new Error('O WhatsApp não devolveu um JID/LID válido'); })();
  }

  private persistResolvedIdentity(accountId: string, identity: ContactPresence) {
    if (!identity.jid || identity.jid.endsWith('@g.us')) return;
    upsertWaIdentity(this.db, accountId, identity, 'webchat.resolve');
  }

  async resolveTarget(accountId: string, target: string) {
    const provider = await this.ensureAccountLive(accountId);
    const resolved = await this.resolveContactWithProvider(provider, target);
    this.persistResolvedIdentity(accountId, resolved);
    return resolved;
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

  async sendContent(accountId: string, target: string, content: OutboundContent) {
    switch (content.type) {
      case 'text': return this.sendText(accountId, target, content.text);
      case 'image': return this.sendMedia(accountId, target, 'image', content.input);
      case 'video': return this.sendMedia(accountId, target, 'video', content.input);
      case 'document': return this.sendMedia(accountId, target, 'document', content.input);
      case 'audio': return this.sendMedia(accountId, target, 'audio', content.input);
      case 'sticker': return this.sendMedia(accountId, target, 'sticker', content.input);
      case 'poll': return this.sendPoll(accountId, target, content.input);
      case 'location': return this.sendLocation(accountId, target, content.input);
      case 'contact': return this.sendContact(accountId, target, content.input);
    }
  }

  private async sendLocation(accountId: string, target: string, input: LocationInput) {
    const provider = await this.ensureAccountLive(accountId);
    const remoteJid = await this.resolveTargetWithProvider(provider, target);
    try {
      const result = await provider.sendLocation(remoteJid, input);
      const canonical = await this.canonicalJid(accountId, result.remoteJid || remoteJid);
      this.log(result.id, accountId, canonical, 'location', input.name ?? input.address ?? '', 'pending', undefined, undefined, undefined, undefined, { transportJid: remoteJid });
      await this.touchChat(accountId, canonical);
      return { ...result, remoteJid: canonical, resolvedTarget: canonical, transportJid: remoteJid };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(randomUUID(), accountId, remoteJid, 'location', input.name ?? input.address ?? '', 'failed', message);
      throw new Error(`Falha ao enviar localização para ${remoteJid}: ${message}`);
    }
  }

  private async sendContact(accountId: string, target: string, input: ContactCardInput) {
    const provider = await this.ensureAccountLive(accountId);
    const remoteJid = await this.resolveTargetWithProvider(provider, target);
    try {
      const result = await provider.sendContact(remoteJid, input);
      const canonical = await this.canonicalJid(accountId, result.remoteJid || remoteJid);
      this.log(result.id, accountId, canonical, 'contact', input.displayName, 'pending', undefined, undefined, undefined, undefined, { transportJid: remoteJid });
      await this.touchChat(accountId, canonical);
      return { ...result, remoteJid: canonical, resolvedTarget: canonical, transportJid: remoteJid };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(randomUUID(), accountId, remoteJid, 'contact', input.displayName, 'failed', message);
      throw new Error(`Falha ao enviar contato para ${remoteJid}: ${message}`);
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

  private log(id: string, accountId: string, remoteJid: string, type: string, text: string, status: StoredDeliveryStatus, error?: string, mediaPath?: string, fileName?: string, mimetype?: string, metadata?: unknown) {
    const existing = this.db.prepare(`
      SELECT status,created_at,error FROM message_log
      WHERE account_id=? AND id=? LIMIT 1
    `).get(accountId, id) as { status?: string; created_at?: string; error?: string | null } | undefined;
    const cached = status === 'pending' ? getCachedMessageStatus(this.db, accountId, id) : undefined;
    let finalStatus: StoredDeliveryStatus = cached?.status ?? status;
    let finalError = finalStatus === 'failed' ? (cached?.error ?? error ?? 'WhatsApp rejeitou a mensagem') : undefined;
    if (existing?.status && status === 'pending') {
      finalStatus = mergeDeliveryStatus(existing.status, finalStatus);
      if (finalStatus === 'failed') finalError = finalError ?? existing.error ?? 'WhatsApp rejeitou a mensagem';
    }
    const errorValue = finalStatus === 'failed' ? finalError ?? 'WhatsApp rejeitou a mensagem' : null;
    const metadataJson = JSON.stringify(metadata ?? {});

    if (existing) {
      this.db.prepare(`
        UPDATE message_log SET
          remote_jid=?, direction='out', message_type=?, text=COALESCE(?,text), status=?, error=?,
          media_path=COALESCE(media_path,?), file_name=COALESCE(file_name,?), mimetype=COALESCE(mimetype,?),
          metadata_json=CASE WHEN metadata_json IS NULL OR metadata_json='{}' THEN ? ELSE metadata_json END
        WHERE account_id=? AND id=?
      `).run(remoteJid, type, text || null, finalStatus, errorValue, mediaPath ?? null, fileName ?? null, mimetype ?? null, metadataJson, accountId, id);
      return;
    }

    this.db.prepare(`
      INSERT OR IGNORE INTO message_log
        (id, account_id, remote_jid, direction, message_type, text, status, error, media_path, file_name, mimetype, metadata_json, created_at)
      VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, accountId, remoteJid, type, text || null, finalStatus, errorValue, mediaPath ?? null, fileName ?? null, mimetype ?? null, metadataJson, new Date().toISOString());
  }

  private async touchChat(accountId: string, remoteJid: string) {
    const provider = await this.ensureAccountLive(accountId);
    const canonical = await this.canonicalJid(accountId, remoteJid);
    const identity = canonical.endsWith('@g.us') ? undefined : await provider.resolveIdentity(canonical).catch(() => undefined);
    const profileUrl = await this.cacheProfilePicture(await provider.profilePictureUrl(canonical).catch(() => undefined));
    const existing = this.db.prepare(`SELECT jid FROM chat_cache WHERE account_id=? AND (jid=? OR lid=? OR pn_jid=?) LIMIT 1`).get(accountId, canonical, canonical, canonical) as { jid?: string } | undefined;
    const now = new Date().toISOString();
    if (existing?.jid) {
      this.db.prepare(`
        UPDATE chat_cache SET last_message_at=?,profile_url=COALESCE(?,profile_url),lid=COALESCE(?,lid),pn_jid=COALESCE(?,pn_jid),phone=COALESCE(?,phone)
        WHERE account_id=? AND jid=?
      `).run(now, profileUrl ?? null, identity?.lid ?? null, identity?.pnJid ?? null, identity?.phone ?? null, accountId, existing.jid);
    } else {
      this.db.prepare(`
        INSERT INTO chat_cache (account_id,jid,lid,pn_jid,phone,name,is_group,message_count,first_message_at,last_message_at,profile_url)
        VALUES (?,?,?,?,?,NULL,?,0,?,?,?)
      `).run(accountId, canonical, identity?.lid ?? null, identity?.pnJid ?? null, identity?.phone ?? null, canonical.endsWith('@g.us') ? 1 : 0, now, now, profileUrl ?? null);
    }
  }
}
