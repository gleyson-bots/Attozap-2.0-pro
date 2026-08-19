export type CommercialPlan = 'plus' | 'pro' | 'ultra' | 'enterprise';

export type PlanLimits = {
  maxSeats: number | null;
  maxInstances: number | null;
  dailyOutbound: number | null;
  campaignRecipients: number | null;
  campaignStartsDaily: number | null;
  warmupProfiles: number | null;
  warmupDaily: number | null;
  aiDaily: number | null;
};

export const PLAN_LABELS: Record<CommercialPlan, string> = {
  plus: 'Plus',
  pro: 'Pro',
  ultra: 'Ultra',
  enterprise: 'Enterprise',
};

export const PLAN_FEATURES: Record<CommercialPlan, string[]> = {
  plus: ['webchat', 'sender', 'campaigns', 'delivery', 'warmup', 'contacts', 'templates'],
  pro: ['webchat', 'sender', 'groups', 'campaigns', 'delivery', 'warmup', 'ai_chat', 'scheduler', 'contacts', 'filter', 'autoreply', 'templates', 'poll_report'],
  ultra: ['*'],
  enterprise: ['*'],
};

export const PLAN_LIMITS: Record<CommercialPlan, PlanLimits> = {
  plus: {
    maxSeats: 1,
    maxInstances: 1,
    dailyOutbound: 250,
    campaignRecipients: 1_000,
    campaignStartsDaily: 2,
    warmupProfiles: 1,
    warmupDaily: 40,
    aiDaily: 50,
  },
  pro: {
    maxSeats: 3,
    maxInstances: 3,
    dailyOutbound: 1_500,
    campaignRecipients: 10_000,
    campaignStartsDaily: 10,
    warmupProfiles: 3,
    warmupDaily: 150,
    aiDaily: 300,
  },
  ultra: {
    maxSeats: 10,
    maxInstances: 10,
    dailyOutbound: 5_000,
    campaignRecipients: 50_000,
    campaignStartsDaily: 30,
    warmupProfiles: 10,
    warmupDaily: 500,
    aiDaily: 1_000,
  },
  enterprise: {
    maxSeats: null,
    maxInstances: null,
    dailyOutbound: null,
    campaignRecipients: null,
    campaignStartsDaily: null,
    warmupProfiles: null,
    warmupDaily: null,
    aiDaily: null,
  },
};

const LEGACY_PLAN_MAP: Record<string, CommercialPlan> = {
  solo: 'plus',
  solo_plus: 'plus',
  solo_pro: 'pro',
  team: 'pro',
  team_plus: 'pro',
  team_pro: 'ultra',
  plus: 'plus',
  pro: 'pro',
  ultra: 'ultra',
  enterprise: 'enterprise',
};

export function commercialPlan(value: string | undefined): CommercialPlan {
  return LEGACY_PLAN_MAP[String(value ?? '').trim().toLowerCase()] ?? 'plus';
}

export function planLimits(value: string | undefined): PlanLimits {
  return PLAN_LIMITS[commercialPlan(value)];
}

export function isUnlimited(value: number | null | undefined) {
  return value == null;
}

export function formatLimit(value: number | null | undefined) {
  return isUnlimited(value) ? 'Ilimitado' : new Intl.NumberFormat('pt-BR').format(Number(value));
}

export function planFeatures(value: string | undefined) {
  return PLAN_FEATURES[commercialPlan(value)];
}
