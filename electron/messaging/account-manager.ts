import { EventEmitter } from 'node:events';
import { upsertWaIdentity } from './identity-store.js';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from '../database.js';
import { BaileysProvider } from './baileys-provider.js';
import { phoneFromPnJid } from './identity.js';
import type { AccountRestrictionState, ConnectionState, ContactPresence, ContactProfileEvent, IncomingMessage, MessagingProvider } from './provider.js';

export type AccountRecord = {
  id: string;
  name: string;
  provider: string;
  status: ConnectionState;
  phone?: string;
  proxy?: string;
  createdAt: string;
  updatedAt: string;
  restriction?: AccountRestrictionState;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class AccountManager extends EventEmitter {
  private readonly providers = new Map<string, MessagingProvider>();
  private readonly ensurePromises = new Map<string, Promise<MessagingProvider>>();
  private readonly restrictions = new Map<string, AccountRestrictionState>();

  constructor(private readonly db: AttozapDatabase, private readonly authRoot: string) {
    super();
  }

  list(): AccountRecord[] {
    const rows = this.db.prepare(`
      SELECT id, name, provider, status, phone, proxy_url, created_at, updated_at
      FROM instances ORDER BY created_at ASC
    `).all() as Array<Record<string, string | null>>;
    return rows.map(row => ({
      id: String(row.id),
      name: String(row.name),
      provider: String(row.provider),
      status: String(row.status) as ConnectionState,
      phone: row.phone ? String(row.phone) : undefined,
      proxy: row.proxy_url ? String(row.proxy_url) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      restriction: this.restrictions.get(String(row.id)),
    }));
  }

  create(name: string) {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Informe um nome para a conta');
    const id = randomUUID();
    this.db.prepare(`INSERT INTO instances (id, name, provider, status) VALUES (?, ?, 'baileys', 'disconnected')`).run(id, cleanName);
    this.audit('account.create', id, { name: cleanName });
    return this.get(id)!;
  }

  get(id: string) {
    return this.list().find(account => account.id === id);
  }

  rename(id: string, name: string) {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Informe um nome para a conta');
    this.db.prepare(`UPDATE instances SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cleanName, id);
    this.audit('account.rename', id, { name: cleanName });
    return this.get(id);
  }

  setProxy(id: string, proxy?: string) {
    const cleanProxy = proxy?.trim() || undefined;
    this.providers.get(id)?.setProxy?.(cleanProxy);
    this.db.prepare(`UPDATE instances SET proxy_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cleanProxy ?? null, id);
    this.audit('account.proxy.update', id, { configured: Boolean(cleanProxy) });
    return this.get(id);
  }

  async connect(id: string) {
    const account = this.get(id);
    if (!account) throw new Error('Conta não encontrada');

    const existing = this.providers.get(id);
    if (existing?.isConnected()) return this.get(id);

    const provider: MessagingProvider = existing ?? new BaileysProvider(join(this.authRoot, id), account.proxy);
    provider.setProxy?.(account.proxy);
    if (!existing) this.providers.set(id, provider);

    await provider.connect({
      onState: state => this.updateState(id, state, provider),
      onQr: qr => this.emit('qr', { accountId: id, qr }),
      onError: error => this.emit('error', { accountId: id, message: error.message }),
      onMessage: message => void this.onMessage(id, message, provider),
      onContact: event => void this.onContact(id, event, provider),
      onMessageStatus: event => this.emit('message-status', { accountId: id, ...event }),
      onRestriction: state => {
        this.restrictions.set(id, state);
        this.emit('restriction', { accountId: id, ...state });
      },
      onPollUpdate: event => this.emit('poll-update', { accountId: id, ...event }),
    });
    return this.get(id);
  }

  /**
   * Returns only after the in-memory provider is actually live. This is
   * intentionally separate from connect(), because connect() must return while
   * a QR session is waiting for the user to scan it.
   */
  async ensureConnected(id: string, timeoutMs = 20_000): Promise<MessagingProvider> {
    const live = this.providers.get(id);
    if (live?.isConnected()) return live;

    const pending = this.ensurePromises.get(id);
    if (pending) return pending;

    const promise = this.doEnsureConnected(id, timeoutMs).finally(() => {
      this.ensurePromises.delete(id);
    });
    this.ensurePromises.set(id, promise);
    return promise;
  }

  private async doEnsureConnected(id: string, timeoutMs: number): Promise<MessagingProvider> {
    const account = this.get(id);
    if (!account) throw new Error('Conta não encontrada');

    let provider = this.providers.get(id);
    if (!provider?.isConnected()) {
      const connectionAlreadyRunning = Boolean(provider) && ['connecting', 'reconnecting', 'qr'].includes(account.status);
      if (!connectionAlreadyRunning) await this.connect(id);
    }

    const deadline = Date.now() + Math.max(2_000, timeoutMs);
    while (Date.now() < deadline) {
      provider = this.providers.get(id);
      if (provider?.isConnected()) return provider;

      const current = this.get(id);
      if (!current) throw new Error('Conta removida durante a conexão');
      await sleep(250);
    }

    const current = this.get(id);
    throw new Error(`A conta ${current?.name ?? id} não ficou online dentro de ${Math.ceil(timeoutMs / 1000)}s`);
  }

  async disconnect(id: string, logout = false) {
    const provider = this.providers.get(id);
    if (provider) await provider.disconnect(logout);
    if (logout) this.providers.delete(id);
    this.updateState(id, 'disconnected', provider);
    this.audit(logout ? 'account.logout' : 'account.disconnect', id);
  }

  async remove(id: string) {
    await this.disconnect(id, true).catch(() => undefined);
    this.restrictions.delete(id);
    this.db.prepare(`DELETE FROM instances WHERE id = ?`).run(id);
    this.audit('account.remove', id);
  }

  provider(id: string): MessagingProvider {
    const provider = this.providers.get(id);
    if (!provider || !provider.isConnected()) throw new Error('A conta selecionada não está conectada');
    return provider;
  }

  async restrictionDiagnostics(id: string) {
    const account = this.get(id);
    if (!account) throw new Error('Conta não encontrada');
    const provider = this.providers.get(id);
    if (provider?.isConnected() && provider.getAccountRestriction) {
      const restriction = await provider.getAccountRestriction();
      this.restrictions.set(id, restriction);
    }
    return { accountId: id, connected: Boolean(provider?.isConnected()), restriction: this.restrictions.get(id) ?? null };
  }

  private updateState(id: string, status: ConnectionState, provider?: MessagingProvider) {
    const self = provider?.getSelfJid();
    const phone = phoneFromPnJid(self);
    this.db.prepare(`UPDATE instances SET status = ?, phone = COALESCE(?, phone), updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, phone ?? null, id);
    this.emit('state', { accountId: id, status, phone, jid: self });
  }

  private async onContact(accountId: string, event: ContactProfileEvent, provider: MessagingProvider) {
    try {
      const identity = await provider.resolveIdentity(event.jid, event.alternateJid).catch(() => ({ input: event.jid, jid: event.jid, exists: true } as ContactPresence));
      this.persistIdentity(accountId, identity, event.pushName, 'contacts.sync');
      const canonical = identity.jid ?? event.jid;
      const existing = this.db.prepare(`
        SELECT jid FROM chat_cache
        WHERE account_id=? AND (jid=? OR (? IS NOT NULL AND lid=?) OR (? IS NOT NULL AND pn_jid=?))
        LIMIT 1
      `).get(accountId, canonical, identity.lid ?? null, identity.lid ?? null, identity.pnJid ?? null, identity.pnJid ?? null) as { jid?: string } | undefined;
      const now = new Date().toISOString();
      if (existing?.jid) {
        this.db.prepare(`
          UPDATE chat_cache SET
            name=COALESCE(?,name),
            profile_url=COALESCE(?,profile_url),
            lid=COALESCE(?,lid),
            pn_jid=COALESCE(?,pn_jid),
            phone=COALESCE(?,phone)
          WHERE account_id=? AND jid=?
        `).run(event.pushName?.trim() || null, event.profilePictureUrl ?? null, identity.lid ?? null, identity.pnJid ?? null, identity.phone ?? null, accountId, existing.jid);
      } else {
        this.db.prepare(`
          INSERT OR IGNORE INTO chat_cache (account_id,jid,lid,pn_jid,phone,name,profile_url,is_group,message_count,first_message_at,last_message_at)
          VALUES (?,?,?,?,?,?,?,0,0,?,?)
        `).run(accountId, canonical, identity.lid ?? null, identity.pnJid ?? null, identity.phone ?? null, event.pushName?.trim() || null, event.profilePictureUrl ?? null, now, now);
      }
      this.emit('contact', { accountId, jid: canonical, pushName: event.pushName, profilePictureUrl: event.profilePictureUrl, identity });
    } catch (error) {
      this.emit('error', { accountId, message: `Falha ao atualizar perfil: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  private async onMessage(accountId: string, message: IncomingMessage, provider: MessagingProvider) {
    const at = new Date(message.timestamp).toISOString();
    const isGroup = message.remoteJid.endsWith('@g.us');
    const cacheable = !message.remoteJid.endsWith('@broadcast') && !message.remoteJid.includes('@newsletter');
    const mediaUpdate = message.metadata?.mediaPending === false;
    const identityUpdate = message.metadata?.identityUpdate === true;
    let chatIdentity: ContactPresence | undefined;
    let participantIdentity: ContactPresence | undefined;

    // O renderer recebe e persiste a mensagem antes de qualquer consulta de identidade.
    // Isto evita que onWhatsApp/PN-LID e a rede bloqueiem a chegada da mensagem.
    this.emit('message', { accountId, message });

    try {
      if (!isGroup) chatIdentity = await provider.resolveIdentity(message.remoteJid, message.remoteJidAlt);
      if (isGroup && message.participant) participantIdentity = await provider.resolveIdentity(message.participant, message.participantAlt);
    } catch {}

    if (chatIdentity) this.persistIdentity(accountId, chatIdentity, message.pushName, 'message.remote');
    if (participantIdentity) this.persistIdentity(accountId, participantIdentity, message.pushName, 'message.participant');
    if (chatIdentity || participantIdentity) {
      this.emit('message', {
        accountId,
        message: { ...message, metadata: { ...(message.metadata ?? {}), identityUpdate: true } },
        identity: chatIdentity,
        participantIdentity,
      });
    }

    if (cacheable) {
      const canonicalJid = isGroup ? message.remoteJid : chatIdentity?.jid ?? message.remoteJid;
      const directName = isGroup ? null : message.pushName?.trim() || null;
      const aliases = [...new Set([message.remoteJid, message.remoteJidAlt, canonicalJid, chatIdentity?.lid, chatIdentity?.pnJid].filter(Boolean) as string[])];
      const placeholders = aliases.map(() => '?').join(',');
      const existing = this.db.prepare(`SELECT jid FROM chat_cache WHERE account_id=? AND (jid IN (${placeholders}) OR lid IN (${placeholders}) OR pn_jid IN (${placeholders})) LIMIT 1`).get(accountId, ...aliases, ...aliases, ...aliases) as { jid?: string } | undefined;
      const cacheJid = existing?.jid ?? canonicalJid;
      if (existing?.jid) {
        this.db.prepare(`
          UPDATE chat_cache SET
            lid=COALESCE(?,lid), pn_jid=COALESCE(?,pn_jid), phone=COALESCE(?,phone),
            name=COALESCE(?,name), profile_url=COALESCE(?,profile_url), is_group=?,
            message_count=message_count+?, last_message_at=?
          WHERE account_id=? AND jid=?
        `).run(chatIdentity?.lid ?? null, chatIdentity?.pnJid ?? null, chatIdentity?.phone ?? null, directName, message.profilePictureUrl ?? null, isGroup ? 1 : 0, mediaUpdate || identityUpdate ? 0 : 1, at, accountId, cacheJid);
      } else {
        this.db.prepare(`
          INSERT INTO chat_cache (account_id, jid, lid, pn_jid, phone, name, profile_url, is_group, message_count, first_message_at, last_message_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(accountId, cacheJid, chatIdentity?.lid ?? null, chatIdentity?.pnJid ?? null, chatIdentity?.phone ?? null, directName, message.profilePictureUrl ?? null, isGroup ? 1 : 0, mediaUpdate || identityUpdate ? 0 : 1, at, at);
      }
    }

    if (!message.fromMe && !mediaUpdate && !identityUpdate && isGroup && message.participant) {
      const canonical = participantIdentity?.jid ?? message.participant;
      this.db.prepare(`
        INSERT INTO group_activity (
          account_id, group_id, participant_jid, participant_lid, participant_pn_jid, participant_phone,
          message_count, first_message_at, last_message_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(account_id,group_id,participant_jid) DO UPDATE SET
          participant_lid=COALESCE(excluded.participant_lid, group_activity.participant_lid),
          participant_pn_jid=COALESCE(excluded.participant_pn_jid, group_activity.participant_pn_jid),
          participant_phone=COALESCE(excluded.participant_phone, group_activity.participant_phone),
          message_count=group_activity.message_count+1,
          last_message_at=excluded.last_message_at
      `).run(accountId, message.remoteJid, canonical, participantIdentity?.lid ?? null, participantIdentity?.pnJid ?? null, participantIdentity?.phone ?? null, at, at);
    }

    this.emit('contact', { accountId, jid: chatIdentity?.jid ?? message.remoteJid, pushName: message.pushName, profilePictureUrl: message.profilePictureUrl, identity: chatIdentity });

    // Perfil nunca deve atrasar a mensagem. A atualização é enviada à UI apenas
    // quando o WhatsApp devolver a foto, mantendo o WebChat responsivo.
    if (!isGroup && chatIdentity?.jid && !message.profilePictureUrl) {
      void provider.profilePictureUrl(chatIdentity.jid).then(profilePictureUrl => {
        if (!profilePictureUrl) return;
        this.db.prepare(`UPDATE chat_cache SET profile_url=COALESCE(?,profile_url) WHERE account_id=? AND (jid=? OR lid=? OR pn_jid=?)`).run(profilePictureUrl, accountId, chatIdentity?.jid ?? null, chatIdentity?.lid ?? null, chatIdentity?.pnJid ?? null);
        this.emit('contact', { accountId, jid: chatIdentity?.jid, pushName: message.pushName, profilePictureUrl, identity: chatIdentity });
      }).catch(() => undefined);
    }
  }

  private persistIdentity(accountId: string, identity: ContactPresence, pushName: string | undefined, source: string) {
    upsertWaIdentity(this.db, accountId, identity, source, pushName);
  }

  private audit(action: string, entityId: string, metadata?: unknown) {
    this.db.prepare(`INSERT INTO audit_log (actor, action, entity_type, entity_id, metadata_json) VALUES ('local-user', ?, 'account', ?, ?)`).run(action, entityId, metadata ? JSON.stringify(metadata) : null);
  }
}
