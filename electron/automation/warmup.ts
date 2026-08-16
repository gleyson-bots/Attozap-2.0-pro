import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from '../database.js';
import type { ChatService } from '../messaging/chat-service.js';
import { generateWarmupText, type WarmupAiProvider } from './ai-text.js';

export type WarmupProfileInput = {
  accountId: string;
  name: string;
  targets: string[];
  messages: string[];
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  dailyLimit?: number;
  activeHourStart?: number;
  activeHourEnd?: number;
  messageSource?: 'library' | 'ai';
  aiProvider?: WarmupAiProvider;
  aiModel?: string;
  aiPrompt?: string;
  aiDailyLimit?: number;
  mode?: 'direct' | 'pool';
  peerAccountIds?: string[];
};

type Runtime = { stopped: boolean; timer?: NodeJS.Timeout };
type OwnAccount = { id: string; name: string; phone?: string; status: string };
function unique(values: string[]) { return [...new Set(values.map(value => value.trim()).filter(Boolean))]; }
function digits(value: string) { return value.replace(/\D/g, ''); }
function clamp(value: number | undefined, min: number, max: number, fallback: number) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function todayLocal() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
function randomBetween(min: number, max: number) { return Math.floor(min + Math.random() * (max - min + 1)); }

export class WarmupEngine {
  private readonly runtime = new Map<string, Runtime>();
  constructor(private readonly db: AttozapDatabase, private readonly chats: ChatService) {}

  list() { return (this.db.prepare(`SELECT * FROM warmup_profiles ORDER BY created_at DESC`).all() as any[]).map(this.hydrate); }
  get(id: string) { const row = this.db.prepare(`SELECT * FROM warmup_profiles WHERE id=?`).get(id) as any; return row ? this.hydrate(row) : undefined; }

  private ownAccounts(): OwnAccount[] {
    return (this.db.prepare(`SELECT id,name,phone,status FROM instances ORDER BY created_at`).all() as OwnAccount[])
      .map(row => ({ ...row, phone: row.phone ? digits(row.phone) : undefined }));
  }

  private validatePeerAccounts(rawIds: string[]) {
    const ids = unique(rawIds).slice(0, 20);
    if (ids.length < 2) throw new Error('Modo Pool precisa de pelo menos 2 contas próprias conectadas');
    const all = new Map(this.ownAccounts().map(account => [account.id, account]));
    const peers = ids.map(id => all.get(id)).filter(Boolean) as OwnAccount[];
    if (peers.length !== ids.length) throw new Error('Uma ou mais contas do Pool não existem mais');
    const notReady = peers.filter(account => account.status !== 'connected' || !account.phone);
    if (notReady.length) throw new Error(`Conecte e resolva o número destas contas antes de iniciar: ${notReady.map(account => account.name).join(', ')}`);
    return peers;
  }

  private validateTargets(accountId: string, rawTargets: string[]) {
    const targets = unique(rawTargets).slice(0, 50);
    const ownPhones = new Set(this.ownAccounts().map(row => row.phone).filter(Boolean) as string[]);
    const invalid: string[] = [];
    for (const target of targets) {
      if (target.endsWith('@g.us')) {
        const group = this.db.prepare(`SELECT 1 FROM group_cache WHERE account_id=? AND group_id=?`).get(accountId, target);
        if (!group) invalid.push(target);
        continue;
      }
      if (!target.includes('@')) {
        if (!ownPhones.has(digits(target))) invalid.push(target);
        continue;
      }
      const targetDigits = target.endsWith('@s.whatsapp.net') ? digits(target.split('@')[0] ?? '') : '';
      if (targetDigits && ownPhones.has(targetDigits)) continue;
      const identity = this.db.prepare(`
        SELECT phone FROM wa_identities WHERE account_id=? AND (canonical_jid=? OR lid=? OR pn_jid=?) LIMIT 1
      `).get(accountId, target, target, target) as { phone?: string } | undefined;
      if (!identity?.phone || !ownPhones.has(digits(identity.phone))) invalid.push(target);
    }
    if (invalid.length) throw new Error(`Aquecimento aceita somente seus próprios números cadastrados e grupos já sincronizados nesta conta. Destino(s) não autorizado(s): ${invalid.slice(0,3).join(', ')}${invalid.length > 3 ? '…' : ''}`);
    return targets;
  }

