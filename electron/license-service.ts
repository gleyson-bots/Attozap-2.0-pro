import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AttozapDatabase } from './database.js';
import { decodeLicense, deviceFingerprint, validateSignedLicense, type LicensePayload } from './license.js';
import { commercialPlan, planLimits, type CommercialPlan, type PlanLimits } from './license-plans.js';

export type QuotaKind = 'outbound' | 'campaign' | 'ai';

type UsageRow = {
  outbound_count: number;
  campaign_starts: number;
  ai_count: number;
};

export type QuotaSnapshot = {
  date: string;
  outbound: number;
  campaign: number;
  ai: number;
  limits: PlanLimits;
};

export type LocalLicenseStatus = {
  configured: boolean;
  activated: boolean;
  valid: boolean;
  reason?: string;
  fingerprint: string;
  plan?: CommercialPlan;
  limits?: PlanLimits;
  usage?: QuotaSnapshot;
  payload?: LicensePayload;
};

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function featureKey(feature: string) {
  return feature.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '_');
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

  private verifiedPayload() {
    if (!this.publicKey) throw new Error('PUBLIC_KEY_NOT_CONFIGURED');
    const encoded = this.row()?.encoded_license;
    if (!encoded) throw new Error('NO_LICENSE');
    const result = validateSignedLicense(decodeLicense(encoded), this.publicKey);
    if (!result.valid || !result.payload) throw new Error(result.reason ?? 'INVALID_LICENSE');
    return result.payload;
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
    if (!this.publicKey) return { configured: false, activated: Boolean(row?.encoded_license), valid: false, reason: 'PUBLIC_KEY_NOT_CONFIGURED', fingerprint: deviceFingerprint() };
    if (!row?.encoded_license) return { configured: true, activated: false, valid: false, reason: 'NO_LICENSE', fingerprint: deviceFingerprint() };
    try {
      const license = decodeLicense(row.encoded_license);
      const result = validateSignedLicense(license, this.publicKey);
      if (!result.valid || !result.payload) return { configured: true, activated: true, valid: false, reason: result.reason, fingerprint: deviceFingerprint(), payload: result.payload };
      const limits = this.limitsFor(result.payload);
      return {
        configured: true,
        activated: true,
        valid: true,
        fingerprint: deviceFingerprint(),
        plan: commercialPlan(result.payload.plan),
        limits,
        usage: this.usageFor(result.payload, limits),
        payload: result.payload,
      };
    } catch {
      return { configured: true, activated: true, valid: false, reason: 'INVALID_PAYLOAD', fingerprint: deviceFingerprint() };
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
      this.db.prepare(`INSERT INTO audit_log (actor,action,entity_type,entity_id,metadata_json) VALUES ('local-user','license.activate','license',?,?)`).run(payload.licenseId, JSON.stringify({ plan: payload.plan, customer: payload.customerName, limits: this.limitsFor(payload) }));
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
