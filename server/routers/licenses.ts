import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { licenses, renewals } from "../../drizzle/schema";
import {
  getUserLicenseOverview,
  getUserLicenses,
  getDb,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { hashSensitiveValue, secureCompare } from "../security";

export const licensesRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const [licensesForUser, renewals] = await Promise.all([
      getUserLicenses(ctx.user.id),
      getUserLicenseOverview(ctx.user.id),
    ]);

    return { licenses: licensesForUser, renewals };
  }),

  validateOwnedKey: protectedProcedure
    .input(z.object({ licenseKey: z.string().trim().min(12).max(4096) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de dados indisponível." });
      }

      const keyHash = hashSensitiveValue(input.licenseKey);
      const record = await db
        .select({ id: licenses.id, status: licenses.status, expiresAt: licenses.expiresAt })
        .from(licenses)
        .where(and(eq(licenses.userId, ctx.user.id), eq(licenses.licenseKeyHash, keyHash)))
        .limit(1);

      if (!record[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Não existe uma licença sua com esta chave." });
      }

      return { valid: true, ...record[0] };
    }),

  renewWithKey: protectedProcedure
    .input(z.object({ licenseId: z.string().uuid(), renewalKey: z.string().trim().min(12).max(4096) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de dados indisponível." });
      }

      const record = await db
        .select()
        .from(licenses)
        .where(and(eq(licenses.id, input.licenseId), eq(licenses.userId, ctx.user.id)))
        .limit(1);
      const license = record[0];

      if (!license || !license.renewalKeyHash || !secureCompare(input.renewalKey, license.renewalKeyHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Chave de renovação inválida ou já utilizada." });
      }
      if (license.status === "revoked" || license.status === "suspended") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esta licença não pode ser renovada no momento." });
      }

      const daysAdded = 30;
      const expiresAt = new Date(Math.max(Date.now(), license.expiresAt.getTime()) + daysAdded * 86_400_000);
      const consumedKeyHash = license.renewalKeyHash;
      await db
        .update(licenses)
        .set({
          expiresAt,
          status: "active",
          renewalKeyHash: null,
          renewalKeyHint: null,
        })
        .where(eq(licenses.id, license.id));
      await db.insert(renewals).values({
        id: crypto.randomUUID(),
        licenseId: license.id,
        renewalKeyHash: consumedKeyHash,
        daysAdded,
        note: "Renovação efetuada pelo utilizador no portal.",
      });

      return { expiresAt, daysAdded };
    }),
});