  create(input: WarmupProfileInput) {
    const mode = input.mode === 'pool' ? 'pool' : 'direct';
    const peerAccounts = mode === 'pool' ? this.validatePeerAccounts(input.peerAccountIds ?? []) : [];
    const accountId = (mode === 'pool' ? peerAccounts[0]?.id : input.accountId)?.trim();
    const name = input.name?.trim();
    if (!accountId) throw new Error('Selecione uma conta');
    if (!name) throw new Error('Informe um nome para o perfil');
    const targets = mode === 'direct' ? this.validateTargets(accountId, input.targets ?? []) : [];
    if (mode === 'direct' && !targets.length) throw new Error('Selecione pelo menos um número seu ou grupo sincronizado');
    const messages = unique(input.messages ?? []).slice(0, 30);
    const messageSource = input.messageSource === 'ai' ? 'ai' : 'library';
    if (messageSource === 'library' && !messages.length) throw new Error('Informe pelo menos uma mensagem da biblioteca');
    const minDelay = clamp(input.minDelaySeconds, 180, 3600, 300);
    const maxDelay = Math.max(minDelay, clamp(input.maxDelaySeconds, minDelay, 7200, 900));
    const dailyLimit = clamp(input.dailyLimit, 1, 30, 12);
    const activeStart = clamp(input.activeHourStart, 0, 23, 9); const activeEnd = clamp(input.activeHourEnd, activeStart + 1, 24, 20);
    const aiDailyLimit = Math.min(dailyLimit, clamp(input.aiDailyLimit, 1, 12, 6));
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO warmup_profiles
        (id,account_id,name,targets_json,messages_json,min_delay_seconds,max_delay_seconds,daily_limit,active_hour_start,active_hour_end,last_reset_date,message_source,ai_provider,ai_model,ai_prompt,ai_daily_limit,mode,peer_account_ids_json,round_robin_index)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
    `).run(id, accountId, name, JSON.stringify(targets), JSON.stringify(messages), minDelay, maxDelay, dailyLimit, activeStart, activeEnd, todayLocal(), messageSource, input.aiProvider ?? null, input.aiModel?.trim() || null, input.aiPrompt?.trim() || null, aiDailyLimit, mode, JSON.stringify(peerAccounts.map(account => account.id)));
    this.audit('warmup.create', id, { accountId, mode, targets: targets.length, peers: peerAccounts.length, dailyLimit, messageSource, aiDailyLimit });
    return this.get(id);
  }

  update(id: string, input: Partial<WarmupProfileInput>) {
    const current = this.get(id);
    if (!current) throw new Error('Perfil de aquecimento não encontrado');
    if (this.runtime.has(id)) throw new Error('Pare o aquecimento antes de editar o perfil');
    const mode = input.mode ?? current.mode ?? 'direct';
    const peerAccounts = mode === 'pool' ? this.validatePeerAccounts(input.peerAccountIds ?? current.peer_account_ids ?? []) : [];
    const accountId = mode === 'pool' ? peerAccounts[0].id : input.accountId ?? current.account_id;
    const targets = mode === 'direct' ? this.validateTargets(accountId, input.targets ?? current.targets) : [];
    if (mode === 'direct' && !targets.length) throw new Error('Selecione pelo menos um número seu ou grupo sincronizado');
    const messages = unique(input.messages ?? current.messages).slice(0, 30);
    const source = input.messageSource ?? current.message_source ?? 'library';
    if (source === 'library' && !messages.length) throw new Error('Informe pelo menos uma mensagem da biblioteca');
    const minDelay = clamp(input.minDelaySeconds ?? current.min_delay_seconds, 180, 3600, 300);
    const maxDelay = Math.max(minDelay, clamp(input.maxDelaySeconds ?? current.max_delay_seconds, minDelay, 7200, 900));
    const dailyLimit = clamp(input.dailyLimit ?? current.daily_limit, 1, 30, 12);
    const activeStart = clamp(input.activeHourStart ?? current.active_hour_start, 0, 23, 9); const activeEnd = clamp(input.activeHourEnd ?? current.active_hour_end, activeStart + 1, 24, 20);
    const aiDailyLimit = Math.min(dailyLimit, clamp(input.aiDailyLimit ?? current.ai_daily_limit, 1, 12, 6));
    this.db.prepare(`
      UPDATE warmup_profiles SET account_id=?,name=?,targets_json=?,messages_json=?,min_delay_seconds=?,max_delay_seconds=?,daily_limit=?,active_hour_start=?,active_hour_end=?,message_source=?,ai_provider=?,ai_model=?,ai_prompt=?,ai_daily_limit=?,mode=?,peer_account_ids_json=?,round_robin_index=0,updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(accountId, String(input.name ?? current.name).trim(), JSON.stringify(targets), JSON.stringify(messages), minDelay, maxDelay, dailyLimit, activeStart, activeEnd, source, input.aiProvider ?? current.ai_provider ?? null, input.aiModel ?? current.ai_model ?? null, input.aiPrompt ?? current.ai_prompt ?? null, aiDailyLimit, mode, JSON.stringify(peerAccounts.map(account => account.id)), id);
    return this.get(id);
  }

