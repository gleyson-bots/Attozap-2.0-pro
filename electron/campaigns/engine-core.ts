import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from '../database.js';
import type { AccountManager } from '../messaging/account-manager.js';
import type { ContactCardInput, LocationInput, MessageResult, MessagingProvider, PollInput, SendMediaInput } from '../messaging/provider.js';
import type { ChatService } from '../messaging/chat-service.js';
import type { LicenseService } from '../license-service.js';
import { getCachedMessageStatus, mergeDeliveryStatus, type StoredDeliveryStatus } from '../messaging/status.js';
import {
  finalizeRecipientSubmission,
  finishCampaignExecution,
  markCampaignRecipient,
  prepareRecipientAttempt,
  recordCampaignDelivery,
  recordCampaignDeliveryFailure,
  recomputeCampaign,
} from './delivery.js';

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

export type CampaignProfile = 'light' | 'moderate' | 'extreme' | 'custom';

export type CampaignOptions = {
  profile?: CampaignProfile;
  minDelayMs?: number;
  maxDelayMs?: number;
  minPartDelayMs?: number;
  maxPartDelayMs?: number;
  filterBeforeSend?: boolean;
  skipBlocked?: boolean;
  friendlyOnly?: boolean;
  messages?: string[];
  messageMode?: 'all' | 'rotate';
  accountIds?: string[];
  switchAccountAfterRecipients?: number;
};

export type CreateCampaignInput = {
  accountId: string;
  accountIds?: string[];
  name: string;
  targetType?: 'contact' | 'group';
  messageTemplate?: string;
  messageTemplates?: string[];
  messageMode?: 'all' | 'rotate';
  recipients: CampaignRecipient[];
  parts?: CampaignPart[];
  options?: CampaignOptions;
};

type RuntimeState = {
  paused: boolean;
  stopped: boolean;
  forceNext: boolean;
  nextAt: number | null;
  phase: 'preparing' | 'checking' | 'sending' | 'waiting' | 'paused' | 'completed' | 'stopped' | 'error';
  index: number;
  total: number;
  target?: string;
  accountId?: string;
  lastError?: string;
  lastForceAt?: number;
};

function digits(value: string) { return value.replace(/\D/g, ''); }
function isJid(value: string) { return value.includes('@'); }
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

function randomDelay(minInput: number | undefined, maxInput: number | undefined, fallbackMin: number, fallbackMax: number) {
  const min = Math.max(0, minInput ?? fallbackMin);
  const max = Math.max(min, maxInput ?? fallbackMax);
  return Math.floor(min + Math.random() * (max - min + 1));
}

function profileDefaults(profile: CampaignProfile | undefined): Partial<CampaignOptions> {
  switch (profile) {
    case 'light': return { minDelayMs: 45_000, maxDelayMs: 90_000, minPartDelayMs: 1_500, maxPartDelayMs: 3_500, switchAccountAfterRecipients: 10 };
    case 'moderate': return { minDelayMs: 20_000, maxDelayMs: 45_000, minPartDelayMs: 1_000, maxPartDelayMs: 2_500, switchAccountAfterRecipients: 8 };
    case 'extreme': return { minDelayMs: 8_000, maxDelayMs: 18_000, minPartDelayMs: 700, maxPartDelayMs: 1_800, switchAccountAfterRecipients: 5 };
    default: return {};
  }
}

function normalizeOptions(input: CampaignOptions | undefined): CampaignOptions {
  const profile = input?.profile ?? 'moderate';
  return { ...profileDefaults(profile), ...(input ?? {}), profile };
}

function recipientDelay(options: CampaignOptions) {
  return randomDelay(options.minDelayMs, options.maxDelayMs, 20_000, 45_000);
}

