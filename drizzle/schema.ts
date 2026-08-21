import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing the Manus OAuth flow. The owner is promoted to
 * administrator by `upsertUser` in server/db.ts.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/**
 * Commercial definitions rendered in the landing and associated with
 * licences/downloads. Feature flags remain structured JSON so the desktop
 * can evolve without a schema migration for each additional entitlement.
 */
export const plans = mysqlTable("plans", {
  id: varchar("id", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  maxAccounts: int("maxAccounts"),
  priceCents: int("priceCents"),
  features: json("features").$type<string[]>().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Licence records deliberately retain only hashes of sensitive keys. Raw
 * Ed25519 licence and renewal material must never be exposed by this portal
 * or persisted in a browser-accessible form.
 */
export const licenses = mysqlTable(
  "licenses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    planId: varchar("planId", { length: 32 }).notNull().references(() => plans.id),
    status: mysqlEnum("status", ["active", "expiring", "expired", "suspended", "revoked"])
      .default("active")
      .notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    licenseKeyHash: varchar("licenseKeyHash", { length: 128 }).notNull().unique(),
    licenseKeyHint: varchar("licenseKeyHint", { length: 24 }).notNull(),
    renewalKeyHash: varchar("renewalKeyHash", { length: 128 }),
    renewalKeyHint: varchar("renewalKeyHint", { length: 24 }),
    deviceFingerprint: varchar("deviceFingerprint", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("licenses_user_status_idx").on(table.userId, table.status),
    index("licenses_expires_at_idx").on(table.expiresAt),
  ],
);

/** A non-reversible audit trail of licence renewals. */
export const renewals = mysqlTable(
  "renewals",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    licenseId: varchar("licenseId", { length: 36 })
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),
    renewedAt: timestamp("renewedAt").defaultNow().notNull(),
    renewalKeyHash: varchar("renewalKeyHash", { length: 128 }),
    daysAdded: int("daysAdded").notNull(),
    note: varchar("note", { length: 500 }),
  },
  table => [index("renewals_license_renewed_idx").on(table.licenseId, table.renewedAt)],
);

/** Release artifacts stored outside the application source tree in S3. */
export const downloads = mysqlTable(
  "downloads",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    version: varchar("version", { length: 64 }).notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
    releaseNotes: text("releaseNotes"),
    allowedPlans: json("allowedPlans").$type<string[]>().notNull(),
    isPublished: boolean("isPublished").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    uploadedBy: int("uploadedBy").notNull().references(() => users.id),
  },
  table => [
    uniqueIndex("downloads_version_filename_unique").on(table.version, table.filename),
    index("downloads_published_created_idx").on(table.isPublished, table.createdAt),
  ],
);

export const aiProviders = [
  "openai",
  "anthropic",
  "groq",
  "openrouter",
  "nvidia_nim",
  "xai",
  "pollinations",
  "huggingface",
] as const;

export const aiAgentModes = ["reply", "reactivation", "qualification", "hybrid"] as const;

/**
 * A user-managed catalogue of WhatsApp accounts. It stores only account
 * descriptors; session tokens and Baileys authentication remain local to the
 * desktop application and are never copied to this portal.
 */
export const whatsappAccounts = mysqlTable(
  "whatsapp_accounts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountLabel: varchar("accountLabel", { length: 80 }).notNull(),
    phoneNumber: varchar("phoneNumber", { length: 32 }),
    status: mysqlEnum("status", ["active", "paused", "disconnected"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("whatsapp_accounts_user_label_unique").on(table.userId, table.accountLabel),
    index("whatsapp_accounts_user_status_idx").on(table.userId, table.status),
  ],
);

/**
 * A single operational agent can be configured per account. Provider API keys
 * are encrypted server-side before persistence; the UI sees only `apiKeyLast4`.
 */
export const aiAgentConfigs = mysqlTable(
  "ai_agent_configs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    waAccountId: varchar("waAccountId", { length: 36 })
      .notNull()
      .references(() => whatsappAccounts.id, { onDelete: "cascade" }),
    waAccount: varchar("waAccount", { length: 80 }).notNull(),
    provider: mysqlEnum("provider", aiProviders).notNull(),
    model: varchar("model", { length: 160 }).notNull(),
    temperature: decimal("temperature", { precision: 3, scale: 2 }).default("0.70").notNull(),
    systemPrompt: text("systemPrompt").notNull(),
    mode: mysqlEnum("mode", aiAgentModes).default("reply").notNull(),
    apiKeyEncrypted: text("apiKeyEncrypted"),
    apiKeyLast4: varchar("apiKeyLast4", { length: 4 }),
    active: boolean("active").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("ai_agent_user_account_unique").on(table.userId, table.waAccount),
    uniqueIndex("ai_agent_user_account_id_unique").on(table.userId, table.waAccountId),
    index("ai_agent_user_active_idx").on(table.userId, table.active),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type License = typeof licenses.$inferSelect;
export type Download = typeof downloads.$inferSelect;
export type AIAgentConfig = typeof aiAgentConfigs.$inferSelect;
export type WhatsAppAccount = typeof whatsappAccounts.$inferSelect;
