import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from '../database.js';
import type { ChatService } from '../messaging/chat-service.js';

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
};

type Runtime = { stopped: boolean; timer?: NodeJS.Timeout };

function unique(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function clamp(value: number | undefined, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

function todayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function randomBetween(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export class WarmupEngine {
  private readonly runtime = new Map<string, Runtime>();

  constructor(private readonly db: AttozapDatabase, private readonly chats: ChatService) {}

  list() {
    return (this.db.prepare(`SELECT * FROM warmup_profiles ORDER BY created_at DESC`).all() as any[]).map(this.hydrate);
  }

  get(id: string) {
    const row = this.db.prepare(`SELECT * FROM warmup_profiles WHERE id=?`).get(id) as any;
    return row ? this.hydrate(row) : undefined;
  }

  create(input: WarmupProfileInput) {
    const accountId = input.accountId?.trim();
    const name = input.name?.trim();
    const targets = unique(input.targets ?? []).slice(0, 50);
    const messages = unique(input.messages ?? []).slice(0, 30);
    if (!accountId) throw new Error('Selecione uma conta');
    if (!name) throw new Error('Informe um nome para o perfil');
    if (!targets.length) throw new Error('Informe pelo menos um contato/grupo de teste que consentiu com o aquecimento');
    if (!messages.length) throw new Error('Informe pelo menos uma mensagem de teste');

    const minDelay = clamp(input.minDelaySeconds, 180, 3600, 300);
    const maxDelay = Math.max(minDelay, clamp(input.maxDelaySeconds, minDelay, 7200, 900));
    const dailyLimit = clamp(input.dailyLimit, 1, 30, 12);
    const activeStart = clamp(input.activeHourStart, 0, 23, 9);
    const activeEnd = clamp(input.activeHourEnd, activeStart + 1, 24, 20);
    const id = randomUUID();

    this.db.prepare(`
      INSERT INTO warmup_profiles
        (id,account_id,name,targets_json,messages_json,min_delay_seconds,max_delay_seconds,daily_limit,active_hour_start,active_hour_end,last_reset_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, accountId, name, JSON.stringify(targets), JSON.stringify(messages), minDelay, maxDelay, dailyLimit, activeStart, activeEnd, todayLocal());
    this.audit('warmup.create', id, { accountId, targets: targets.length, dailyLimit });
    return this.get(id);
  }

  update(id: string, input: Partial<WarmupProfileInput>) {
    const current = this.get(id);
    if (!current) throw new Error('Perfil de aquecimento não encontrado');
    if (this.runtime.has(id)) throw new Error('Pare o aquecimento antes de editar o perfil');
    const next: WarmupProfileInput = {
      accountId: input.accountId ?? current.account_id,
      name: input.name ?? current.name,
      targets: input.targets ?? current.targets,
      messages: input.messages ?? current.messages,
      minDelaySeconds: input.minDelaySeconds ?? current.min_delay_seconds,
      maxDelaySeconds: input.maxDelaySeconds ?? current.max_delay_seconds,
      dailyLimit: input.dailyLimit ?? current.daily_limit,
      activeHourStart: input.activeHourStart ?? current.active_hour_start,
      activeHourEnd: input.activeHourEnd ?? current.active_hour_end,
    };
    const targets = unique(next.targets).slice(0, 50);
    const messages = unique(next.messages).slice(0, 30);
    const minDelay = clamp(next.minDelaySeconds, 180, 3600, 300);
    const maxDelay = Math.max(minDelay, clamp(next.maxDelaySeconds, minDelay, 7200, 900));
    const dailyLimit = clamp(next.dailyLimit, 1, 30, 12);
    const activeStart = clamp(next.activeHourStart, 0, 23, 9);
    const activeEnd = clamp(next.activeHourEnd, activeStart + 1, 24, 20);
    this.db.prepare(`
      UPDATE warmup_profiles SET account_id=?,name=?,targets_json=?,messages_json=?,min_delay_seconds=?,max_delay_seconds=?,daily_limit=?,active_hour_start=?,active_hour_end=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(next.accountId, next.name.trim(), JSON.stringify(targets), JSON.stringify(messages), minDelay, maxDelay, dailyLimit, activeStart, activeEnd, id);
    return this.get(id);
  }

  remove(id: string) {
    this.stop(id);
    this.db.prepare(`DELETE FROM warmup_profiles WHERE id=?`).run(id);
    this.audit('warmup.remove', id);
    return true;
  }

  logs(profileId?: string, limit = 500) {
    const safe = Math.max(1, Math.min(2000, Number(limit) || 500));
    return profileId
      ? this.db.prepare(`SELECT * FROM warmup_logs WHERE profile_id=? ORDER BY created_at DESC LIMIT ?`).all(profileId, safe)
      : this.db.prepare(`SELECT * FROM warmup_logs ORDER BY created_at DESC LIMIT ?`).all(safe);
  }

  start(id: string) {
    const profile = this.get(id);
    if (!profile) throw new Error('Perfil de aquecimento não encontrado');
    if (this.runtime.has(id)) return profile;
    const runtime: Runtime = { stopped: false };
    this.runtime.set(id, runtime);
    this.db.prepare(`UPDATE warmup_profiles SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    this.audit('warmup.start', id);
    void this.tick(id, runtime);
    return this.get(id);
  }

  stop(id: string) {
    const runtime = this.runtime.get(id);
    if (runtime?.timer) clearTimeout(runtime.timer);
    if (runtime) runtime.stopped = true;
    this.runtime.delete(id);
    this.db.prepare(`UPDATE warmup_profiles SET status='stopped',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    this.audit('warmup.stop', id);
    return this.get(id);
  }

  shutdown() {
    for (const id of [...this.runtime.keys()]) this.stop(id);
  }

  private async tick(id: string, runtime: Runtime) {
    if (runtime.stopped) return;
    const profile = this.get(id);
    if (!profile || profile.status !== 'running') return;

    const today = todayLocal();
    if (profile.last_reset_date !== today) {
      this.db.prepare(`UPDATE warmup_profiles SET sent_today=0,last_reset_date=? WHERE id=?`).run(today, id);
      profile.sent_today = 0;
      profile.last_reset_date = today;
    }

    const hour = new Date().getHours();
    if (hour < profile.active_hour_start || hour >= profile.active_hour_end || profile.sent_today >= profile.daily_limit) {
      runtime.timer = setTimeout(() => void this.tick(id, runtime), 60_000);
      return;
    }

    const targets = profile.targets as string[];
    const messages = profile.messages as string[];
    const target = targets[Math.floor(Math.random() * targets.length)];
    const message = messages[Math.floor(Math.random() * messages.length)];
    try {
      const sent = await this.chats.sendText(profile.account_id, target, message);
      this.db.prepare(`
        INSERT INTO warmup_logs (profile_id,account_id,target_jid,message,status) VALUES (?,?,?,?, 'sent')
      `).run(id, profile.account_id, sent.resolvedTarget ?? target, message);
      this.db.prepare(`UPDATE warmup_profiles SET sent_today=sent_today+1,last_run_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.db.prepare(`
        INSERT INTO warmup_logs (profile_id,account_id,target_jid,message,status,error) VALUES (?,?,?,?, 'failed',?)
      `).run(id, profile.account_id, target, message, text);
    }

    const delaySeconds = randomBetween(profile.min_delay_seconds, profile.max_delay_seconds);
    runtime.timer = setTimeout(() => void this.tick(id, runtime), delaySeconds * 1000);
  }

  private hydrate = (row: any) => ({
    ...row,
    targets: JSON.parse(row.targets_json || '[]'),
    messages: JSON.parse(row.messages_json || '[]'),
  });

  private audit(action: string, id: string, metadata?: unknown) {
    this.db.prepare(`INSERT INTO audit_log (actor,action,entity_type,entity_id,metadata_json) VALUES ('local-user',?,'warmup',?,?)`)
      .run(action, id, metadata ? JSON.stringify(metadata) : null);
  }
}
