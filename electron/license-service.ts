import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AttozapDatabase } from './database.js';
import { decodeLicense, deviceFingerprint, validateSignedLicense } from './license.js';

export type LocalLicenseStatus = {
  configured: boolean;
  activated: boolean;
  valid: boolean;
  reason?: string;
  fingerprint: string;
  payload?: ReturnType<typeof decodeLicense>['payload'];
};

export class LicenseService {
  private readonly publicKey?: string;

  constructor(private readonly db: AttozapDatabase, resourcesPath: string) {
    const envKey = process.env.ATTOZAP_LICENSE_PUBLIC_KEY?.replace(/\\n/g, '\n').trim();
    const file = join(resourcesPath, 'license-public.pem');
    this.publicKey = envKey || (existsSync(file) ? readFileSync(file, 'utf8').trim() : undefined);
  }

  status(): LocalLicenseStatus {
    const row = this.db.prepare(`SELECT encoded_license FROM licenses ORDER BY created_at DESC LIMIT 1`).get() as { encoded_license?: string } | undefined;
    if (!this.publicKey) return { configured: false, activated: Boolean(row?.encoded_license), valid: false, reason: 'PUBLIC_KEY_NOT_CONFIGURED', fingerprint: deviceFingerprint() };
    if (!row?.encoded_license) return { configured: true, activated: false, valid: false, reason: 'NO_LICENSE', fingerprint: deviceFingerprint() };
    try {
      const license = decodeLicense(row.encoded_license);
      const result = validateSignedLicense(license, this.publicKey);
      return { configured: true, activated: true, valid: result.valid, reason: result.reason, payload: result.payload, fingerprint: deviceFingerprint() };
    } catch {
      return { configured: true, activated: true, valid: false, reason: 'INVALID_PAYLOAD', fingerprint: deviceFingerprint() };
    }
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
        INSERT INTO licenses (license_id, encoded_license, customer_id, plan, expires_at, validation_status, last_validated_at)
        VALUES (?, ?, ?, ?, ?, 'valid', CURRENT_TIMESTAMP)
      `).run(payload.licenseId, encoded.trim(), payload.customerId, payload.plan, payload.expiresAt);
      this.db.prepare(`INSERT INTO audit_log (actor,action,entity_type,entity_id,metadata_json) VALUES ('local-user','license.activate','license',?,?)`).run(payload.licenseId, JSON.stringify({ plan: payload.plan, customer: payload.customerName }));
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
