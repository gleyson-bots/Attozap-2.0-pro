import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { AttozapDatabase } from '../database.js';
import type { ChatService } from '../messaging/chat-service.js';
import { generateWarmupText, type WarmupAiProvider } from './ai-text.js';

export type WarmupMediaItem = {
  path: string;
  type?: 'image' | 'video' | 'document' | 'audio' | 'sticker';
  caption?: string;
  ptt?: boolean;
};

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
  mediaItems?: WarmupMediaItem[];
  mediaChance?: number;
};

type OwnAccount = { id: string; name: string; phone?: string; status: string };
type RuntimePhase = 'starting' | 'waiting' | 'typing' | 'sending' | 'sent' | 'error' | 'paused';
type Runtime = {
  stopped: boolean;
  timer?: NodeJS.Timeout;
  phase: RuntimePhase;
  nextRunAt?: number;
  senderAccountId?: string;
  recipientAccountId?: string;
  senderName?: string;
  recipientName?: string;
  target?: string;
  lastMessage?: string;
  lastMediaType?: string;
  lastMediaName?: string;
  lastError?: string;
  roundPosition?: number;
  roundSize?: number;
};

function unique(values: string[]) { return [...new Set(values.map(value => value.trim()).filter(Boolean))]; }
function digits(value: string) { return value.replace(/\D/g, ''); }
function clamp(value: number | undefined, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}
function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function randomBetween(min: number, max: number) { return Math.floor(min + Math.random() * (max - min + 1)); }
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

function mediaType(item: WarmupMediaItem): 'image' | 'video' | 'document' | 'audio' | 'sticker' {
  if (item.type) return item.type;
  const ext = extname(item.path).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.mkv', '.webm'].includes(ext)) return 'video';
  if (['.mp3', '.ogg', '.opus', '.wav', '.m4a', '.aac'].includes(ext)) return 'audio';
  if (ext === '.webp') return 'sticker';
  return 'document';
}

function mimeFor(path: string, type: ReturnType<typeof mediaType>) {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === '.webp') return type === 'sticker' ? 'image/webp' : 'image/webp';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (['.ogg', '.opus'].includes(ext)) return 'audio/ogg; codecs=opus';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.aac') return 'audio/aac';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.zip') return 'application/zip';
  return type === 'document' ? 'application/octet-stream' : undefined;
}

export class WarmupEngine {
  private readonly runtime = new Map<string, Runtime>();

  constructor(private readonly db: AttozapDatabase, private readonly chats: ChatService) {}

