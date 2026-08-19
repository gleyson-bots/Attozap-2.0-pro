import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AttozapDatabase } from './database.js';
import { decodeLicense, decodeRenewal, deviceFingerprint, validateSignedLicense, validateSignedRenewal, type LicensePayload, type RenewalPayload } from './license.js';
import { commercialPlan, planLimits, type CommercialPlan, type PlanLimits } from './license-plans.js';

export type QuotaKind = 'outbound' | 'campaign' | 'ai';

type UsageRow = {
  outbound_count: number;
  campaign_starts: number;
  ai_count: number;
};

type SubscriptionRow = {
  license_id: string;
  renewal_id?: string | null;
  started_at: string;
  expires_at: string;
  last_seen_at: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type QuotaSnapshot = {
  date: string;
  outbound: number;
  campaign: number;
  ai: number;
  limits: PlanLimits;
};

export type SubscriptionSnapshot = {
  required: boolean;
  active: boolean;
  reason?: 'SUBSCRIPTION_REQUIRED' | 'SUBSCRIPTION_EXPIRED' | 'CLOCK_ROLLBACK';
  renewalId?: string;
  startedAt?: string;
  expiresAt?: string;
  daysRemaining: number | null;
};

export type LocalLicenseStatus = {
  configured: boolean;
  activated: boolean;
  valid: boolean;
  licenseValid: boolean;
  reason?: string;
  fingerprint: string;
  plan?: CommercialPlan;
  limits?: PlanLimits;
  usage?: QuotaSnapshot;
  subscription?: SubscriptionSnapshot;
  payload?: LicensePayload;
};

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function featureKey(feature: string) {
  return feature.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '_');
}

function isoNow() {
  return new Date().toISOString();
}

function daysRemaining(expiresAt: string, now = Date.now()) {
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return 0;
  return Math.max(0, Math.ceil((expires - now) / DAY_MS));
}

export class LicenseService {
  private readonly publicKey?: string;

  constructor(private readonly db: AttozapDatabase, resourcesPath: string) {
    const envKey = process.env.ATTOZAP_LICENSE_PUBLIC_KEY?.replace(/\\n/g, '\n').trim();
    const file = join(resourcesPath, 'license-public.pem');
    this.publicKey = envKey || (existsSync(file) ? readFileSync(file, 'utf8').trim() : undefined);
  }

  private row() {
    return this.db.prepare(`SELECT encoded_license FROM licenses ORDER BY created_at DESC LIMIT 1`).get() as { encoded_license?: string } | undefined;
  }

  private verifiedLicensePayload() {
    if (!this.publicKey) throw new Error('PUBLIC_KEY_NOT_CONFIGURED');
    const encoded = this.row()?.encoded_license;
    if (!encoded) throw new Error('NO_LICENSE');
    const result = validateSignedLicense(decodeLicense(encoded), this.publicKey);
    if (!result.valid || !result.payload) throw new Error(result.reason ?? 'INVALID_LICENSE');
    return result.payload;
  }

  private subscriptionFor(payload: LicensePayload, now = Date.now()): SubscriptionSnapshot {
    const required = payload.billingMode === 'subscription';
    if (!required) return { required: false, active: true, daysRemaining: null };

    const row = this.db.prepare(`
      SELECT license_id, renewal_id, started_at, expires_at, last_seen_at
      FROM license_subscriptions WHERE license_id=?
    `).get(payload.licenseId) as SubscriptionRow | undefined;
    if (!row) return { required: true, active: false, reason: 'SUBSCRIPTION_REQUIRED', daysRemaining: 0 };

    const lastSeen = Date.parse(row.last_seen_at);
    if (Number.isFinite(lastSeen) && now + CLOCK_SKEW_MS < lastSeen) {
      return {
        required: true,
        active: false,
        reason: 'CLOCK_ROLLBACK',
        renewalId: row.renewal_id ?? undefined,
        startedAt: row.started_at,
        expiresAt: row.expires_at,
        daysRemaining: daysRemaining(row.expires_at, now),
      };
    }

    const nowIso = new Date(now).toISOString();
    if (!Number.isFinite(lastSeen) || now > lastSeen) {
      this.db.prepare(`UPDATE license_subscriptions SET last_seen_at=?, updated_at=CURRENT_TIMESTAMP WHERE license_id=?`).run(nowIso, payload.licenseId);
    }
    const remaining = daysRemaining(row.expires_at, now);
    return {
      required: true,
      active: remaining > 0,
      reason: remaining > 0 ? undefined : 'SUBSCRIPTION_EXPIRED',
      renewalId: row.renewal_id ?? undefined,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      daysRemaining: remaining,
    };
  }

  private verifiedPayload() {
    const payload = this.verifiedLicensePayload();
    const subscription = this.subscriptionFor(payload);
    if (!subscription.active) {
      throw new Error(subscription.reason ?? 'SUBSCRIPTION_REQUIRED');
    }
    return payload;
  }

