import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { whatsappAccounts } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const accountInput = z.object({
  accountLabel: z.string().trim().min(2).max(80),
  phoneNumber: z.string().trim().max(32).optional(),
  status: z.enum(["active", "paused", "disconnected"]),
});

export const whatsappAccountsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(whatsappAccounts)
      .where(eq(whatsappAccounts.userId, ctx.user.id));
  }),

  save: protectedProcedure
    .input(accountInput.extend({ id: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de dados indisponível." });
      }

      const values = {
        accountLabel: input.accountLabel,
        phoneNumber: input.phoneNumber || null,
        status: input.status,
      };

      if (input.id) {
        await db
          .update(whatsappAccounts)
          .set(values)
          .where(and(eq(whatsappAccounts.id, input.id), eq(whatsappAccounts.userId, ctx.user.id)));
        const updated = await db
          .select()
          .from(whatsappAccounts)
          .where(and(eq(whatsappAccounts.id, input.id), eq(whatsappAccounts.userId, ctx.user.id)))
          .limit(1);
        return updated[0] || null;
      }

      const id = randomUUID();
      await db.insert(whatsappAccounts).values({ id, userId: ctx.user.id, ...values });
      const created = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.id, id)).limit(1);
      return created[0];
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { removed: false };
      await db
        .delete(whatsappAccounts)
        .where(and(eq(whatsappAccounts.id, input.id), eq(whatsappAccounts.userId, ctx.user.id)));
      return { removed: true };
    }),
});
