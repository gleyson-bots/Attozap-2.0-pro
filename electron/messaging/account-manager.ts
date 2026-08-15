import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from '../database.js';
import { BaileysProvider } from './baileys-provider.js';
import type { ConnectionState, IncomingMessage, MessagingProvider } from './provider.js';

export type AccountRecord = {
  id: string;
  name: string;
  provider: string;
  status: ConnectionState;
  phone?: string;
  proxy?: string;
  createdAt: string;
  updatedAt: string;
};

export class AccountManager extends EventEmitter {
  private readonly providers = new Map<string, MessagingProvider>();

  constructor(
    private readonly db: AttozapDatabase,
    private readonly authRoot: string,
  ) {
    super();
  }

  list(): AccountRecord[] {
    const rows = this.db.prepare(`
      SELECT id, name, provider, status, phone, proxy_url, created_at, updated_at
      FROM instances ORDER BY created_at ASC
    `).all() as Array<Record<string, string | null>>;
    return rows.map(row => ({
      id: String(row.id), name: String(row.name), provider: String(row.provider),
      status: String(row.status) as ConnectionState,
      phone: row.phone ? String(row.phone) : undefined,
      proxy: row.proxy_url ? String(row.proxy_url) : undefined,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
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
    this.db.prepare(`UPDATE instances SET proxy_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(proxy?.trim() || null, id);
    this.audit('account.proxy.update', id, { configured: Boolean(proxy?.trim()) });
    return this.get(id);
  }

  async connect(id: string) {
    const account = this.get(id);
    if (!account) throw new Error('Conta não encontrada');

    const existing = this.providers.get(id);
    const provider: MessagingProvider = existing ?? new BaileysProvider(join(this.authRoot, id));
    if (!existing) this.providers.set(id, provider);

    await provider.connect({
      onState: state => this.updateState(id, state, provider),
      onQr: qr => this.emit('qr', { accountId: id, qr }),
      onError: error => this.emit('error', { accountId: id, message: error.message }),
      onMessage: message => this.onMessage(id, message),
    });
    return this.get(id);
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
    this.db.prepare(`DELETE FROM instances WHERE id = ?`).run(id);
    this.audit('account.remove', id);
  }

  provider(id: string): MessagingProvider {
    const provider = this.providers.get(id);
    if (!provider || !provider.isConnected()) throw new Error('A conta selecionada não está conectada');
    return provider;
  }

  private updateState(id: string, status: ConnectionState, provider?: MessagingProvider) {
    const self = provider?.getSelfJid();
    const phone = self?.split('@')[0]?.split(':')[0];
    this.db.prepare(`
      UPDATE instances SET status = ?, phone = COALESCE(?, phone), updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, phone ?? null, id);
    this.emit('state', { accountId: id, status, phone });
  }

  private onMessage(accountId: string, message: IncomingMessage) {
    this.emit('message', { accountId, message });
  }

  private audit(action: string, entityId: string, metadata?: unknown) {
    this.db.prepare(`
      INSERT INTO audit_log (actor, action, entity_type, entity_id, metadata_json)
      VALUES ('local-user', ?, 'account', ?, ?)
    `).run(action, entityId, metadata ? JSON.stringify(metadata) : null);
  }
}
