import type { AttozapDatabase } from '../database.js';
import type { AccountManager } from '../messaging/account-manager.js';

export type ImportedContact = {
  phone: string;
  name?: string;
  variables?: Record<string, string>;
};

function digits(value: string) { return value.replace(/\D/g, ''); }

export class WaSenderTools {
  constructor(private readonly db: AttozapDatabase, private readonly accounts: AccountManager) {}

  importContacts(contacts: ImportedContact[]) {
    const upsert = this.db.prepare(`
      INSERT INTO contacts (phone, name, variables_json) VALUES (?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        name=COALESCE(excluded.name, contacts.name),
        variables_json=excluded.variables_json,
        updated_at=CURRENT_TIMESTAMP
    `);
    const tx = this.db.transaction(() => {
      let imported = 0;
      for (const contact of contacts) {
        const phone = digits(contact.phone);
        if (!phone) continue;
        upsert.run(phone, contact.name?.trim() || null, JSON.stringify(contact.variables ?? {}));
        imported++;
      }
      return imported;
    });
    return { imported: tx() };
  }

  listContacts(search = '') {
    const q = `%${search.trim()}%`;
    return this.db.prepare(`
      SELECT * FROM contacts WHERE (?='' OR phone LIKE ? OR COALESCE(name,'') LIKE ?)
      ORDER BY COALESCE(name,''), phone LIMIT 5000
    `).all(search.trim(), q, q);
  }

  setBlocked(phone: string, blocked: boolean) {
    const value = digits(phone);
    this.db.prepare(`
      INSERT INTO contacts (phone, is_blocked) VALUES (?, ?)
      ON CONFLICT(phone) DO UPDATE SET is_blocked=excluded.is_blocked, updated_at=CURRENT_TIMESTAMP
    `).run(value, blocked ? 1 : 0);
    return this.db.prepare(`SELECT * FROM contacts WHERE phone=?`).get(value);
  }

  setFriendly(phone: string, friendly: boolean) {
    const value = digits(phone);
    this.db.prepare(`
      INSERT INTO contacts (phone, is_friendly) VALUES (?, ?)
      ON CONFLICT(phone) DO UPDATE SET is_friendly=excluded.is_friendly, updated_at=CURRENT_TIMESTAMP
    `).run(value, friendly ? 1 : 0);
    return this.db.prepare(`SELECT * FROM contacts WHERE phone=?`).get(value);
  }

  listBlocked() { return this.db.prepare(`SELECT * FROM contacts WHERE is_blocked=1 ORDER BY updated_at DESC`).all(); }
  listFriendly() { return this.db.prepare(`SELECT * FROM contacts WHERE is_friendly=1 ORDER BY updated_at DESC`).all(); }

  async filterNumbers(accountId: string, numbers: string[]) {
    const provider = this.accounts.provider(accountId);
    const clean = [...new Set(numbers.map(digits).filter(Boolean))];
    const result = await provider.checkNumbers(clean);
    const upsert = this.db.prepare(`
      INSERT INTO contacts (phone, wa_exists, last_checked_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(phone) DO UPDATE SET wa_exists=excluded.wa_exists, last_checked_at=CURRENT_TIMESTAMP
    `);
    const tx = this.db.transaction(() => {
      for (const item of result) upsert.run(digits(item.input), item.exists ? 1 : 0);
    });
    tx();
    return result;
  }

  generateNumbers(input: { countryCode: string; prefix?: string; start: number; end: number; width?: number }) {
    const country = digits(input.countryCode);
    const prefix = digits(input.prefix ?? '');
    const width = Math.max(1, Math.min(15, input.width ?? String(input.end).length));
    if (!country) throw new Error('Informe o código do país');
    if (!Number.isInteger(input.start) || !Number.isInteger(input.end) || input.end < input.start) throw new Error('Faixa numérica inválida');
    if (input.end - input.start > 100000) throw new Error('Gere no máximo 100.001 números por operação');
    const values: string[] = [];
    for (let current = input.start; current <= input.end; current++) values.push(`${country}${prefix}${String(current).padStart(width, '0')}`);
    return values;
  }

  async syncGroups(accountId: string) {
    const groups = await this.accounts.provider(accountId).listGroups();
    const upsert = this.db.prepare(`
      INSERT INTO group_cache (account_id, group_id, subject, description, member_count, owner, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(account_id,group_id) DO UPDATE SET
        subject=excluded.subject, description=excluded.description, member_count=excluded.member_count,
        owner=excluded.owner, updated_at=CURRENT_TIMESTAMP
    `);
    const tx = this.db.transaction(() => {
      for (const group of groups) upsert.run(accountId, group.id, group.subject, group.description ?? null, group.size, group.owner ?? null);
    });
    tx();
    return groups;
  }

  listCachedGroups(accountId: string) {
    return this.db.prepare(`SELECT * FROM group_cache WHERE account_id=? ORDER BY subject`).all(accountId);
  }

  async groupMembers(accountId: string, groupJid: string) {
    return (await this.accounts.provider(accountId).getGroupMetadata(groupJid)).participants;
  }

  activeGroupMembers(accountId: string, groupJid: string, days = 30) {
    const safeDays = Math.max(1, Math.min(3650, Math.floor(days)));
    const cutoff = new Date(Date.now() - safeDays * 86_400_000).toISOString();
    const rows = this.db.prepare(`
      SELECT participant_jid, message_count, first_message_at, last_message_at
      FROM group_activity
      WHERE account_id=? AND group_id=? AND last_message_at>=?
      ORDER BY last_message_at DESC, message_count DESC
    `).all(accountId, groupJid, cutoff) as Array<{
      participant_jid: string;
      message_count: number;
      first_message_at: string;
      last_message_at: string;
    }>;
    return rows.map(row => ({
      jid: row.participant_jid,
      phone: row.participant_jid.split('@')[0]?.split(':')[0] ?? row.participant_jid,
      messageCount: row.message_count,
      firstMessageAt: row.first_message_at,
      lastMessageAt: row.last_message_at,
    }));
  }

  async groupCreate(accountId: string, subject: string, participants: string[]) {
    return this.accounts.provider(accountId).createGroup(subject, participants);
  }

  async groupAdd(accountId: string, groupJid: string, participants: string[]) {
    return this.accounts.provider(accountId).addGroupParticipants(groupJid, participants);
  }

  async groupJoin(accountId: string, invite: string) {
    return this.accounts.provider(accountId).joinGroup(invite);
  }

  async groupVerify(accountId: string, invite: string) {
    return this.accounts.provider(accountId).verifyGroupInvite(invite);
  }

  async groupVerifyMany(accountId: string, invites: string[]) {
    const provider = this.accounts.provider(accountId);
    const unique = [...new Set(invites.map(value => value.trim()).filter(Boolean))];
    const results: Array<{ invite: string; valid: boolean; group?: unknown; error?: string }> = [];
    for (const invite of unique) {
      try {
        results.push({ invite, valid: true, group: await provider.verifyGroupInvite(invite) });
      } catch (error) {
        results.push({ invite, valid: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  async groupInvite(accountId: string, groupJid: string) {
    return this.accounts.provider(accountId).getGroupInvite(groupJid);
  }
}
