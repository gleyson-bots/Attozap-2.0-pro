import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from '../database.js';
import type { AccountManager } from '../messaging/account-manager.js';
import type { ContactCardInput, LocationInput, PollInput, SendMediaInput } from '../messaging/provider.js';

export type CampaignRecipient = {
  target: string;
  name?: string;
  variables?: Record<string, string>;
};

export type CampaignPart =
  | { type: 'image'; input: SendMediaInput }
  | { type: 'video'; input: SendMediaInput }
  | { type: 'document'; input: SendMediaInput }
  | { type: 'audio'; input: SendMediaInput }
  | { type: 'sticker'; input: SendMediaInput }
  | { type: 'location'; input: LocationInput }
  | { type: 'contact'; input: ContactCardInput }
  | { type: 'poll'; input: PollInput };

export type CampaignOptions = {
  minDelayMs?: number;
  maxDelayMs?: number;
  filterBeforeSend?: boolean;
  skipBlocked?: boolean;
  friendlyOnly?: boolean;
};

export type CreateCampaignInput = {
  accountId: string;
  name: string;
  targetType?: 'contact' | 'group';
  messageTemplate?: string;
  recipients: CampaignRecipient[];
  parts?: CampaignPart[];
  options?: CampaignOptions;
};

type RuntimeState = { paused: boolean; stopped: boolean };

function digits(value: string) { return value.replace(/\D/g, ''); }
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

function delay(options: CampaignOptions) {
  const min = Math.max(500, options.minDelayMs ?? 1500);
  const max = Math.max(min, options.maxDelayMs ?? 3000);
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function renderTemplate(template: string, recipient: CampaignRecipient) {
  const values: Record<string, string> = {
    name: recipient.name ?? '',
    phone: digits(recipient.target),
    ...(recipient.variables ?? {}),
  };
  return template
    .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => values[key] ?? '')
    .replace(/\{([\w.-]+)\}/g, (_, key: string) => values[key] ?? '');
}

export class CampaignEngine extends EventEmitter {
  private readonly runtime = new Map<string, RuntimeState>();

  constructor(private readonly db: AttozapDatabase, private readonly accounts: AccountManager) {
    super();
  }

