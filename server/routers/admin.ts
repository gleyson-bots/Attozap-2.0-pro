import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { aiAgentConfigs, downloads, licenses, plans, renewals, users } from "../../drizzle/schema";
import {
  ensurePlanCatalog,
  getDb,
  listAdminLicenses,
  listAdminUsers,
  listPublishedDownloads,
} from "../db";
import { getSensitiveHint, hashSensitiveValue } from "../security";
import { adminProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

const licenseStatus = z.enum(["active", "expiring", "expired", "suspended", "revoked"]);

export const adminRouter = router({
  dashboard: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { users: 0, activeLicenses: 0, downloads: 0, agents: 0 };

    const [userRows, licenseRows, downloadRows, agentRows] = await Promise.all([
      db.select({ id: users.id }).from(users),
      db.select({ id: licenses.id }).from(licenses).where(eq(licenses.status, "active")),
      db.select({ id: downloads.id }).from(downloads),
      db.select({ id: aiAgentConfigs.id }).from(aiAgentConfigs),
    ]);

    return {
      users: userRows.length,
      activeLicenses: licenseRows.length,
      downloads: downloadRows.length,
      agents: agentRows.length,
    };
  }),

  listUsers: adminProcedure.query(async () => listAdminUsers()),
  listLicenses: adminProcedure.query(async () => listAdminLicenses()),
  listDownloads: adminProcedure.query(async () => listPublishedDownloads(true)),
  listPlans: adminProcedure.query(async () => ensurePlanCatalog()),

  setUserRole: adminProcedure
    .input(z.object({ userId: z.number().int().positive(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { updated: false };

      const target = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Utilizador não encontrado." });
      if (target[0].id === ctx.user.id && input.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Não pode remover o seu próprio acesso administrativo." });
      }
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { updated: true };
    }),

  updatePlan: adminProcedure
    .input(
      z.object({
        id: z.enum(["plus", "pro", "ultra", "enterprise"]),
        name: z.string().trim().min(2).max(64),
        maxAccounts: z.number().int().min(1).max(10_000).nullable(),
        priceCents: z.number().int().min(0).max(10_000_000).nullable(),
        features: z.array(z.string().trim().min(1).max(160)).min(1).max(50),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { updated: false };
      await ensurePlanCatalog();
      await db.update(plans).set(input).where(eq(plans.id, input.id));
      return { updated: true };
    }),

  issueLicense: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        planId: z.enum(["plus", "pro", "ultra", "enterprise"]),
        licenseKey: z.string().trim().min(12).max(4096),
        renewalKey: z.string().trim().min(12).max(4096).optional(),
        expiresAt: z.coerce.date(),
        deviceFingerprint: z.string().trim().max(128).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de dados indisponível." });

      await ensurePlanCatalog();
      const licenseId = randomUUID();
      await db.insert(licenses).values({
        id: licenseId,
        userId: input.userId,
        planId: input.planId,
        expiresAt: input.expiresAt,
        licenseKeyHash: hashSensitiveValue(input.licenseKey),
        licenseKeyHint: getSensitiveHint(input.licenseKey),
        renewalKeyHash: input.renewalKey ? hashSensitiveValue(input.renewalKey) : null,
        renewalKeyHint: input.renewalKey ? getSensitiveHint(input.renewalKey) : null,
        deviceFingerprint: input.deviceFingerprint || null,
      });

      return { id: licenseId };
    }),

  setLicenseStatus: adminProcedure
    .input(z.object({ id: z.string().uuid(), status: licenseStatus }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { updated: false };
      await db.update(licenses).set({ status: input.status }).where(eq(licenses.id, input.id));
      return { updated: true };
    }),

  renewLicense: adminProcedure
    .input(
      z.object({
        licenseId: z.string().uuid(),
        daysAdded: z.number().int().min(1).max(730),
        renewalKey: z.string().trim().min(12).max(4096).optional(),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de dados indisponível." });

      const current = await db.select().from(licenses).where(eq(licenses.id, input.licenseId)).limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Licença não encontrada." });

      const base = Math.max(Date.now(), current[0].expiresAt.getTime());
      const expiresAt = new Date(base + input.daysAdded * 86_400_000);
      await db
        .update(licenses)
        .set({
          expiresAt,
          status: "active",
          renewalKeyHash: input.renewalKey ? hashSensitiveValue(input.renewalKey) : current[0].renewalKeyHash,
          renewalKeyHint: input.renewalKey ? getSensitiveHint(input.renewalKey) : current[0].renewalKeyHint,
        })
        .where(eq(licenses.id, input.licenseId));

      await db.insert(renewals).values({
        id: randomUUID(),
        licenseId: input.licenseId,
        daysAdded: input.daysAdded,
        renewalKeyHash: input.renewalKey ? hashSensitiveValue(input.renewalKey) : null,
        note: input.note || null,
      });

      return { expiresAt };
    }),

  createDownload: adminProcedure
    .input(
      z.object({
        version: z.string().trim().min(1).max(64),
        filename: z.string().trim().min(1).max(255),
        storageKey: z.string().trim().min(1).max(512),
        storageUrl: z.string().trim().min(1).max(1024),
        releaseNotes: z.string().trim().max(10000).optional(),
        allowedPlans: z.array(z.enum(["plus", "pro", "ultra", "enterprise"])).min(1),
        isPublished: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de dados indisponível." });

      const id = randomUUID();
      await db.insert(downloads).values({ id, uploadedBy: ctx.user.id, ...input });
      return { id };
    }),

  uploadRelease: adminProcedure
    .input(
      z.object({
        version: z.string().trim().min(1).max(64),
        filename: z.string().trim().regex(/^[a-zA-Z0-9._-]+$/).max(255),
        contentType: z.string().trim().min(3).max(120),
        contentBase64: z.string().min(1).max(45_000_000),
        releaseNotes: z.string().trim().max(10000).optional(),
        allowedPlans: z.array(z.enum(["plus", "pro", "ultra", "enterprise"])).min(1),
        isPublished: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de dados indisponível." });

      const bytes = Buffer.from(input.contentBase64, "base64");
      if (!bytes.length || bytes.length > 32 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "O upload deve ter até 32 MB." });
      }

      const stored = await storagePut(`releases/${input.version}/${input.filename}`, bytes, input.contentType);
      const id = randomUUID();
      await db.insert(downloads).values({
        id,
        version: input.version,
        filename: input.filename,
        storageKey: stored.key,
        storageUrl: stored.url,
        releaseNotes: input.releaseNotes || null,
        allowedPlans: input.allowedPlans,
        isPublished: input.isPublished,
        uploadedBy: ctx.user.id,
      });
      return { id, storageUrl: stored.url };
    }),

  setDownloadPublication: adminProcedure
    .input(z.object({ id: z.string().uuid(), isPublished: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { updated: false };
      await db.update(downloads).set({ isPublished: input.isPublished }).where(eq(downloads.id, input.id));
      return { updated: true };
    }),
});