  remove(id: string) { this.stop(id); this.db.prepare(`DELETE FROM warmup_profiles WHERE id=?`).run(id); this.audit('warmup.remove', id); return true; }
  logs(profileId?: string, limit = 500) { const safe = Math.max(1, Math.min(2000, Number(limit) || 500)); return profileId ? this.db.prepare(`SELECT * FROM warmup_logs WHERE profile_id=? ORDER BY created_at DESC LIMIT ?`).all(profileId, safe) : this.db.prepare(`SELECT * FROM warmup_logs ORDER BY created_at DESC LIMIT ?`).all(safe); }
  start(id: string) {
    const profile = this.get(id); if (!profile) throw new Error('Perfil de aquecimento não encontrado');
    if (profile.mode === 'pool') this.validatePeerAccounts(profile.peer_account_ids);
    else this.validateTargets(profile.account_id, profile.targets);
    if (this.runtime.has(id)) return profile;
    const runtime: Runtime = { stopped: false }; this.runtime.set(id, runtime);
    this.db.prepare(`UPDATE warmup_profiles SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    this.audit('warmup.start', id, { mode: profile.mode }); void this.tick(id, runtime); return this.get(id);
  }
  stop(id: string) { const runtime = this.runtime.get(id); if (runtime?.timer) clearTimeout(runtime.timer); if (runtime) runtime.stopped = true; this.runtime.delete(id); this.db.prepare(`UPDATE warmup_profiles SET status='stopped',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id); this.audit('warmup.stop', id); return this.get(id); }
  shutdown() { for (const id of [...this.runtime.keys()]) this.stop(id); }

  private aiUsedToday(profileId: string) {
    const row = this.db.prepare(`SELECT COUNT(*) AS total FROM warmup_logs WHERE profile_id=? AND source='ai' AND date(created_at,'localtime')=date('now','localtime')`).get(profileId) as { total: number };
    return Number(row?.total ?? 0);
  }

  private recentMessages(profileId: string, target: string) {
    return (this.db.prepare(`SELECT message FROM warmup_logs WHERE profile_id=? AND target_jid=? AND status='sent' ORDER BY created_at DESC LIMIT 8`).all(profileId, target) as Array<{ message?: string }>).map(row => row.message || '').filter(Boolean).reverse();
  }

  private async chooseMessage(profile: any, target: string, senderName?: string, recipientName?: string): Promise<{ text: string; source: 'library'|'ai' }> {
    const messages = profile.messages as string[];
    if (profile.message_source === 'ai' && profile.ai_provider && this.aiUsedToday(profile.id) < profile.ai_daily_limit) {
      try {
        const relationship = senderName && recipientName ? `Você é ${senderName} respondendo para ${recipientName}. Continue naturalmente a conversa curta entre duas contas de teste próprias.` : '';
        const text = await generateWarmupText(this.db, { provider: profile.ai_provider, model: profile.ai_model, prompt: [profile.ai_prompt, relationship].filter(Boolean).join('\n'), target, recentMessages: this.recentMessages(profile.id, target) });
        return { text, source: 'ai' };
      } catch (error) {
        if (!messages.length) throw error;
      }
    }
    if (!messages.length) throw new Error('Limite diário de IA atingido e não há mensagens locais de fallback');
    const index = Math.max(0, Number(profile.sent_today ?? 0)) % messages.length;
    return { text: messages[index], source: 'library' };
  }

