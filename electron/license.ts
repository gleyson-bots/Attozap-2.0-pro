import { createHash, createPublicKey, verify } from 'node:crypto';
import { hostname, platform, arch } from 'node:os';
import type { PlanLimits } from './license-plans.js';

export type LicensePlan = 'solo' | 'solo_plus' | 'solo_pro' | 'team' | 'team_plus' | 'team_pro' | 'plus' | 'pro' | 'ultra' | 'enterprise';

export type LicensePayload = {
  licenseId: string;
  customerId: string;
  customerName: string;
  plan: LicensePlan;
  issuedAt: string;
  expiresAt: string | null;
  maxSeats: number | null;
  maxInstances: number | null;
  features: string[];
  limits?: PlanLimits;
  fingerprint?: string | null;
  version: 1;
};

export type SignedLicense = {
  payload: LicensePayload;
  signature: string;
  algorithm: 'Ed25519';
};

export type LicenseValidation = {
  valid: boolean;
  reason?: 'INVALID_SIGNATURE' | 'EXPIRED' | 'DEVICE_MISMATCH' | 'INVALID_PAYLOAD';
  payload?: LicensePayload;
};

function canonicalize(payload: LicensePayload) {
  return JSON.stringify({
    licenseId: payload.licenseId,
    customerId: payload.customerId,
    customerName: payload.customerName,
    plan: payload.plan,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    maxSeats: payload.maxSeats,
    maxInstances: payload.maxInstances,
    features: [...payload.features].sort(),
    ...(payload.limits ? { limits: {
      maxSeats: payload.limits.maxSeats,
      maxInstances: payload.limits.maxInstances,
      dailyOutbound: payload.limits.dailyOutbound,
      campaignRecipients: payload.limits.campaignRecipients,
      campaignStartsDaily: payload.limits.campaignStartsDaily,
      warmupProfiles: payload.limits.warmupProfiles,
      warmupDaily: payload.limits.warmupDaily,
      aiDaily: payload.limits.aiDaily,
    } } : {}),
    fingerprint: payload.fingerprint ?? null,
    version: payload.version,
  });
}

export function deviceFingerprint() {
  return createHash('sha256')
    .update([hostname(), platform(), arch()].join('|'))
    .digest('hex');
}

export function validateSignedLicense(
  license: SignedLicense,
  publicKeyPem: string,
  now = new Date(),
): LicenseValidation {
  try {
    if (license.algorithm !== 'Ed25519' || license.payload.version !== 1) {
      return { valid: false, reason: 'INVALID_PAYLOAD' };
    }

    const publicKey = createPublicKey(publicKeyPem);
    const signature = Buffer.from(license.signature, 'base64url');
    const signed = Buffer.from(canonicalize(license.payload));
    if (!verify(null, signed, publicKey, signature)) {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }

    if (license.payload.expiresAt && new Date(license.payload.expiresAt).getTime() <= now.getTime()) {
      return { valid: false, reason: 'EXPIRED', payload: license.payload };
    }

    if (license.payload.fingerprint && license.payload.fingerprint !== deviceFingerprint()) {
      return { valid: false, reason: 'DEVICE_MISMATCH', payload: license.payload };
    }

    return { valid: true, payload: license.payload };
  } catch {
    return { valid: false, reason: 'INVALID_PAYLOAD' };
  }
}

export function encodeLicense(license: SignedLicense) {
  return Buffer.from(JSON.stringify(license), 'utf8').toString('base64url');
}

export function decodeLicense(encoded: string): SignedLicense {
  return JSON.parse(Buffer.from(encoded.trim(), 'base64url').toString('utf8')) as SignedLicense;
}
