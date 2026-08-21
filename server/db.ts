import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  downloads,
  InsertUser,
  licenses,
  plans,
  renewals,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

export const commercialPlanCatalog = [
  {
    id: "plus",
    name: "Plus",
    maxAccounts: 2,
    priceCents: 2400,
    features: ["WebChat e contactos", "Sender e templates", "Auto Reply", "Health Center e backup local"],
  },
  {
    id: "pro",
    name: "Pro",
    maxAccounts: 5,
    priceCents: 3500,
    features: ["Tudo do Plus", "Agendamentos e filtros", "Extratores", "Centro JID / LID"],
  },
  {
    id: "ultra",
    name: "Ultra",
    maxAccounts: 15,
    priceCents: 9800,
    features: ["Tudo do Pro", "Aquecimento controlado", "Biblioteca de mídias", "Diagnóstico avançado"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    maxAccounts: null,
    priceCents: null,
    features: ["Limites personalizados", "Configuração comercial sob medida", "Condições personalizadas"],
  },
] as const;

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function ensurePlanCatalog() {
  const db = await getDb();
  if (!db) return commercialPlanCatalog;

  for (const plan of commercialPlanCatalog) {
    await db
      .insert(plans)
      .values({ ...plan, features: [...plan.features], isActive: true })
      .onDuplicateKeyUpdate({
        set: {
          name: plan.name,
          maxAccounts: plan.maxAccounts,
          priceCents: plan.priceCents,
          features: [...plan.features],
          isActive: true,
        },
      });
  }

  return db.select().from(plans).orderBy(plans.maxAccounts);
}

export async function getUserLicenses(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: licenses.id,
      status: licenses.status,
      expiresAt: licenses.expiresAt,
      licenseKeyHint: licenses.licenseKeyHint,
      renewalKeyHint: licenses.renewalKeyHint,
      deviceFingerprint: licenses.deviceFingerprint,
      createdAt: licenses.createdAt,
      planId: plans.id,
      planName: plans.name,
      maxAccounts: plans.maxAccounts,
    })
    .from(licenses)
    .innerJoin(plans, eq(licenses.planId, plans.id))
    .where(eq(licenses.userId, userId))
    .orderBy(desc(licenses.expiresAt));
}

export async function getUserLicenseOverview(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: renewals.id,
      licenseId: renewals.licenseId,
      renewedAt: renewals.renewedAt,
      daysAdded: renewals.daysAdded,
      note: renewals.note,
    })
    .from(renewals)
    .innerJoin(licenses, eq(renewals.licenseId, licenses.id))
    .where(eq(licenses.userId, userId))
    .orderBy(desc(renewals.renewedAt));
}

export async function getDownloadsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const entitlementRows = await db
    .select({ planId: licenses.planId })
    .from(licenses)
    .where(and(eq(licenses.userId, userId), eq(licenses.status, "active")));
  const entitledPlanIds = new Set(entitlementRows.map(row => row.planId));
  if (!entitledPlanIds.size) return [];

  const published = await db
    .select()
    .from(downloads)
    .where(eq(downloads.isPublished, true))
    .orderBy(desc(downloads.createdAt));

  return published.filter(download => download.allowedPlans.some(planId => entitledPlanIds.has(planId)));
}

export async function listAdminUsers() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.lastSignedIn));
}

export async function listAdminLicenses() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: licenses.id,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      planId: plans.id,
      planName: plans.name,
      status: licenses.status,
      expiresAt: licenses.expiresAt,
      licenseKeyHint: licenses.licenseKeyHint,
      renewalKeyHint: licenses.renewalKeyHint,
      createdAt: licenses.createdAt,
    })
    .from(licenses)
    .innerJoin(users, eq(licenses.userId, users.id))
    .innerJoin(plans, eq(licenses.planId, plans.id))
    .orderBy(desc(licenses.expiresAt));
}

export async function listPublishedDownloads(includeUnpublished = false) {
  const db = await getDb();
  if (!db) return [];

  const query = db.select().from(downloads).orderBy(desc(downloads.createdAt));
  return includeUnpublished ? query : query.where(eq(downloads.isPublished, true));
}
