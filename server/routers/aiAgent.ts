import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  aiAgentConfigs,
  aiAgentModes,
  aiProviders,
  whatsappAccounts,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { encryptSecret, getSensitiveHint } from "../security";
import { protectedProcedure, router } from "../_core/trpc";

const agentInput = z.object({
  waAccountId: z.string().uuid(),
  provider: z.enum(aiProviders),
  model: z.string().trim().min(2).max(160),
  temperature: z.number().min(0).max(2),
  systemPrompt: z.string().trim().min(10).max(8000),
  mode: z.enum(aiAgentModes),
  apiKey: z.string().trim().min(8).max(10000).optional(),
  clearApiKey: z.boolean().optional().default(false),
  active: z.boolean(),
});

function redactAgent(
  agent: typeof aiAgentConfigs.$inferSelect,
) {
  const { apiKeyEncrypted: _apiKeyEncrypted, ...safeAgent } = agent;
  return { ...safeAgent, hasApiKey: Boolean(agent.apiKeyEncrypted) };
}

export const aiAgentRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const agents = await db
      .select()
      .from(aiAgentConfigs)
      .where(eq(aiAgentConfigs.userId, ctx.user.id));

    return agents.map(redactAgent);
  }),

  save: protectedProcedure.input(agentInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de dados indisponível." });
    }

    const account = await db
      .select()
      .from(whatsappAccounts)
      .where(and(eq(whatsappAccounts.id, input.waAccountId), eq(whatsappAccounts.userId, ctx.user.id)))
      .limit(1);
    if (!account[0]) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Conta WhatsApp não encontrada." });
    }

    const existing = await db
      .select()
      .from(aiAgentConfigs)
      .where(and(eq(aiAgentConfigs.userId, ctx.user.id), eq(aiAgentConfigs.waAccountId, input.waAccountId)))
      .limit(1);

    const credentialUpdate = input.clearApiKey
      ? { apiKeyEncrypted: null, apiKeyLast4: null }
      : input.apiKey
        ? {
            apiKeyEncrypted: encryptSecret(input.apiKey),
            apiKeyLast4: input.apiKey.slice(-4),
          }
        : {};

    const values = {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature.toFixed(2),
      systemPrompt: input.systemPrompt,
      mode: input.mode,
      active: input.active,
      ...credentialUpdate,
    };

    if (existing[0]) {
      await db
        .update(aiAgentConfigs)
        .set(values)
        .where(eq(aiAgentConfigs.id, existing[0].id));

      const updated = await db
        .select()
        .from(aiAgentConfigs)
        .where(eq(aiAgentConfigs.id, existing[0].id))
        .limit(1);
      return redactAgent(updated[0]);
    }

    await db.insert(aiAgentConfigs).values({
      id: randomUUID(),
      userId: ctx.user.id,
      waAccountId: input.waAccountId,
      waAccount: account[0].accountLabel,
      ...values,
    });

    const created = await db
      .select()
      .from(aiAgentConfigs)
      .where(and(eq(aiAgentConfigs.userId, ctx.user.id), eq(aiAgentConfigs.waAccountId, input.waAccountId)))
      .limit(1);
    return redactAgent(created[0]);
  }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { removed: false };

      await db
        .delete(aiAgentConfigs)
        .where(and(eq(aiAgentConfigs.id, input.id), eq(aiAgentConfigs.userId, ctx.user.id)));
      return { removed: true };
    }),

  maskedCredentialHint: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const agent = await db
        .select({ apiKeyLast4: aiAgentConfigs.apiKeyLast4 })
        .from(aiAgentConfigs)
        .where(and(eq(aiAgentConfigs.id, input.id), eq(aiAgentConfigs.userId, ctx.user.id)))
        .limit(1);

      return agent[0]?.apiKeyLast4 ? getSensitiveHint(agent[0].apiKeyLast4) : null;
    }),
});