  private setting(key: string) {
    return (this.db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value?: string } | undefined)?.value;
  }

  private setSetting(key: string, value: string) {
    this.db.prepare(`
      INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP
    `).run(key, value);
  }

  private mediaFor(id: string): WarmupMediaItem[] {
    try { return JSON.parse(this.setting(`warmup.media.${id}`) || '[]'); }
    catch { return []; }
  }

  private mediaChanceFor(id: string) {
    return clamp(Number(this.setting(`warmup.mediaChance.${id}`) || 25), 0, 100, 25);
  }

  private saveMedia(id: string, items: WarmupMediaItem[] = [], chance = 25) {
    const clean = items
      .filter(item => item?.path?.trim())
      .slice(0, 30)
      .map(item => ({
        ...item,
        path: item.path.trim(),
        type: mediaType(item),
        caption: item.caption?.trim() || undefined,
        ptt: item.ptt ?? mediaType(item) === 'audio',
      }));
    this.setSetting(`warmup.media.${id}`, JSON.stringify(clean));
    this.setSetting(`warmup.mediaChance.${id}`, String(clamp(chance, 0, 100, 25)));
  }

  list() {
    return (this.db.prepare(`SELECT * FROM warmup_profiles ORDER BY created_at DESC`).all() as any[]).map(this.hydrate);
  }

  get(id: string) {
    const row = this.db.prepare(`SELECT * FROM warmup_profiles WHERE id=?`).get(id) as any;
    return row ? this.hydrate(row) : undefined;
  }

  runtimeStatus(profileId?: string) {
    const serialize = (id: string, runtime: Runtime) => ({
      profileId: id,
      running: !runtime.stopped,
      phase: runtime.phase,
      nextRunAt: runtime.nextRunAt ?? null,
      remainingSeconds: runtime.nextRunAt ? Math.max(0, Math.ceil((runtime.nextRunAt - Date.now()) / 1000)) : 0,
      senderAccountId: runtime.senderAccountId ?? null,
      recipientAccountId: runtime.recipientAccountId ?? null,
      senderName: runtime.senderName ?? null,
      recipientName: runtime.recipientName ?? null,
      target: runtime.target ?? null,
      lastMessage: runtime.lastMessage ?? null,
      lastMediaType: runtime.lastMediaType ?? null,
      lastMediaName: runtime.lastMediaName ?? null,
      lastError: runtime.lastError ?? null,
      roundPosition: runtime.roundPosition ?? null,
      roundSize: runtime.roundSize ?? null,
    });
    if (profileId) {
      const runtime = this.runtime.get(profileId);
      return runtime ? serialize(profileId, runtime) : null;
    }
    return [...this.runtime.entries()].map(([id, runtime]) => serialize(id, runtime));
  }

  private ownAccounts(): OwnAccount[] {
    return (this.db.prepare(`SELECT id,name,phone,status FROM instances ORDER BY created_at`).all() as OwnAccount[])
      .map(row => ({ ...row, phone: row.phone ? digits(row.phone) : undefined }));
  }

  /** Only validates identity/phone. Socket liveness is checked separately. */
  private validatePeerAccounts(rawIds: string[]) {
    const ids = unique(rawIds).slice(0, 20);
    if (ids.length < 2) throw new Error('Modo Pool precisa de pelo menos 2 contas próprias');
    const all = new Map(this.ownAccounts().map(account => [account.id, account]));
    const peers = ids.map(id => all.get(id)).filter(Boolean) as OwnAccount[];
    if (peers.length !== ids.length) throw new Error('Uma ou mais contas do Pool não existem mais');
    const unresolved = peers.filter(account => !account.phone);
    if (unresolved.length) throw new Error(`Resolva o número destas contas antes de iniciar: ${unresolved.map(account => account.name).join(', ')}`);
    return peers;
  }

  private ensureLiveAccount(accountId: string) {
    return this.chats.ensureAccountLive(accountId);
  }

  private async ensureLivePeers(peers: OwnAccount[]) {
    const failed: string[] = [];
    for (const peer of peers) {
      try { await this.ensureLiveAccount(peer.id); }
      catch { failed.push(peer.name); }
    }
    if (failed.length) throw new Error(`Não foi possível ativar o socket destas contas: ${failed.join(', ')}`);
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
        SELECT phone FROM wa_identities
        WHERE account_id=? AND (canonical_jid=? OR lid=? OR pn_jid=?) LIMIT 1
      `).get(accountId, target, target, target) as { phone?: string } | undefined;
      if (!identity?.phone || !ownPhones.has(digits(identity.phone))) invalid.push(target);
    }

    if (invalid.length) {
      throw new Error(`Aquecimento aceita somente seus próprios números cadastrados e grupos já sincronizados nesta conta. Destino(s) não autorizado(s): ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`);
    }
    return targets;
  }

  create(input: WarmupProfileInput) {
    const mode = input.mode === 'pool' ? 'pool' : 'direct';
    const peers = mode === 'pool' ? this.validatePeerAccounts(input.peerAccountIds ?? []) : [];
    const accountId = (mode === 'pool' ? peers[0]?.id : input.accountId)?.trim();
    const name = input.name?.trim();
    if (!accountId) throw new Error('Selecione uma conta');
    if (!name) throw new Error('Informe um nome para o perfil');

    const targets = mode === 'direct' ? this.validateTargets(accountId, input.targets ?? []) : [];
    if (mode === 'direct' && !targets.length) throw new Error('Selecione pelo menos um número seu ou grupo sincronizado');
    const messages = unique(input.messages ?? []).slice(0, 30);
    const source = input.messageSource === 'ai' ? 'ai' : 'library';
    if (source === 'library' && !messages.length && !(input.mediaItems?.length)) throw new Error('Informe mensagens ou mídias para o aquecimento');

    const min = clamp(input.minDelaySeconds, 180, 3600, 300);
    const max = Math.max(min, clamp(input.maxDelaySeconds, min, 7200, 900));
    const daily = clamp(input.dailyLimit, 1, 30, 12);
    const start = clamp(input.activeHourStart, 0, 23, 9);
    const end = clamp(input.activeHourEnd, start + 1, 24, 20);
    const aiDaily = Math.min(daily, clamp(input.aiDailyLimit, 1, 12, 6));
    const id = randomUUID();

    this.db.prepare(`
      INSERT INTO warmup_profiles
      (id,account_id,name,targets_json,messages_json,min_delay_seconds,max_delay_seconds,daily_limit,active_hour_start,active_hour_end,last_reset_date,message_source,ai_provider,ai_model,ai_prompt,ai_daily_limit,mode,peer_account_ids_json,round_robin_index)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
    `).run(id, accountId, name, JSON.stringify(targets), JSON.stringify(messages), min, max, daily, start, end, todayLocal(), source, input.aiProvider ?? null, input.aiModel?.trim() || null, input.aiPrompt?.trim() || null, aiDaily, mode, JSON.stringify(peers.map(account => account.id)));

    this.saveMedia(id, input.mediaItems ?? [], input.mediaChance ?? 25);
    this.audit('warmup.create', id, { mode, peers: peers.length, media: input.mediaItems?.length ?? 0 });
    return this.get(id);
  }

  update(id: string, input: Partial<WarmupProfileInput>) {
    const current = this.get(id);
    if (!current) throw new Error('Perfil de aquecimento não encontrado');
    if (this.runtime.has(id)) throw new Error('Pare o aquecimento antes de editar o perfil');

    const mode = input.mode ?? current.mode ?? 'direct';
    const peers = mode === 'pool' ? this.validatePeerAccounts(input.peerAccountIds ?? current.peer_account_ids ?? []) : [];
    const accountId = mode === 'pool' ? peers[0].id : input.accountId ?? current.account_id;
    const targets = mode === 'direct' ? this.validateTargets(accountId, input.targets ?? current.targets) : [];
    const messages = unique(input.messages ?? current.messages).slice(0, 30);
    const source = input.messageSource ?? current.message_source ?? 'library';
    const media = input.mediaItems ?? current.media_items ?? [];
    if (source === 'library' && !messages.length && !media.length) throw new Error('Informe mensagens ou mídias para o aquecimento');

    const min = clamp(input.minDelaySeconds ?? current.min_delay_seconds, 180, 3600, 300);
    const max = Math.max(min, clamp(input.maxDelaySeconds ?? current.max_delay_seconds, min, 7200, 900));
    const daily = clamp(input.dailyLimit ?? current.daily_limit, 1, 30, 12);
    const start = clamp(input.activeHourStart ?? current.active_hour_start, 0, 23, 9);
    const end = clamp(input.activeHourEnd ?? current.active_hour_end, start + 1, 24, 20);
    const aiDaily = Math.min(daily, clamp(input.aiDailyLimit ?? current.ai_daily_limit, 1, 12, 6));

    this.db.prepare(`
      UPDATE warmup_profiles SET
        account_id=?,name=?,targets_json=?,messages_json=?,min_delay_seconds=?,max_delay_seconds=?,daily_limit=?,
        active_hour_start=?,active_hour_end=?,message_source=?,ai_provider=?,ai_model=?,ai_prompt=?,ai_daily_limit=?,
        mode=?,peer_account_ids_json=?,round_robin_index=0,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(accountId, String(input.name ?? current.name).trim(), JSON.stringify(targets), JSON.stringify(messages), min, max, daily, start, end, source, input.aiProvider ?? current.ai_provider ?? null, input.aiModel ?? current.ai_model ?? null, input.aiPrompt ?? current.ai_prompt ?? null, aiDaily, mode, JSON.stringify(peers.map(account => account.id)), id);

    this.saveMedia(id, media, input.mediaChance ?? current.media_chance ?? 25);
    return this.get(id);
  }

  remove(id: string) {
    this.stop(id);
    this.db.prepare(`DELETE FROM warmup_profiles WHERE id=?`).run(id);
    this.db.prepare(`DELETE FROM settings WHERE key IN (?,?)`).run(`warmup.media.${id}`, `warmup.mediaChance.${id}`);
    this.audit('warmup.remove', id);
    return true;
  }

  logs(profileId?: string, limit = 500) {
    const safe = Math.max(1, Math.min(2000, Number(limit) || 500));
    return profileId
      ? this.db.prepare(`SELECT * FROM warmup_logs WHERE profile_id=? ORDER BY created_at DESC LIMIT ?`).all(profileId, safe)
      : this.db.prepare(`SELECT * FROM warmup_logs ORDER BY created_at DESC LIMIT ?`).all(safe);
  }

  async start(id: string) {
    const profile = this.get(id);
    if (!profile) throw new Error('Perfil de aquecimento não encontrado');

    if (profile.mode === 'pool') {
      const peers = this.validatePeerAccounts(profile.peer_account_ids);
      await this.ensureLivePeers(peers);
    } else {
      this.validateTargets(profile.account_id, profile.targets);
      await this.ensureLiveAccount(profile.account_id);
    }

    if (this.runtime.has(id)) return profile;
    const runtime: Runtime = { stopped: false, phase: 'starting' };
    this.runtime.set(id, runtime);
    this.db.prepare(`UPDATE warmup_profiles SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    this.audit('warmup.start', id, { mode: profile.mode });
    void this.tick(id, runtime);
    return this.get(id);
  }

  stop(id: string, persist = true) {
    const runtime = this.runtime.get(id);
    if (runtime?.timer) clearTimeout(runtime.timer);
    if (runtime) runtime.stopped = true;
    this.runtime.delete(id);
    if (persist) {
      this.db.prepare(`UPDATE warmup_profiles SET status='stopped',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
      this.audit('warmup.stop', id);
    }
    return this.get(id);
  }

  shutdown() {
    // A normal desktop close must not turn an active profile into `stopped`.
    // The next launch can then recreate its in-memory timer.
    for (const id of [...this.runtime.keys()]) this.stop(id, false);
  }

  /**
   * Resumes profiles that were running when the desktop process was closed.
   * The old implementation persisted `status=running` but never recreated the
   * in-memory timer, leaving the UI apparently active without any future turn.
   */
  async resumePersisted() {
    const profiles = this.list().filter(profile => profile.status === 'running');
    for (const profile of profiles) {
      try {
        await this.start(profile.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const runtime: Runtime = { stopped: false, phase: 'error', lastError: `Retoma pendente: ${message}` };
        this.runtime.set(profile.id, runtime);
        this.schedule(profile.id, runtime, 30, 'error');
        this.audit('warmup.resume-retry', profile.id, { error: message });
        console.error('[warmup:resume-retry]', profile.id, message);
      }
    }
    return this.runtimeStatus();
  }

  private secondsUntilWindow(profile: any) {
    const now = new Date();
    const start = clamp(profile.active_hour_start, 0, 23, 9);
    const end = clamp(profile.active_hour_end, start + 1, 24, 20);
    const next = new Date(now);
    if (now.getHours() >= end) next.setDate(next.getDate() + 1);
    next.setHours(start, 0, 0, 0);
    return Math.max(60, Math.ceil((next.getTime() - now.getTime()) / 1000));
  }

  private windowLabel(profile: any) {
    const startValue = clamp(profile.active_hour_start, 0, 23, 9);
    const start = String(startValue).padStart(2, '0');
    const endValue = clamp(profile.active_hour_end, startValue + 1, 24, 20);
    const end = endValue === 24 ? '24' : String(endValue).padStart(2, '0');
    return `${start}:00–${end}:00`;
  }

  private localClock() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  private aiUsedToday(profileId: string) {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS total FROM warmup_logs
      WHERE profile_id=? AND source='ai' AND date(created_at,'localtime')=date('now','localtime')
    `).get(profileId) as { total: number };
    return Number(row?.total ?? 0);
  }

  private recentMessages(profileId: string, target: string, pool = false) {
    const rows = pool
      ? this.db.prepare(`SELECT message FROM warmup_logs WHERE profile_id=? AND status='sent' ORDER BY created_at DESC LIMIT 10`).all(profileId)
      : this.db.prepare(`SELECT message FROM warmup_logs WHERE profile_id=? AND target_jid=? AND status='sent' ORDER BY created_at DESC LIMIT 8`).all(profileId, target);
    return (rows as Array<{ message?: string }>).map(row => row.message || '').filter(Boolean).reverse();
  }

  private async chooseMessage(profile: any, target: string, senderName?: string, recipientName?: string): Promise<{ text: string; source: 'library' | 'ai' }> {
    const messages = profile.messages as string[];
    if (profile.message_source === 'ai' && profile.ai_provider && this.aiUsedToday(profile.id) < profile.ai_daily_limit) {
      try {
        const relationship = senderName && recipientName
          ? `Você é ${senderName} respondendo para ${recipientName}. Continue naturalmente a conversa curta entre duas contas de teste próprias.`
          : '';
        const text = await generateWarmupText(this.db, {
          provider: profile.ai_provider,
          model: profile.ai_model,
          prompt: [profile.ai_prompt, relationship].filter(Boolean).join('\n'),
          target,
          recentMessages: this.recentMessages(profile.id, target, profile.mode === 'pool'),
        });
        return { text, source: 'ai' };
      } catch (error) {
        if (!messages.length && !(profile.media_items?.length)) throw error;
      }
    }

    if (!messages.length) return { text: '', source: 'library' };
    const index = Math.max(0, Number(profile.sent_today ?? 0)) % messages.length;
    return { text: messages[index], source: 'library' };
  }

  private schedule(id: string, runtime: Runtime, seconds: number, phase: RuntimePhase = 'waiting') {
    const safe = Math.max(1, Math.floor(seconds));
    Object.assign(runtime, { phase, nextRunAt: Date.now() + safe * 1000 });
    runtime.timer = setTimeout(() => void this.tick(id, runtime), safe * 1000);
  }

  private async typing(accountId: string, target: string, text: string, runtime: Runtime) {
    const visibleText = text || '...';
    const ms = Math.max(2500, Math.min(9000, 1800 + visibleText.length * 45 + randomBetween(300, 1400)));
    Object.assign(runtime, { phase: 'typing', nextRunAt: Date.now() + ms });

    try {
      const resolved = await this.chats.resolveTarget(accountId, target);
      const provider = await this.ensureLiveAccount(accountId) as any;
      if (provider.sendPresence) await provider.sendPresence(resolved, 'composing').catch(() => undefined);
      else if (provider.socket?.sendPresenceUpdate) await provider.socket.sendPresenceUpdate('composing', resolved).catch(() => undefined);
      await sleep(ms);
      if (runtime.stopped) return;
      if (provider.sendPresence) await provider.sendPresence(resolved, 'paused').catch(() => undefined);
      else if (provider.socket?.sendPresenceUpdate) await provider.socket.sendPresenceUpdate('paused', resolved).catch(() => undefined);
    } catch {
      await sleep(Math.min(ms, 3500));
    }
  }

  private registerTurnFailure(id: string, runtime: Runtime, accountId: string, target: string | undefined, recipientAccountId: string | undefined, error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    runtime.phase = 'error';
    runtime.lastError = text;
    this.db.prepare(`
      INSERT INTO warmup_logs
      (profile_id,account_id,target_jid,message,status,error,source,sender_account_id,recipient_account_id)
      VALUES (?,?,?,?, 'failed',?,?,?,?)
    `).run(id, accountId, target ?? null, null, text, 'library', accountId, recipientAccountId ?? null);
  }

  private async tick(id: string, runtime: Runtime) {
    if (runtime.stopped) return;
    const profile = this.get(id);
    if (!profile || profile.status !== 'running') return;

    const today = todayLocal();
    if (profile.last_reset_date !== today) {
      this.db.prepare(`UPDATE warmup_profiles SET sent_today=0,last_reset_date=? WHERE id=?`).run(today, id);
      profile.sent_today = 0;
    }

    const hour = new Date().getHours();
    if (hour < profile.active_hour_start || hour >= profile.active_hour_end) {
      const seconds = this.secondsUntilWindow(profile);
      runtime.lastError = `Fora da janela configurada (${this.windowLabel(profile)}); agora ${this.localClock()} no horário local; retoma em ${Math.ceil(seconds / 60)} min`;
      this.schedule(id, runtime, seconds, 'paused');
      return;
    }
    if (profile.sent_today >= profile.daily_limit) {
      runtime.lastError = 'Limite diário atingido';
      this.schedule(id, runtime, 60, 'paused');
      return;
    }

    let senderAccountId = profile.account_id as string;
    let recipientAccountId: string | undefined;
    let target: string | undefined;
    let senderName: string | undefined;
    let recipientName: string | undefined;
    let nextIndex: number | undefined;
    let roundComplete = true;
    let roundPosition = 1;
    let roundSize = 1;

    try {
      if (profile.mode === 'pool') {
        const peers = this.validatePeerAccounts(profile.peer_account_ids);
        await this.ensureLivePeers(peers);
        const index = Math.max(0, Number(profile.round_robin_index ?? 0)) % peers.length;
        const sender = peers[index];
        const recipient = peers[(index + 1) % peers.length];
        senderAccountId = sender.id;
        recipientAccountId = recipient.id;
        target = recipient.phone!;
        senderName = sender.name;
        recipientName = recipient.name;
        nextIndex = (index + 1) % peers.length;
        roundComplete = nextIndex === 0;
        roundPosition = index + 1;
        roundSize = peers.length;
      } else {
        const targets = profile.targets as string[];
        if (!targets.length) throw new Error('O perfil não possui destinos válidos');
        target = targets[Math.floor(Math.random() * targets.length)];
        senderName = this.ownAccounts().find(account => account.id === senderAccountId)?.name;
        await this.ensureLiveAccount(senderAccountId);
      }
    } catch (error) {
      this.registerTurnFailure(id, runtime, senderAccountId, target, recipientAccountId, error);
      this.schedule(id, runtime, randomBetween(30, 60), 'error');
      return;
    }

    Object.assign(runtime, {
      senderAccountId,
      recipientAccountId,
      senderName,
      recipientName,
      target,
      lastError: undefined,
      roundPosition,
      roundSize,
      lastMediaType: undefined,
      lastMediaName: undefined,
    });

    let chosen: { text: string; source: 'library' | 'ai' } | undefined;
    let success = false;

    try {
      chosen = await this.chooseMessage(profile, target!, senderName, recipientName);
      const media = (profile.media_items ?? []) as WarmupMediaItem[];
      const shouldUseMedia = media.length > 0 && (!chosen.text || Math.random() * 100 < profile.media_chance);
      const item = shouldUseMedia ? media[Math.floor(Math.random() * media.length)] : undefined;

      if (item && !existsSync(item.path)) {
        throw new Error(`Arquivo da biblioteca não existe mais: ${basename(item.path)}`);
      }

      Object.assign(runtime, {
        lastMessage: chosen.text,
        lastMediaType: item ? mediaType(item) : undefined,
        lastMediaName: item ? basename(item.path) : undefined,
      });

      await this.typing(senderAccountId, target!, chosen.text, runtime);
      if (runtime.stopped) return;
      runtime.phase = 'sending';
      runtime.nextRunAt = undefined;

      let sent: any;
      if (item) {
        const type = mediaType(item);
        sent = await this.chats.sendMedia(senderAccountId, target!, type, {
          path: item.path,
          caption: ['image', 'video', 'document'].includes(type) ? (item.caption || chosen.text || undefined) : undefined,
          fileName: type === 'document' ? basename(item.path) : undefined,
          mimetype: mimeFor(item.path, type),
          ptt: type === 'audio' ? (item.ptt ?? true) : undefined,
        });
      } else {
        if (!chosen.text) throw new Error('Não há texto nem mídia selecionada para este turno');
        sent = await this.chats.sendText(senderAccountId, target!, chosen.text);
      }

      const logText = item
        ? `[${mediaType(item)}] ${basename(item.path)}${chosen.text ? ` · ${chosen.text}` : ''}`
        : chosen.text;
      this.db.prepare(`
        INSERT INTO warmup_logs
        (profile_id,account_id,target_jid,message,status,source,sender_account_id,recipient_account_id)
        VALUES (?,?,?,?, 'sent',?,?,?)
      `).run(id, senderAccountId, sent.resolvedTarget ?? target, logText, chosen.source, senderAccountId, recipientAccountId ?? null);
      this.db.prepare(`UPDATE warmup_profiles SET sent_today=sent_today+1,last_run_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
      runtime.phase = 'sent';
      success = true;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.db.prepare(`
        INSERT INTO warmup_logs
        (profile_id,account_id,target_jid,message,status,error,source,sender_account_id,recipient_account_id)
        VALUES (?,?,?,?, 'failed',?,?,?,?)
      `).run(id, senderAccountId, target, chosen?.text ?? null, text, chosen?.source ?? 'library', senderAccountId, recipientAccountId ?? null);
      runtime.phase = 'error';
      runtime.lastError = text;
    }

    // A failed pool sender keeps the turn. This prevents A from repeatedly
    // sending while B silently fails and makes the retry visible in the monitor.
    if (profile.mode === 'pool' && success && nextIndex !== undefined) {
      this.db.prepare(`UPDATE warmup_profiles SET round_robin_index=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(nextIndex, id);
    }

    if (profile.mode === 'pool' && !success) {
      this.schedule(id, runtime, randomBetween(30, 60), 'error');
      return;
    }
    if (profile.mode === 'pool' && !roundComplete) {
      this.schedule(id, runtime, randomBetween(18, 42));
      return;
    }

    this.schedule(id, runtime, success ? randomBetween(profile.min_delay_seconds, profile.max_delay_seconds) : randomBetween(45, 90));
  }

  private hydrate = (row: any) => ({
    ...row,
    targets: JSON.parse(row.targets_json || '[]'),
    messages: JSON.parse(row.messages_json || '[]'),
    peer_account_ids: JSON.parse(row.peer_account_ids_json || '[]'),
    media_items: this.mediaFor(row.id),
    media_chance: this.mediaChanceFor(row.id),
  });

  private audit(action: string, id: string, metadata?: unknown) {
    this.db.prepare(`INSERT INTO audit_log (actor,action,entity_type,entity_id,metadata_json) VALUES ('local-user',?,'warmup',?,?)`).run(action, id, metadata ? JSON.stringify(metadata) : null);
  }
}
