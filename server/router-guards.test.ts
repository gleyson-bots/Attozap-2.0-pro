import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(role: "user" | "admin" | null): TrpcContext {
  return {
    user: role
      ? {
          id: 42,
          openId: `${role}-test-user`,
          name: "ATTOZAP Test",
          email: "test@attozap.local",
          loginMethod: "test",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("router access guards", () => {
  it("rejects anonymous access to license and agent resources", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(caller.licenses.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.aiAgent.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a standard user before running an administrative procedure", async () => {
    const caller = appRouter.createCaller(createContext("user"));

    await expect(caller.admin.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
