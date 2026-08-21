import type { AttozapDatabase } from '../database.js';
import type { AccountManager } from '../messaging/account-manager.js';
import { upsertWaIdentity } from '../messaging/identity-store.js';

export type ImportedContact = {
  phone: string;
  name?: string;
  variables?: Record<string, string>;
};

function digits(value: string) { return value.replace(/\D/g, ''); }
function humanContactName(value?: string | null) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text || /@(lid|s\.whatsapp\.net|g\.us)$/i.test(text) || /^\+?\d{7,}$/.test(text)) return undefined;
  return text.slice(0, 120);
}

export class WaSenderTools {
  constructor(private readonly db: AttozapDatabase, private readonly accounts: AccountManager) {}

  importContacts(contacts: ImportedContact[]) {
    const upsert = this.db.prepare(`
      INSERT INTO contacts (phone, name, variables_json) VALUES (?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        name=COALESCE(excluded.name, contacts.name),
        variables_json=CASE WHEN excluded.variables_json='{}' THEN contacts.variables_json ELSE excluded.variables_json END,
        updated_at=CURRENT_TIMESTAMP
    `);
    const tx = this.db.transaction(() => {
      let imported = 0;
      for (const contact of contacts.slice(0, 50_000)) {
        const phone = digits(contact.phone);
        if (phone.length < 6 || phone.length > 15) continue;
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

  listObservedChats(accountId: string, includeGroups = false) {
    const rows = this.db.prepare(`
      SELECT account_id, jid, lid, pn_jid, phone, name, is_group, message_count, first_message_at, last_message_at
      FROM chat_cache
      WHERE account_id=? AND (?=1 OR is_group=0)
      ORDER BY last_message_at DESC
      LIMIT 10000
    `).all(accountId, includeGroups ? 1 : 0) as Array<{
      account_id: string;
      jid: string;
      lid: string | null;
      pn_jid: string | null;
      phone: string | null;
      name: string | null;
      is_group: number;
      message_count: number;
      first_message_at: string;
      last_message_at: string;
    }>;
    return rows.map(row => ({
      accountId: row.account_id,
      jid: row.jid,
      lid: row.lid ?? undefined,
      pnJid: row.pn_jid ?? undefined,
      phone: row.phone ?? undefined,
      name: row.name ?? undefined,
      isGroup: Boolean(row.is_group),
      messageCount: row.message_count,
      firstMessageAt: row.first_message_at,
      lastMessageAt: row.last_message_at,
      importable: Boolean(row.phone),
    }));
  }

  async syncContactsFromWhatsApp(accountId: string) {
    const provider = this.accounts.provider(accountId);
    if (!provider.isConnected()) throw new Error('Conecte a conta do WhatsApp antes de sincronizar a agenda.');

    const rows = this.db.prepare(`
      SELECT
        i.canonical_jid AS jid, i.lid, i.pn_jid, i.phone, i.push_name,
        c.name AS chat_name, c.phone AS chat_phone
      FROM wa_identities i
      LEFT JOIN chat_cache c ON c.account_id=i.account_id AND (
        c.jid=i.canonical_jid OR c.jid=i.lid OR c.jid=i.pn_jid OR c.lid=i.canonical_jid OR c.pn_jid=i.canonical_jid
      )
      WHERE i.account_id=? AND (i.phone IS NOT NULL OR i.pn_jid IS NOT NULL OR i.lid IS NOT NULL)
      ORDER BY i.last_seen_at DESC LIMIT 5000
    `).all(accountId) as Array<{ jid: string; lid?: string | null; pn_jid?: string | null; phone?: string | null; push_name?: string | null; chat_name?: string | null; chat_phone?: string | null }>;
    const observed = this.listObservedChats(accountId, false);
    const candidates = new Map<string, { jid: string; lid?: string; pnJid?: string; phone?: string; name?: string }>();
    const add = (row: { jid: string; lid?: string | null; pn_jid?: string | null; phone?: string | null; push_name?: string | null; chat_name?: string | null; chat_phone?: string | null }) => {
      const phone = digits(row.phone ?? row.chat_phone ?? '');
      const name = humanContactName(row.chat_name) ?? humanContactName(row.push_name);
      if (!row.jid || (!phone && !row.pn_jid && !row.lid)) return;
      candidates.set(row.jid, { jid: row.jid, lid: row.lid ?? undefined, pnJid: row.pn_jid ?? undefined, phone: phone || undefined, name });
    };
    rows.forEach(add);
    observed.forEach(chat => add({ jid: chat.jid, lid: chat.lid, pn_jid: chat.pnJid, phone: chat.phone, chat_name: chat.name }));

    const upsert = this.db.prepare(`
      INSERT INTO contacts (phone, name, wa_exists, last_checked_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(phone) DO UPDATE SET
        name=CASE WHEN excluded.name IS NOT NULL AND excluded.name<>'' THEN excluded.name ELSE contacts.name END,
        wa_exists=1, last_checked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    `);
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const tx = this.db.transaction((items: Array<{ phone: string; name?: string }>) => {
      for (const item of items) {
        const before = this.db.prepare(`SELECT phone, name FROM contacts WHERE phone=?`).get(item.phone) as { phone: string; name?: string | null } | undefined;
        upsert.run(item.phone, item.name ?? null);
        if (before) updated++;
        else imported++;
      }
    });
    const resolved: Array<{ phone: string; name?: string }> = [];
    for (const candidate of candidates.values()) {
      let phone = candidate.phone;
      if (!phone) {
        try {
          const presence = await provider.resolveIdentity(candidate.jid, candidate.lid ?? candidate.pnJid);
          phone = digits(presence.phone ?? '');
        } catch {
          phone = '';
        }
      }
      if (!phone) { skipped++; continue; }
      resolved.push({ phone, name: candidate.name });
    }
    tx([...new Map(resolved.map(item => [item.phone, item])).values()]);
    this.audit('contacts.sync-whatsapp', accountId, { candidates: candidates.size, imported, updated, skipped });
    return { imported, updated, skipped, observed: candidates.size };
  }

  grabContactsFromChats(accountId: string) {
    const chats = this.listObservedChats(accountId, false);
    const upsert = this.db.prepare(`
      INSERT INTO contacts (phone, name, variables_json) VALUES (?, ?, '{}')
      ON CONFLICT(phone) DO UPDATE SET
        name=COALESCE(excluded.name, contacts.name),
        updated_at=CURRENT_TIMESTAMP
    `);
    let imported = 0;
    let skipped = 0;
    const tx = this.db.transaction(() => {
      for (const chat of chats) {
        if (!chat.phone) { skipped++; continue; }
        upsert.run(chat.phone, chat.name?.trim() || null);
        imported++;
      }
    });
    tx();
    this.audit('contacts.grab-chats', accountId, { imported, skipped, observed: chats.length });
    return { imported, skipped, observed: chats.length };
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
    const upsertContact = this.db.prepare(`
      INSERT INTO contacts (phone, wa_exists, last_checked_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(phone) DO UPDATE SET wa_exists=excluded.wa_exists, last_checked_at=CURRENT_TIMESTAMP
    `);
    const tx = this.db.transaction(() => {
      for (const item of result) {
        upsertContact.run(digits(item.input), item.exists ? 1 : 0);
        if (item.exists && item.jid) upsertWaIdentity(this.db, accountId, { jid: item.jid, lid: item.lid, pnJid: item.pnJid, phone: item.phone ?? digits(item.input) }, 'number-filter');
      }
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
    const participants = (await this.accounts.provider(accountId).getGroupMetadata(groupJid)).participants;
    const tx = this.db.transaction(() => {
      for (const participant of participants) upsertWaIdentity(this.db, accountId, { jid: participant.jid, lid: participant.lid, pnJid: participant.pnJid, phone: participant.phone }, 'group-metadata');
    });
    tx();
    return participants;
  }

  activeGroupMembers(accountId: string, groupJid: string, days = 30) {
    const safeDays = Math.max(1, Math.min(3650, Math.floor(days)));
    const cutoff = new Date(Date.now() - safeDays * 86_400_000).toISOString();
    const rows = this.db.prepare(`
      SELECT participant_jid, participant_lid, participant_pn_jid, participant_phone,
             message_count, first_message_at, last_message_at
      FROM group_activity
      WHERE account_id=? AND group_id=? AND last_message_at>=?
      ORDER BY last_message_at DESC, message_count DESC
    `).all(accountId, groupJid, cutoff) as Array<{
      participant_jid: string;
      participant_lid: string | null;
      participant_pn_jid: string | null;
      participant_phone: string | null;
      message_count: number;
      first_message_at: string;
      last_message_at: string;
    }>;
    return rows.map(row => ({
      jid: row.participant_jid,
      lid: row.participant_lid ?? undefined,
      pnJid: row.participant_pn_jid ?? undefined,
      phone: row.participant_phone ?? undefined,
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

  private audit(action: string, entityId: string, metadata?: unknown) {
    this.db.prepare(`
      INSERT INTO audit_log (actor, action, entity_type, entity_id, metadata_json)
      VALUES ('local-user', ?, 'tool', ?, ?)
    `).run(action, entityId, metadata ? JSON.stringify(metadata) : null);
  }
}
