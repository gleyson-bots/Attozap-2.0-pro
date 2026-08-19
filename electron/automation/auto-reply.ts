import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from '../database.js';
import type { LicenseService } from '../license-service.js';
import type { AccountManager } from '../messaging/account-manager.js';
import type { IncomingMessage } from '../messaging/provider.js';

export type AutoReplyRuleInput = {
  accountId: string;
  name: string;
  matchType: 'contains' | 'equals' | 'startsWith' | 'regex' | 'all';
  triggerText: string;
  responseText: string;
  priority?: number;
  enabled?: boolean;
};

function match(rule: any, text: string) {
  const source = text.trim();
  const trigger = String(rule.trigger_text ?? '').trim();
  switch (rule.match_type) {
    case 'all': return true;
    case 'equals': return source.toLocaleLowerCase() === trigger.toLocaleLowerCase();
    case 'startsWith': return source.toLocaleLowerCase().startsWith(trigger.toLocaleLowerCase());
    case 'regex': {
      try { return new RegExp(trigger, 'i').test(source); } catch { return false; }
    }
    default: return source.toLocaleLowerCase().includes(trigger.toLocaleLowerCase());
  }
}

export class AutoReplyEngine {
  private readonly processed = new Set<string>();

  constructor(private readonly db: AttozapDatabase, private readonly accounts: AccountManager, private readonly license: LicenseService) {
    accounts.on('message', payload => void this.handle(payload.accountId, payload.message));
  }

  list(accountId?: string) {
    if (accountId) return this.db.prepare(`SELECT * FROM auto_reply_rules WHERE account_id=? ORDER BY priority DESC, created_at ASC`).all(accountId);
    return this.db.prepare(`SELECT * FROM auto_reply_rules ORDER BY account_id, priority DESC, created_at ASC`).all();
  }

  create(input: AutoReplyRuleInput) {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO auto_reply_rules (id, account_id, name, match_type, trigger_text, response_text, enabled, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.accountId, input.name.trim() || 'Regra', input.matchType, input.triggerText, input.responseText, input.enabled === false ? 0 : 1, input.priority ?? 0);
    this.audit('autoreply.create', id, { accountId: input.accountId });
    return this.db.prepare(`SELECT * FROM auto_reply_rules WHERE id=?`).get(id);
  }

  update(id: string, input: Partial<AutoReplyRuleInput>) {
    const current = this.db.prepare(`SELECT * FROM auto_reply_rules WHERE id=?`).get(id) as any;
    if (!current) throw new Error('Regra não encontrada');
    this.db.prepare(`
      UPDATE auto_reply_rules SET name=?, match_type=?, trigger_text=?, response_text=?, enabled=?, priority=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(
      input.name ?? current.name,
      input.matchType ?? current.match_type,
      input.triggerText ?? current.trigger_text,
      input.responseText ?? current.response_text,
      input.enabled === undefined ? current.enabled : input.enabled ? 1 : 0,
      input.priority ?? current.priority,
      id,
    );
    this.audit('autoreply.update', id);
    return this.db.prepare(`SELECT * FROM auto_reply_rules WHERE id=?`).get(id);
  }

  remove(id: string) {
    this.db.prepare(`DELETE FROM auto_reply_rules WHERE id=?`).run(id);
    this.audit('autoreply.remove', id);
  }

  private async handle(accountId: string, message: IncomingMessage) {
    if (message.fromMe || !message.text.trim() || this.processed.has(message.id)) return;
    this.processed.add(message.id);
    if (this.processed.size > 5000) this.processed.clear();

    const provider = this.accounts.provider(accountId);
    let phone: string | undefined;
    try {
      const identity = await provider.resolveIdentity(message.remoteJid, message.remoteJidAlt);
      phone = identity.phone;
    } catch {
      // LID-only identities are valid. Do not convert their numeric user part into a fake phone number.
    }

    if (phone) {
      const contact = this.db.prepare(`SELECT is_blocked FROM contacts WHERE phone=?`).get(phone) as any;
      if (contact?.is_blocked) return;
    }

    const rules = this.db.prepare(`
      SELECT * FROM auto_reply_rules WHERE account_id=? AND enabled=1 ORDER BY priority DESC, created_at ASC
    `).all(accountId) as any[];
    const rule = rules.find(item => match(item, message.text));
    if (!rule) return;

    try {
      this.license.assertFeature('autoreply');
      this.license.reserve('outbound');
      await provider.sendText(message.remoteJid, rule.response_text);
      this.audit('autoreply.sent', rule.id, {
        accountId,
        remoteJid: message.remoteJid,
        remoteJidAlt: message.remoteJidAlt,
        addressingMode: message.addressingMode,
        incomingMessageId: message.id,
      });
    } catch (error) {
      this.audit('autoreply.failed', rule.id, { message: error instanceof Error ? error.message : String(error) });
    }
  }

  private audit(action: string, entityId: string, metadata?: unknown) {
    this.db.prepare(`INSERT INTO audit_log (actor, action, entity_type, entity_id, metadata_json) VALUES ('system', ?, 'auto_reply_rule', ?, ?)`).run(action, entityId, metadata ? JSON.stringify(metadata) : null);
  }
}
