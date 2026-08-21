import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { adminRouter } from "./routers/admin";
import { aiAgentRouter } from "./routers/aiAgent";
import { downloadsRouter } from "./routers/downloads";
import { licensesRouter } from "./routers/licenses";
import { whatsappAccountsRouter } from "./routers/whatsappAccounts";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