  private nextPoolPair(profile: any) {
    const peers = this.validatePeerAccounts(profile.peer_account_ids);
    const index = Math.max(0, Number(profile.round_robin_index ?? 0)) % peers.length;
    const sender = peers[index];
    const recipient = peers[(index + 1) % peers.length];
    if (!recipient.phone) throw new Error(`Número da conta ${recipient.name} ainda não foi resolvido`);
    return { sender, recipient, target: recipient.phone, nextIndex: (index + 1) % peers.length };
  }

  private async tick(id: string, runtime: Runtime) {
    if (runtime.stopped) return;
    const profile = this.get(id);
    if (!profile || profile.status !== 'running') return;
    const today = todayLocal();
    if (profile.last_reset_date !== today) { this.db.prepare(`UPDATE warmup_profiles SET sent_today=0,last_reset_date=? WHERE id=?`).run(today, id); profile.sent_today = 0; profile.last_reset_date = today; }
    const hour = new Date().getHours();
    if (hour < profile.active_hour_start || hour >= profile.active_hour_end || profile.sent_today >= profile.daily_limit) { runtime.timer = setTimeout(() => void this.tick(id, runtime), 60_000); return; }

    let senderAccountId = profile.account_id as string;
    let recipientAccountId: string | undefined;
    let target: string;
    let senderName: string | undefined;
    let recipientName: string | undefined;
    let nextIndex: number | undefined;

    if (profile.mode === 'pool') {
      const pair = this.nextPoolPair(profile);
      senderAccountId = pair.sender.id;
      recipientAccountId = pair.recipient.id;
      target = pair.target;
      senderName = pair.sender.name;
      recipientName = pair.recipient.name;
      nextIndex = pair.nextIndex;
    } else {
      const targets = profile.targets as string[];
      target = targets[Math.floor(Math.random() * targets.length)];
    }

    let chosen: { text: string; source: 'library'|'ai' } | undefined;
    try {
      chosen = await this.chooseMessage(profile, target, senderName, recipientName);
      const sent = await this.chats.sendText(senderAccountId, target, chosen.text);
      this.db.prepare(`INSERT INTO warmup_logs (profile_id,account_id,target_jid,message,status,source,sender_account_id,recipient_account_id) VALUES (?,?,?,?, 'sent',?,?,?)`).run(id, senderAccountId, sent.resolvedTarget ?? target, chosen.text, chosen.source, senderAccountId, recipientAccountId ?? null);
      this.db.prepare(`UPDATE warmup_profiles SET sent_today=sent_today+1,last_run_at=CURRENT_TIMESTAMP,round_robin_index=COALESCE(?,round_robin_index),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(nextIndex ?? null, id);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.db.prepare(`INSERT INTO warmup_logs (profile_id,account_id,target_jid,message,status,error,source,sender_account_id,recipient_account_id) VALUES (?,?,?,?, 'failed',?,?,?,?)`).run(id, senderAccountId, target, chosen?.text ?? null, text, chosen?.source ?? (profile.message_source === 'ai' ? 'ai' : 'library'), senderAccountId, recipientAccountId ?? null);
    }
    const delaySeconds = randomBetween(profile.min_delay_seconds, profile.max_delay_seconds);
    runtime.timer = setTimeout(() => void this.tick(id, runtime), delaySeconds * 1000);
  }

  private hydrate = (row: any) => ({ ...row, targets: JSON.parse(row.targets_json || '[]'), messages: JSON.parse(row.messages_json || '[]'), peer_account_ids: JSON.parse(row.peer_account_ids_json || '[]') });
  private audit(action: string, id: string, metadata?: unknown) { this.db.prepare(`INSERT INTO audit_log (actor,action,entity_type,entity_id,metadata_json) VALUES ('local-user',?,'warmup',?,?)`).run(action, id, metadata ? JSON.stringify(metadata) : null); }
}