function partDelay(options: CampaignOptions) {
  return randomDelay(options.minPartDelayMs, options.maxPartDelayMs, 1_000, 2_500);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function renderTemplate(template: string, recipient: CampaignRecipient) {
  const inferredPhone = isJid(recipient.target) ? '' : digits(recipient.target);
  const firstName = String(recipient.name ?? '').trim().split(/\s+/)[0] ?? '';
  const values: Record<string, string> = {
    name: recipient.name ?? '',
    primeiro_nome: firstName,
    saudacao: greeting(),
    phone: recipient.variables?.phone ?? inferredPhone,
    jid: recipient.target,
    ...(recipient.variables ?? {}),
  };
  return template
    .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => values[key] ?? '')
    .replace(/\{([\w.-]+)\}/g, (_, key: string) => values[key] ?? '');
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function isReachoutRestriction(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /(?:\b463\b|reach.?out|timelock|time.?lock|account.?restriction|rejected by whatsapp)/i.test(text);
}

function failureMeta(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  const match = text.match(/(?:code|status|stub)\s*[:=]?\s*(\d{3})|\b(4\d{2}|5\d{2})\b/i);
  const failureCode = Number(match?.[1] ?? match?.[2]) || undefined;
  return { text, failureCode, failureClass: failureCode === 463 || isReachoutRestriction(error) ? 'account_restriction' : 'transport' };
}

export class CampaignEngine extends EventEmitter {
  private readonly runtime = new Map<string, RuntimeState>();

  constructor(private readonly db: AttozapDatabase, private readonly accounts: AccountManager, private readonly chats: ChatService, private readonly license: LicenseService) {
    super();
  }

  create(input: CreateCampaignInput) {
    this.license.assertFeature('campaigns');
    const recipients = input.recipients
      .map(recipient => ({ ...recipient, target: recipient.target.trim() }))
      .filter(recipient => Boolean(recipient.target));
    if (!recipients.length) throw new Error('A campanha precisa de pelo menos um destinatário');
    this.license.assertWithin('campaignRecipients', recipients.length);

    const id = randomUUID();
    const targetType = input.targetType ?? 'contact';
    const parts = input.parts ?? [];
    const accountIds = uniqueStrings([...(input.accountIds ?? []), input.accountId]);
    if (!accountIds.length) throw new Error('Selecione pelo menos uma conta');
    const messages = uniqueStrings([...(input.messageTemplates ?? []), input.messageTemplate]);
    if (!messages.length && !parts.length) throw new Error('A campanha precisa de uma mensagem ou mídia/documento');
    const normalized = normalizeOptions(input.options);
    const options: CampaignOptions = {
      ...normalized,
      messages,
      messageMode: input.messageMode ?? normalized.messageMode ?? 'all',
      accountIds,
    };

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO campaigns (id, account_id, name, target_type, message_template, attachments_json, options_json, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, accountIds[0], input.name.trim() || 'Campanha sem nome', targetType, messages[0] ?? '', JSON.stringify(parts), JSON.stringify(options), recipients.length);
      const insertRecipient = this.db.prepare(`
        INSERT INTO campaign_recipients (campaign_id, target, name, variables_json) VALUES (?, ?, ?, ?)
      `);
      for (const recipient of recipients) insertRecipient.run(id, recipient.target, recipient.name ?? null, JSON.stringify(recipient.variables ?? {}));
    });
    tx();
    this.audit('campaign.create', id, { total: recipients.length, targetType, accountIds, messageMode: options.messageMode, messages: messages.length, profile: options.profile });
    return this.get(id);
  }

  list() { return this.db.prepare(`SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 200`).all(); }
  get(id: string) { return this.db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id); }
  recipients(id: string) { return this.db.prepare(`SELECT * FROM campaign_recipients WHERE campaign_id = ? ORDER BY id ASC`).all(id); }

  runtimeState(id?: string) {
    const snapshot = (campaignId: string, state: RuntimeState) => ({ campaignId, ...state, remainingMs: state.nextAt ? Math.max(0, state.nextAt - Date.now()) : 0 });
    if (id) {
      const state = this.runtime.get(id);
      return state ? snapshot(id, state) : null;
    }
    return [...this.runtime.entries()].map(([campaignId, state]) => snapshot(campaignId, state));
  }

  forceNext(id: string) {
    const state = this.runtime.get(id);
    if (!state || state.stopped) throw new Error('A campanha não está em execução');
    if (state.paused) throw new Error('Retome a campanha antes de forçar o próximo item');
    if (state.phase !== 'waiting' || !state.nextAt) throw new Error('Não há uma espera ativa para antecipar');
    const now = Date.now();
    if (state.lastForceAt && now - state.lastForceAt < 10_000) throw new Error('Aguarde 10 segundos antes de usar Force novamente');
    state.forceNext = true;
    state.lastForceAt = now;
    state.nextAt = now;
    this.audit('campaign.force-next', id, { index: state.index, target: state.target });
    this.emitRuntime(id);
    return this.runtimeState(id);
  }

  async start(id: string) {
    this.license.assertFeature('campaigns');
    const campaign = this.db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id) as any;
    if (!campaign) throw new Error('Campanha não encontrada');
    if (this.runtime.has(id) || ['running', 'stopping'].includes(String(campaign.status))) throw new Error('Esta campanha já está em execução');
    if (campaign.status === 'awaiting_ack') throw new Error('A campanha ainda aguarda confirmações do WhatsApp');
    if (campaign.status === 'completed') throw new Error('Esta campanha já foi concluída');
    this.license.reserve('campaign');

    const options = normalizeOptions(JSON.parse(campaign.options_json || '{}') as CampaignOptions);
    const circuitUntil = campaign.circuit_open_until ? Date.parse(String(campaign.circuit_open_until)) : 0;
    if (campaign.circuit_state === 'open' && circuitUntil > Date.now()) {
      throw new Error(`Circuit breaker ativo até ${new Date(circuitUntil).toLocaleString()} devido a falhas remotas; aguarde o cooldown antes de retomar.`);
    }
    if (campaign.circuit_state === 'open') {
      this.db.prepare(`UPDATE campaigns SET circuit_state='closed',circuit_open_until=NULL,circuit_failures=0 WHERE id=?`).run(id);
    }
    const accountIds = uniqueStrings([...(options.accountIds ?? []), campaign.account_id]);
    if (!accountIds.length) throw new Error('Nenhuma conta selecionada para a campanha');
    const messages = uniqueStrings([...(options.messages ?? []), campaign.message_template]);
    const parts = JSON.parse(campaign.attachments_json || '[]') as CampaignPart[];
    if (!messages.length && !parts.length) throw new Error('A campanha não contém conteúdo enviável');
    const targetType = campaign.target_type as 'contact' | 'group';
    const rows = this.db.prepare(`SELECT * FROM campaign_recipients WHERE campaign_id = ? AND status IN ('pending','failed') ORDER BY id ASC`).all(id) as any[];
    const state: RuntimeState = { paused: false, stopped: false, forceNext: false, nextAt: null, phase: 'preparing', index: 0, total: rows.length };
    this.runtime.set(id, state);
    this.db.prepare(`UPDATE campaigns SET status='running',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),finished_at=NULL WHERE id=?`).run(id);
    recomputeCampaign(this.db, id);
    this.emitProgress(id);
    this.emitRuntime(id);

    try {
      let allowedNumbers: Set<string> | undefined;
      if (targetType === 'contact') {
        const plainNumbers = [...new Set(rows.map(row => String(row.target)).filter(target => !isJid(target)).map(digits).filter(Boolean))];
        if (plainNumbers.length) {
          this.setRuntime(id, { phase: 'checking' });
          const firstProvider = await this.accounts.ensureConnected(accountIds[0]);
          const checked = await firstProvider.checkNumbers(plainNumbers);
          if (options.filterBeforeSend) allowedNumbers = new Set(checked.filter(item => item.exists).map(item => digits(item.input)));
          const upsert = this.db.prepare(`
            INSERT INTO contacts (phone, wa_exists, last_checked_at) VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(phone) DO UPDATE SET wa_exists=excluded.wa_exists,last_checked_at=CURRENT_TIMESTAMP
          `);
          for (const item of checked) upsert.run(digits(item.input), item.exists ? 1 : 0);
        }
      }

      let processedRecipients = 0;
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (state.stopped) break;
        while (state.paused && !state.stopped) await sleep(250);
        if (state.stopped) break;

        const originalTarget = String(row.target).trim();
        const normalizedPhone = isJid(originalTarget) ? '' : digits(originalTarget);
        const recipient: CampaignRecipient = { target: originalTarget, name: row.name ?? undefined, variables: JSON.parse(row.variables_json || '{}') };
        const switchEvery = Math.max(0, Math.floor(options.switchAccountAfterRecipients ?? 0));
        const providerIndex = accountIds.length === 1 || switchEvery === 0 ? 0 : Math.floor(processedRecipients / switchEvery) % accountIds.length;
        const selectedAccountId = accountIds[providerIndex];
        this.setRuntime(id, { phase: 'checking', index: rowIndex + 1, target: originalTarget, accountId: selectedAccountId, lastError: undefined });

        const listState = targetType === 'contact' ? this.contactListState(selectedAccountId, originalTarget) : { blocked: false, friendly: false };
        if ((options.skipBlocked !== false && listState.blocked) || (options.friendlyOnly && !listState.friendly)) {
          markCampaignRecipient(this.db, row.id, 'skipped', options.friendlyOnly ? 'Fora da friendly list' : 'Blocklist');
          this.emitProgress(id);
          continue;
        }
        if (allowedNumbers && !isJid(originalTarget) && !allowedNumbers.has(normalizedPhone)) {
          markCampaignRecipient(this.db, row.id, 'skipped', 'Número não localizado no WhatsApp');
          this.emitProgress(id);
          continue;
        }

        prepareRecipientAttempt(this.db, row.id);
        try {
          this.setRuntime(id, { phase: 'sending' });
          const provider = await this.accounts.ensureConnected(selectedAccountId, 20_000);
          let registered = 0;
          const selectedMessages = options.messageMode === 'rotate' && messages.length
            ? [messages[Math.floor(Math.random() * messages.length)]]
            : messages;

          for (let index = 0; index < selectedMessages.length; index++) {
            const text = renderTemplate(selectedMessages[index], recipient).trim();
            if (text) {
              const receipt = await this.chats.sendText(selectedAccountId, originalTarget, text);
              this.logMessage(receipt.id, selectedAccountId, receipt.remoteJid || originalTarget, 'out', 'text', text, 'pending');
              recordCampaignDelivery(this.db, { campaignId: id, recipientId: row.id, accountId: selectedAccountId, messageId: receipt.id, messageType: 'text' });
              registered++;
            }
            if (index < selectedMessages.length - 1) await sleep(partDelay(options));
          }

          for (let index = 0; index < parts.length; index++) {
            const part = parts[index];
            const result = await this.sendPart(selectedAccountId, originalTarget, part, recipient);
            this.logMessage(result.id, selectedAccountId, result.remoteJid || originalTarget, 'out', part.type, '', 'pending');
            recordCampaignDelivery(this.db, { campaignId: id, recipientId: row.id, accountId: selectedAccountId, messageId: result.id, messageType: part.type });
            registered++;
            if (index < parts.length - 1) await sleep(partDelay(options));
          }

          if (!registered) throw new Error('A campanha não contém conteúdo enviável');
          finalizeRecipientSubmission(this.db, row.id);
          processedRecipients++;
        } catch (error) {
          const meta = failureMeta(error);
          const message = meta.text;
          const current = this.db.prepare(`SELECT circuit_failures,circuit_breaker_limit,circuit_breaker_cooldown_minutes FROM campaigns WHERE id=?`).get(id) as any;
          const failures = Number(current?.circuit_failures ?? 0) + 1;
          const limit = Math.max(1, Math.min(5, Number(current?.circuit_breaker_limit ?? 3)));
          const cooldownMinutes = Math.max(5, Math.min(1440, Number(current?.circuit_breaker_cooldown_minutes ?? 60)));
          const shouldOpen = isReachoutRestriction(error) || failures >= limit;
          const openUntil = shouldOpen ? new Date(Date.now() + cooldownMinutes * 60_000).toISOString() : null;
          recordCampaignDeliveryFailure(this.db, { campaignId: id, recipientId: row.id, accountId: selectedAccountId, error: message });
          finalizeRecipientSubmission(this.db, row.id);
          this.logMessage(randomUUID(), selectedAccountId, originalTarget, 'out', 'error', '', 'failed', message);
          this.db.prepare(`UPDATE campaigns SET circuit_state=?,circuit_open_until=?,circuit_failures=?,status=? WHERE id=?`).run(shouldOpen ? 'open' : 'closed', openUntil, failures, shouldOpen ? 'paused' : 'running', id);
          this.setRuntime(id, { phase: shouldOpen ? 'paused' : 'error', paused: shouldOpen, lastError: shouldOpen ? `${message} Circuit breaker pausado por ${cooldownMinutes} min; não haverá novas tentativas automáticas.` : message });
          this.emit('error', { campaignId: id, recipientId: row.id, target: originalTarget, message, failureCode: meta.failureCode, failureClass: meta.failureClass, circuitOpen: shouldOpen });
          processedRecipients++;
        }

        this.emitProgress(id);
        if (!state.stopped && rowIndex < rows.length - 1) await this.waitRecipientDelay(id, state, recipientDelay(options));
      }

      const finalStatus = finishCampaignExecution(this.db, id, state.stopped);
      state.phase = state.stopped ? 'stopped' : 'completed';
      state.nextAt = null;
      this.audit(`campaign.${finalStatus}`, id);
      this.emitProgress(id);
      this.emitRuntime(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.phase = 'error';
      state.lastError = message;
      state.nextAt = null;
      this.db.prepare(`
        UPDATE campaigns SET status='failed',finished_at=CURRENT_TIMESTAMP
        WHERE id=? AND status NOT IN ('stopped','completed')
      `).run(id);
      this.audit('campaign.failed', id, { message });
      this.emit('error', { campaignId: id, message });
      this.emitProgress(id);
      this.emitRuntime(id);
      throw error;
    } finally {
      setTimeout(() => this.runtime.delete(id), 1_500);
    }
    return this.get(id);
  }

  pause(id: string) {
    const state = this.runtime.get(id); if (!state) return false;
    state.paused = true; state.phase = 'paused';
    this.db.prepare(`UPDATE campaigns SET status='paused' WHERE id=?`).run(id);
    this.emitProgress(id); this.emitRuntime(id); return true;
  }

  resume(id: string) {
    const state = this.runtime.get(id); if (!state) return false;
    const campaign = this.db.prepare(`SELECT circuit_state,circuit_open_until FROM campaigns WHERE id=?`).get(id) as any;
    const circuitUntil = campaign?.circuit_open_until ? Date.parse(String(campaign.circuit_open_until)) : 0;
    if (campaign?.circuit_state === 'open' && circuitUntil > Date.now()) {
      throw new Error(`Circuit breaker ativo até ${new Date(circuitUntil).toLocaleString()}; aguarde o cooldown antes de retomar.`);
    }
    state.paused = false; state.phase = state.nextAt ? 'waiting' : 'preparing';
    this.db.prepare(`UPDATE campaigns SET status='running',circuit_state='closed',circuit_open_until=NULL,circuit_failures=0 WHERE id=?`).run(id);
    this.emitProgress(id); this.emitRuntime(id); return true;
  }

  stop(id: string) {
    const state = this.runtime.get(id); if (!state) return false;
    state.stopped = true; state.paused = false; state.phase = 'stopped'; state.nextAt = null;
    this.db.prepare(`UPDATE campaigns SET status='stopping' WHERE id=?`).run(id);
    this.emitProgress(id); this.emitRuntime(id); return true;
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

  listSchedules() { return this.db.prepare(`SELECT s.*, c.name AS campaign_name FROM schedules s JOIN campaigns c ON c.id=s.campaign_id ORDER BY s.run_at ASC`).all(); }

  async runDueSchedules() {
    const due = this.db.prepare(`SELECT * FROM schedules WHERE status='pending' AND run_at <= ? ORDER BY run_at ASC`).all(new Date().toISOString()) as any[];
    for (const item of due) {
      this.db.prepare(`UPDATE schedules SET status='running' WHERE id=?`).run(item.id);
      try {
        await this.start(item.campaign_id);
        this.db.prepare(`UPDATE schedules SET status='completed',executed_at=CURRENT_TIMESTAMP WHERE id=?`).run(item.id);
      } catch (error) {
        this.db.prepare(`UPDATE schedules SET status='failed',executed_at=CURRENT_TIMESTAMP WHERE id=?`).run(item.id);
        this.emit('error', { campaignId: item.campaign_id, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  private async waitRecipientDelay(id: string, state: RuntimeState, ms: number) {
    state.nextAt = Date.now() + ms; state.forceNext = false; state.phase = 'waiting'; this.emitRuntime(id);
    while (!state.stopped) {
      if (state.paused) { await sleep(250); continue; }
      if (state.forceNext || !state.nextAt || Date.now() >= state.nextAt) break;
      await sleep(Math.min(250, Math.max(25, state.nextAt - Date.now())));
    }
    state.forceNext = false; state.nextAt = null;
    if (!state.stopped) state.phase = 'preparing';
    this.emitRuntime(id);
  }

  private setRuntime(id: string, patch: Partial<RuntimeState>) {
    const state = this.runtime.get(id); if (!state) return;
    Object.assign(state, patch); this.emitRuntime(id);
  }

  private emitRuntime(id: string) { this.emit('runtime', this.runtimeState(id)); }

  private async sendPart(accountId: string, target: string, part: CampaignPart, recipient: CampaignRecipient): Promise<MessageResult> {
    const render = (value?: string) => value ? renderTemplate(value, recipient) : value;
    switch (part.type) {
      case 'image': return this.chats.sendContent(accountId, target, { type: 'image', input: { ...part.input, caption: render(part.input.caption) } });
      case 'video': return this.chats.sendContent(accountId, target, { type: 'video', input: { ...part.input, caption: render(part.input.caption) } });
      case 'document': return this.chats.sendContent(accountId, target, { type: 'document', input: { ...part.input, caption: render(part.input.caption) } });
      case 'audio': return this.chats.sendContent(accountId, target, { type: 'audio', input: part.input });
      case 'sticker': return this.chats.sendContent(accountId, target, { type: 'sticker', input: part.input });
      case 'location': return this.chats.sendContent(accountId, target, { type: 'location', input: part.input });
      case 'contact': return this.chats.sendContent(accountId, target, { type: 'contact', input: { ...part.input, displayName: render(part.input.displayName) ?? part.input.displayName } });
      case 'poll': return this.chats.sendContent(accountId, target, { type: 'poll', input: { ...part.input, name: render(part.input.name) ?? part.input.name, values: part.input.values.map(value => render(value) ?? value) } });
    }
    throw new Error('Tipo de conteúdo não suportado');
  }

  private contactListState(accountId: string, target: string) {
    let phone = isJid(target) ? undefined : digits(target);
    if (!phone && isJid(target)) {
      const identity = this.db.prepare(`
        SELECT phone FROM wa_identities
        WHERE account_id=? AND (canonical_jid=? OR lid=? OR pn_jid=?)
        ORDER BY last_seen_at DESC LIMIT 1
      `).get(accountId, target, target, target) as { phone?: string | null } | undefined;
      phone = identity?.phone ?? undefined;
    }
    if (!phone) return { blocked: false, friendly: false };
    const row = this.db.prepare(`SELECT is_blocked,is_friendly FROM contacts WHERE phone=?`).get(phone) as any;
    return { blocked: Boolean(row?.is_blocked), friendly: Boolean(row?.is_friendly) };
  }

  private emitProgress(campaignId: string) { this.emit('progress', this.get(campaignId)); }

  private logMessage(id: string, accountId: string, remoteJid: string, direction: 'in'|'out', type: string, text: string, status: StoredDeliveryStatus, error?: string) {
    const existing = this.db.prepare(`
      SELECT status,error,created_at FROM message_log
      WHERE id=? AND account_id=? LIMIT 1
    `).get(id, accountId) as { status?: string; error?: string | null; created_at?: string } | undefined;
    const cached = status === 'pending' ? getCachedMessageStatus(this.db, accountId, id) : undefined;
    let finalStatus: StoredDeliveryStatus = cached?.status ?? status;
    let finalError = finalStatus === 'failed' ? (cached?.error ?? error ?? 'WhatsApp rejeitou a mensagem') : undefined;

    if (existing?.status && status === 'pending') {
      finalStatus = mergeDeliveryStatus(existing.status, finalStatus);
      if (finalStatus === 'failed') finalError = finalError ?? existing.error ?? 'WhatsApp rejeitou a mensagem';
    }

    if (existing) {
      this.db.prepare(`
        UPDATE message_log SET
          remote_jid=?, direction=?, message_type=?, text=COALESCE(?,text), status=?, error=?
        WHERE id=? AND account_id=?
      `).run(remoteJid, direction, type, text || null, finalStatus, finalStatus === 'failed' ? finalError ?? 'WhatsApp rejeitou a mensagem' : null, id, accountId);
      return;
    }

    this.db.prepare(`
      INSERT OR IGNORE INTO message_log (id, account_id, remote_jid, direction, message_type, text, status, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, accountId, remoteJid, direction, type, text || null, finalStatus, finalStatus === 'failed' ? finalError ?? 'WhatsApp rejeitou a mensagem' : null, new Date().toISOString());
  }

  private audit(action: string, entityId: string, metadata?: unknown) {
    this.db.prepare(`INSERT INTO audit_log (actor, action, entity_type, entity_id, metadata_json) VALUES ('local-user', ?, 'campaign', ?, ?)`).run(action, entityId, metadata ? JSON.stringify(metadata) : null);
  }
}