  create(input: CreateCampaignInput) {
    if (!input.recipients.length) throw new Error('A campanha precisa de pelo menos um destinatário');
    const id = randomUUID();
    const targetType = input.targetType ?? 'contact';
    const parts = input.parts ?? [];
    const options = input.options ?? {};
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO campaigns (id, account_id, name, target_type, message_template, attachments_json, options_json, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, input.accountId, input.name.trim() || 'Campanha sem nome', targetType, input.messageTemplate ?? '', JSON.stringify(parts), JSON.stringify(options), input.recipients.length);
      const insertRecipient = this.db.prepare(`
        INSERT INTO campaign_recipients (campaign_id, target, name, variables_json) VALUES (?, ?, ?, ?)
      `);
      for (const recipient of input.recipients) {
        insertRecipient.run(id, recipient.target.trim(), recipient.name ?? null, JSON.stringify(recipient.variables ?? {}));
      }
    });
    tx();
    this.audit('campaign.create', id, { total: input.recipients.length, targetType });
    return this.get(id);
  }

  list() {
    return this.db.prepare(`SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 200`).all();
  }

  get(id: string) {
    return this.db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id);
  }

  recipients(id: string) {
    return this.db.prepare(`SELECT * FROM campaign_recipients WHERE campaign_id = ? ORDER BY id ASC`).all(id);
  }

  async start(id: string) {
    const campaign = this.db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id) as any;
    if (!campaign) throw new Error('Campanha não encontrada');
    if (this.runtime.has(id)) throw new Error('Esta campanha já está em execução');

    const provider = this.accounts.provider(campaign.account_id);
    const options = JSON.parse(campaign.options_json || '{}') as CampaignOptions;
    const parts = JSON.parse(campaign.attachments_json || '[]') as CampaignPart[];
    const targetType = campaign.target_type as 'contact' | 'group';
    const rows = this.db.prepare(`SELECT * FROM campaign_recipients WHERE campaign_id = ? AND status IN ('pending','failed') ORDER BY id ASC`).all(id) as any[];
    const state: RuntimeState = { paused: false, stopped: false };
    this.runtime.set(id, state);
    this.db.prepare(`UPDATE campaigns SET status='running', started_at=COALESCE(started_at,CURRENT_TIMESTAMP), finished_at=NULL WHERE id=?`).run(id);
    this.emitProgress(id);

    try {
      let allowedNumbers: Set<string> | undefined;
      if (targetType === 'contact' && options.filterBeforeSend) {
        const checked = await provider.checkNumbers(rows.map(row => row.target));
        allowedNumbers = new Set(checked.filter(item => item.exists).map(item => digits(item.input)));
        const upsert = this.db.prepare(`
          INSERT INTO contacts (phone, wa_exists, last_checked_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(phone) DO UPDATE SET wa_exists=excluded.wa_exists, last_checked_at=CURRENT_TIMESTAMP
        `);
        for (const item of checked) upsert.run(digits(item.input), item.exists ? 1 : 0);
      }

      for (const row of rows) {
        if (state.stopped) break;
        while (state.paused && !state.stopped) await sleep(250);
        if (state.stopped) break;

        const recipient: CampaignRecipient = {
          target: row.target,
          name: row.name ?? undefined,
          variables: JSON.parse(row.variables_json || '{}'),
        };

        const listState = targetType === 'contact' ? this.contactListState(row.target) : { blocked: false, friendly: false };
        if ((options.skipBlocked !== false && listState.blocked) || (options.friendlyOnly && !listState.friendly)) {
          this.markRecipient(row.id, 'skipped', options.friendlyOnly ? 'Fora da friendly list' : 'Blocklist');
          this.increment(id, 'skipped');
          this.emitProgress(id);
          continue;
        }
        if (allowedNumbers && !allowedNumbers.has(digits(row.target))) {
          this.markRecipient(row.id, 'skipped', 'Número não localizado no WhatsApp');
          this.increment(id, 'skipped');
          this.emitProgress(id);
          continue;
        }

        try {
          let messageId: string | undefined;
          const text = renderTemplate(campaign.message_template || '', recipient).trim();
          if (text) messageId = (await provider.sendText(row.target, text)).id;
          for (const part of parts) {
            const result = await this.sendPart(provider, row.target, part, recipient);
            messageId = result.id;
          }
          this.db.prepare(`UPDATE campaign_recipients SET status='sent', error=NULL, message_id=?, sent_at=CURRENT_TIMESTAMP WHERE id=?`).run(messageId ?? null, row.id);
          this.increment(id, 'sent');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.markRecipient(row.id, 'failed', message);
          this.increment(id, 'failed');
        }
        this.emitProgress(id);
        if (!state.stopped) await sleep(delay(options));
      }

      const finalStatus = state.stopped ? 'stopped' : 'completed';
      this.db.prepare(`UPDATE campaigns SET status=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(finalStatus, id);
      this.audit(`campaign.${finalStatus}`, id);
      this.emitProgress(id);
    } finally {
      this.runtime.delete(id);
    }
    return this.get(id);
  }

  pause(id: string) {
    const state = this.runtime.get(id);
    if (!state) return false;
    state.paused = true;
    this.db.prepare(`UPDATE campaigns SET status='paused' WHERE id=?`).run(id);
    this.emitProgress(id);
    return true;
  }

  resume(id: string) {
    const state = this.runtime.get(id);
    if (!state) return false;
    state.paused = false;
    this.db.prepare(`UPDATE campaigns SET status='running' WHERE id=?`).run(id);
    this.emitProgress(id);
    return true;
  }

  stop(id: string) {
    const state = this.runtime.get(id);
    if (!state) return false;
    state.stopped = true;
    state.paused = false;
    this.db.prepare(`UPDATE campaigns SET status='stopping' WHERE id=?`).run(id);
    this.emitProgress(id);
    return true;
  }

  schedule(campaignId: string, runAt: string) {
    const timestamp = new Date(runAt);
    if (Number.isNaN(timestamp.getTime())) throw new Error('Data de agendamento inválida');
    const id = randomUUID();
    this.db.prepare(`INSERT INTO schedules (id, campaign_id, run_at) VALUES (?, ?, ?)`).run(id, campaignId, timestamp.toISOString());
    this.db.prepare(`UPDATE campaigns SET status='scheduled' WHERE id=?`).run(campaignId);
    this.audit('campaign.schedule', campaignId, { scheduleId: id, runAt: timestamp.toISOString() });
    return this.db.prepare(`SELECT * FROM schedules WHERE id=?`).get(id);
  }

  listSchedules() {
    return this.db.prepare(`SELECT s.*, c.name AS campaign_name FROM schedules s JOIN campaigns c ON c.id=s.campaign_id ORDER BY s.run_at ASC`).all();
  }

  async runDueSchedules() {
    const due = this.db.prepare(`SELECT * FROM schedules WHERE status='pending' AND run_at <= ? ORDER BY run_at ASC`).all(new Date().toISOString()) as any[];
    for (const item of due) {
      this.db.prepare(`UPDATE schedules SET status='running' WHERE id=?`).run(item.id);
      try {
        await this.start(item.campaign_id);
        this.db.prepare(`UPDATE schedules SET status='completed', executed_at=CURRENT_TIMESTAMP WHERE id=?`).run(item.id);
      } catch (error) {
        this.db.prepare(`UPDATE schedules SET status='failed', executed_at=CURRENT_TIMESTAMP WHERE id=?`).run(item.id);
        this.emit('error', { campaignId: item.campaign_id, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  private async sendPart(provider: ReturnType<AccountManager['provider']>, target: string, part: CampaignPart, recipient: CampaignRecipient) {
    const render = (value?: string) => value ? renderTemplate(value, recipient) : value;
    switch (part.type) {
      case 'image': return provider.sendImage(target, { ...part.input, caption: render(part.input.caption) });
      case 'video': return provider.sendVideo(target, { ...part.input, caption: render(part.input.caption) });
      case 'document': return provider.sendDocument(target, { ...part.input, caption: render(part.input.caption) });
      case 'audio': return provider.sendAudio(target, part.input);
      case 'sticker': return provider.sendSticker(target, part.input);
      case 'location': return provider.sendLocation(target, part.input);
      case 'contact': return provider.sendContact(target, { ...part.input, displayName: render(part.input.displayName) ?? part.input.displayName });
      case 'poll': return provider.sendPoll(target, { ...part.input, name: render(part.input.name) ?? part.input.name, values: part.input.values.map(value => render(value) ?? value) });
    }
  }

  private contactListState(phone: string) {
    const row = this.db.prepare(`SELECT is_blocked, is_friendly FROM contacts WHERE phone=?`).get(digits(phone)) as any;
    return { blocked: Boolean(row?.is_blocked), friendly: Boolean(row?.is_friendly) };
  }

  private markRecipient(id: number, status: string, error?: string) {
    this.db.prepare(`UPDATE campaign_recipients SET status=?, error=? WHERE id=?`).run(status, error ?? null, id);
  }

  private increment(id: string, field: 'sent' | 'failed' | 'skipped') {
    this.db.prepare(`UPDATE campaigns SET ${field}=${field}+1 WHERE id=?`).run(id);
  }

  private emitProgress(id: string) {
    this.emit('progress', this.get(id));
  }

  private audit(action: string, entityId: string, metadata?: unknown) {
    this.db.prepare(`INSERT INTO audit_log (actor, action, entity_type, entity_id, metadata_json) VALUES ('local-user', ?, 'campaign', ?, ?)`).run(action, entityId, metadata ? JSON.stringify(metadata) : null);
  }
}
