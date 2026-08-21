import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  createLocalUser: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  touchLastSignedIn: vi.fn(),
}));

vi.mock("./_core/session", () => ({
  createSessionToken: vi.fn().mockResolvedValue("signed-local-session"),
}));

import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import { hashPassword } from "./security";
import { COOKIE_NAME } from "../shared/const";

const localUser = {
  id: 42,
  name: "Gleyson",
  email: "admin@example.com",
  passwordHash: "",
  role: "admin" as const,
  createdAt: new Date("2026-08-21T00:00:00.000Z"),
  updatedAt: new Date("2026-08-21T00:00:00.000Z"),
  lastSignedIn: null,
};

function createContext() {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const ctx = {
    user: null,
    req: { protocol: "https", headers: {} },
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }),
      clearCookie: vi.fn(),
    },
  } as unknown as TrpcContext;
  return { ctx, cookies };
}

describe("auth local", () => {
  beforeEach(() => vi.clearAllMocks());

  it("regista o utilizador e cria uma sessão HTTP-only", async () => {
    vi.mocked(db.createLocalUser).mockResolvedValue(localUser);
    const { ctx, cookies } = createContext();

    const result = await appRouter.createCaller(ctx).auth.register({
      name: "Gleyson",
      email: "admin@example.com",
      password: "uma-palavra-passe-segura",
    });

    expect(result).toMatchObject({ id: 42, email: "admin@example.com", role: "admin" });
    expect(db.createLocalUser).toHaveBeenCalledWith(expect.objectContaining({
      name: "Gleyson",
      email: "admin@example.com",
      passwordHash: expect.stringMatching(/^scrypt:/),
    }));
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ name: COOKIE_NAME, value: "signed-local-session" });
    expect(cookies[0]?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
  });

  it("rejeita a entrada com palavra-passe incorreta", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({ ...localUser, passwordHash: await hashPassword("correta-e-segura") });
    const { ctx } = createContext();

    await expect(appRouter.createCaller(ctx).auth.login({
      email: "admin@example.com",
      password: "incorreta-e-segura",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