  limitsFor(payload: LicensePayload): PlanLimits {
    const defaults = planLimits(payload.plan);
    if (payload.limits) return payload.limits;
    return { ...defaults, maxSeats: payload.maxSeats, maxInstances: payload.maxInstances };
  }

  private usageFor(payload: LicensePayload, limits = this.limitsFor(payload)): QuotaSnapshot {
    const date = localDate();
    const row = this.db.prepare(`
      SELECT outbound_count, campaign_starts, ai_count
      FROM license_usage WHERE license_id=? AND usage_date=?
    `).get(payload.licenseId, date) as UsageRow | undefined;
    return {
      date,
      outbound: Number(row?.outbound_count ?? 0),
      campaign: Number(row?.campaign_starts ?? 0),
      ai: Number(row?.ai_count ?? 0),
      limits,
    };
  }

  status(): LocalLicenseStatus {
    const row = this.row();
    if (!this.publicKey) return { configured: false, activated: Boolean(row?.encoded_license), valid: false, licenseValid: false, reason: 'PUBLIC_KEY_NOT_CONFIGURED', fingerprint: deviceFingerprint() };
    if (!row?.encoded_license) return { configured: true, activated: false, valid: false, licenseValid: false, reason: 'NO_LICENSE', fingerprint: deviceFingerprint() };
    try {
      const license = decodeLicense(row.encoded_license);
      const result = validateSignedLicense(license, this.publicKey);
      if (!result.valid || !result.payload) return { configured: true, activated: true, valid: false, licenseValid: false, reason: result.reason, fingerprint: deviceFingerprint(), payload: result.payload };
      const payload = result.payload;
      const limits = this.limitsFor(payload);
      const subscription = this.subscriptionFor(payload);
      return {
        configured: true,
        activated: true,
        valid: subscription.active,
        licenseValid: true,
        reason: subscription.active ? undefined : subscription.reason,
        fingerprint: deviceFingerprint(),
        plan: commercialPlan(payload.plan),
        limits,
        usage: this.usageFor(payload, limits),
        subscription,
        payload,
      };
    } catch {
      return { configured: true, activated: true, valid: false, licenseValid: false, reason: 'INVALID_PAYLOAD', fingerprint: deviceFingerprint() };
    }
  }

  requireValid() {
    return this.verifiedPayload();
  }

  assertFeature(feature: string) {
    const payload = this.verifiedPayload();
    // Licenças antigas não têm o campo limits e permanecem compatíveis durante a migração.
    if (!payload.limits) return payload;
    const wanted = featureKey(feature);
    const features = payload.features.map(featureKey);
    if (!features.includes('*') && !features.includes(wanted)) {
      throw new Error(`O plano ${commercialPlan(payload.plan).toUpperCase()} não inclui o recurso ${feature}`);
    }
    return payload;
  }

