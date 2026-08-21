import { generateKeyPairSync, createPrivateKey, sign, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { LicensePayload, LicensePlan, SignedLicense } from '../electron/license.js';
import { commercialPlan, planFeatures, planLimits, type PlanLimits } from '../electron/license-plans.js';

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
    ...(payload.billingMode ? { billingMode: payload.billingMode } : {}),
    ...(payload.initialSubscriptionDays ? { initialSubscriptionDays: payload.initialSubscriptionDays } : {}),
    version: payload.version,
  });
}

export function generateAuthorityKeys(outPrefix = 'attozap-license') {
  const pair = generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  writeFileSync(`${outPrefix}.private.pem`, privatePem, { mode: 0o600 });
  writeFileSync(`${outPrefix}.public.pem`, publicPem);
  return { privatePem, publicPem };
}

export function issueLicense(input: {
  customerId: string;
  customerName: string;
  plan: LicensePlan;
  expiresAt?: string | null;
  maxSeats?: number | null;
  maxInstances?: number | null;
  limits?: PlanLimits;
  features?: string[];
  fingerprint?: string | null;
  billingMode?: 'perpetual' | 'subscription';
  initialSubscriptionDays?: number;
}, privateKeyPem: string): SignedLicense {
  const plan = commercialPlan(input.plan);
  const limits = input.limits ?? planLimits(plan);
  const payload: LicensePayload = {
    licenseId: `AZ-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
    customerId: input.customerId,
    customerName: input.customerName,
    plan,
    issuedAt: new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
    maxSeats: input.maxSeats ?? limits.maxSeats,
    maxInstances: input.maxInstances ?? limits.maxInstances,
    limits,
    features: [...new Set(input.features?.length ? input.features : planFeatures(plan))].sort(),
    fingerprint: input.fingerprint ?? null,
    ...(input.billingMode ? { billingMode: input.billingMode } : {}),
    ...(input.billingMode === 'subscription' ? { initialSubscriptionDays: input.initialSubscriptionDays ?? 30 } : {}),
    version: 1,
  };
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(canonicalize(payload)), key).toString('base64url');
  return { payload, signature, algorithm: 'Ed25519' };
}

// IMPORTANT: a chave privada pertence somente ao License Authority/Admin backend.
// Nunca empacote a chave privada no aplicativo desktop.
