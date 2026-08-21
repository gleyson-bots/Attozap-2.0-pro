import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { createSessionToken } from "./_core/session";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { adminRouter } from "./routers/admin";
import { aiAgentRouter } from "./routers/aiAgent";
import { downloadsRouter } from "./routers/downloads";
import { licensesRouter } from "./routers/licenses";
import { whatsappAccountsRouter } from "./routers/whatsappAccounts";
import { hashPassword, verifyPassword } from "./security";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12, "A palavra-passe deve ter pelo menos 12 caracteres.").max(128),
});

const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(120),
});

function publicUser(user: NonNullable<Awaited<ReturnType<typeof db.getUserById>>>) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt, lastSignedIn: user.lastSignedIn };
}

async function setSession(ctx: { req: Parameters<typeof getSessionCookieOptions>[0]; res: { cookie: Function } }, userId: number) {
  const token = await createSessionToken(userId);
  ctx.res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ? publicUser(opts.ctx.user) : null),
    register: publicProcedure.input(registrationSchema).mutation(async ({ ctx, input }) => {
      const passwordHash = await hashPassword(input.password);
      let user;
      try {
        user = await db.createLocalUser({ ...input, passwordHash });
      } catch (error) {
        if (error instanceof Error && error.message === "EMAIL_ALREADY_REGISTERED") {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com este email." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar a conta." });
      }
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar a conta." });
      await setSession(ctx, user.id);
      return publicUser(user);
    }),
    login: publicProcedure.input(credentialsSchema).mutation(async ({ ctx, input }) => {
      const user = await db.getUserByEmail(input.email);
      if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou palavra-passe inválidos." });
      }
      await db.touchLastSignedIn(user.id);
      await setSession(ctx, user.id);
      return publicUser(user);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  licenses: licensesRouter,
  downloads: downloadsRouter,
  aiAgent: aiAgentRouter,
  whatsappAccounts: whatsappAccountsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