  reserve(kind: QuotaKind, count = 1) {
    const payload = this.verifiedPayload();
    const limits = this.limitsFor(payload);
    const amount = Math.max(1, Math.floor(Number(count) || 1));
    const column = kind === 'outbound' ? 'outbound_count' : kind === 'campaign' ? 'campaign_starts' : 'ai_count';
    const limit = kind === 'outbound' ? limits.dailyOutbound : kind === 'campaign' ? limits.campaignStartsDaily : limits.aiDaily;
    if (limit == null) return { allowed: true, remaining: null, limits, usage: this.usageFor(payload, limits) };

    const date = localDate();
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO license_usage (license_id,usage_date) VALUES (?,?)
        ON CONFLICT(license_id,usage_date) DO NOTHING
      `).run(payload.licenseId, date);
      const current = this.db.prepare(`SELECT ${column} AS used FROM license_usage WHERE license_id=? AND usage_date=?`).get(payload.licenseId, date) as { used?: number } | undefined;
      const used = Number(current?.used ?? 0);
      if (used + amount > limit) throw new Error(`Limite diário do plano ${commercialPlan(payload.plan).toUpperCase()} atingido para ${kind}`);
      this.db.prepare(`UPDATE license_usage SET ${column}=${column}+? WHERE license_id=? AND usage_date=?`).run(amount, payload.licenseId, date);
      return used + amount;
    });
    const used = tx();
    return { allowed: true, remaining: Math.max(0, limit - used), limits, usage: this.usageFor(payload, limits) };
  }

  assertWithin(kind: 'campaignRecipients' | 'warmupProfiles' | 'warmupDaily' | 'aiDaily', amount: number) {
    const payload = this.verifiedPayload();
    const limits = this.limitsFor(payload);
    const limit = limits[kind];
    if (limit != null && amount > limit) throw new Error(`O plano ${commercialPlan(payload.plan).toUpperCase()} permite no máximo ${limit} em ${kind}`);
    return payload;
  }

  activate(encoded: string) {
    if (!this.publicKey) throw new Error('A chave pública da License Authority ainda não foi configurada neste build');
    const license = decodeLicense(encoded);
    const validation = validateSignedLicense(license, this.publicKey);
    if (!validation.valid || !validation.payload) throw new Error(`Licença inválida: ${validation.reason ?? 'UNKNOWN'}`);
    const payload = validation.payload;
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM licenses`).run();
      this.db.prepare(`
        INSERT INTO licenses (license_id, encoded_license, customer_id, plan, expires_at, validation_status)
        VALUES (?, ?, ?, ?, ?, 'valid')
      `).run(payload.licenseId, encoded.trim(), payload.customerId, payload.plan, payload.expiresAt);
      this.db.prepare(`INSERT INTO audit_log (actor,action,entity_type,entity_id,metadata_json) VALUES ('local-user','license.activate','license',?,?)`).run(payload.licenseId, JSON.stringify({ plan: payload.plan, customer: payload.customerName, billingMode: payload.billingMode ?? 'perpetual', limits: this.limitsFor(payload) }));
    });
    tx();
    return this.status();
  }

  renew(encoded: string) {
    if (!this.publicKey) throw new Error('A chave pública da License Authority ainda não foi configurada neste build');
    const licensePayload = this.verifiedLicensePayload();
    let renewal;
    try {
      renewal = decodeRenewal(encoded);
    } catch {
      throw new Error('Chave de renovação inválida: INVALID_PAYLOAD. Cole o token codificado gerado na seção “Emitir chave de renovação” do KeyGen.');
    }
    const validation = validateSignedRenewal(renewal, this.publicKey);
    if (!validation.valid || !validation.payload) {
      if (validation.reason === 'NOT_RENEWAL_KEY') {
        throw new Error('O conteúdo colado é uma licença principal, não uma chave de renovação. Gere e copie o token da seção “Emitir chave de renovação” do KeyGen.');
      }
      throw new Error(`Chave de renovação inválida: ${validation.reason ?? 'UNKNOWN'}`);
    }
    const payload: RenewalPayload = validation.payload;
    if (payload.licenseId !== licensePayload.licenseId) throw new Error('Esta chave de renovação pertence a outra licença.');
    if (payload.customerId !== licensePayload.customerId) throw new Error('Esta chave de renovação pertence a outro cliente.');
    if (payload.plan !== licensePayload.plan) throw new Error('O plano da renovação não corresponde ao plano licenciado.');
    if (licensePayload.billingMode !== 'subscription') throw new Error('Esta licença não está configurada para cobrança mensal.');

    const now = Date.now();
    const current = this.db.prepare(`SELECT started_at, expires_at FROM license_subscriptions WHERE license_id=?`).get(licensePayload.licenseId) as { started_at?: string; expires_at?: string } | undefined;
    const currentExpiry = current?.expires_at ? Date.parse(current.expires_at) : 0;
    const startsAt = currentExpiry > now ? currentExpiry : now;
    const expiresAt = new Date(startsAt + payload.days * DAY_MS).toISOString();
    const startedAt = currentExpiry > now && current?.started_at ? current.started_at : new Date(now).toISOString();
    const tx = this.db.transaction(() => {
      const alreadyApplied = this.db.prepare(`SELECT renewal_id FROM license_renewals WHERE renewal_id=?`).get(payload.renewalId);
      if (alreadyApplied) throw new Error('Esta chave de renovação já foi utilizada.');
      this.db.prepare(`INSERT INTO license_renewals (renewal_id,license_id,days,expires_at) VALUES (?,?,?,?)`).run(payload.renewalId, licensePayload.licenseId, payload.days, expiresAt);
      this.db.prepare(`
        INSERT INTO license_subscriptions (license_id,renewal_id,started_at,expires_at,last_seen_at,updated_at)
        VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(license_id) DO UPDATE SET renewal_id=excluded.renewal_id, started_at=excluded.started_at, expires_at=excluded.expires_at, last_seen_at=excluded.last_seen_at, updated_at=CURRENT_TIMESTAMP
      `).run(licensePayload.licenseId, payload.renewalId, startedAt, expiresAt, new Date(now).toISOString());
      this.db.prepare(`INSERT INTO audit_log (actor,action,entity_type,entity_id,metadata_json) VALUES ('local-user','license.renew','license',?,?)`).run(licensePayload.licenseId, JSON.stringify({ renewalId: payload.renewalId, days: payload.days, expiresAt }));
    });
    tx();
    return this.status();
  }

  deactivate() {
    const row = this.db.prepare(`SELECT license_id FROM licenses ORDER BY created_at DESC LIMIT 1`).get() as { license_id?: string } | undefined;
    this.db.prepare(`DELETE FROM licenses`).run();
    this.db.prepare(`INSERT INTO audit_log (actor,action,entity_type,entity_id) VALUES ('local-user','license.deactivate','license',?)`).run(row?.license_id ?? null);
    return this.status();
  }
}
