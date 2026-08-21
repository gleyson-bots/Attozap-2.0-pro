import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserLicenses: vi.fn(),
  getUserLicenseOverview: vi.fn(),
  getDownloadsForUser: vi.fn(),
  ensurePlanCatalog: vi.fn(),
  listAdminLicenses: vi.fn(),
  listAdminUsers: vi.fn(),
  listPublishedDownloads: vi.fn(),
}));

vi.mock("./db", () => dbMocks);

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { hashSensitiveValue } from "./security";

function userContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "portal-test-user",
      name: "Portal Test",
      email: "portal-test@attozap.local",
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function selectSequence(rows: unknown[][]) {
  const limit = vi.fn();
  rows.forEach(row => limit.mockResolvedValueOnce(row));
  return vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit })),
    })),
  }));
}

describe("portal functional router flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("consumes a valid renewal key exactly once and records the renewal", async () => {
    const licenseId = randomUUID();
    const renewalKey = "ATTOZAP-RENEW-KEY-0001";
    const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const db = {
      select: selectSequence([[
        {
          id: licenseId,
          userId: 7,
          status: "expired",
          expiresAt: new Date("2026-01-01T00:00:00Z"),
          renewalKeyHash: hashSensitiveValue(renewalKey),
          renewalKeyHint: "••••0001",
        },
      ]]),
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    dbMocks.getDb.mockResolvedValue(db);

    const result = await appRouter.createCaller(userContext()).licenses.renewWithKey({ licenseId, renewalKey });

    expect(result.daysAdded).toBe(30);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: "active",
      renewalKeyHash: null,
      renewalKeyHint: null,
    }));
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      licenseId,
      daysAdded: 30,
      renewalKeyHash: hashSensitiveValue(renewalKey),
    }));
  });

  it("rejects an invalid or previously consumed renewal key without updating the license", async () => {
    const licenseId = randomUUID();
    const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const db = {
      select: selectSequence([[
        {
          id: licenseId,
          userId: 7,
          status: "active",
          expiresAt: new Date(),
          renewalKeyHash: hashSensitiveValue("another-key"),
        },
      ]]),
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: vi.fn() })),
    };
    dbMocks.getDb.mockResolvedValue(db);

    await expect(
      appRouter.createCaller(userContext()).licenses.renewWithKey({ licenseId, renewalKey: "bad-renewal-key" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("saves an agent only for an owned WhatsApp account and redacts the credential", async () => {
    const accountId = randomUUID();
    const agentId = randomUUID();
    const db = {
      select: selectSequence([
        [{ id: accountId, userId: 7, accountLabel: "Comercial Brasil" }],
        [],
        [{
          id: agentId,
          userId: 7,
          waAccountId: accountId,
          waAccount: "Comercial Brasil",
          provider: "openai",
          model: "gpt-4.1-mini",
          temperature: "0.70",
          systemPrompt: "Responda de forma cordial e objetiva aos contactos autorizados.",
          mode: "reply",
          apiKeyEncrypted: "v1:opaque:payload:value",
          apiKeyLast4: "1234",
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
      ]),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      update: vi.fn(),
    };
    dbMocks.getDb.mockResolvedValue(db);

    const result = await appRouter.createCaller(userContext()).aiAgent.save({
      waAccountId: accountId,
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      systemPrompt: "Responda de forma cordial e objetiva aos contactos autorizados.",
      mode: "reply",
      apiKey: "sk-protected-demo-key-1234",
      active: true,
    });

    expect(result.waAccount).toBe("Comercial Brasil");
    expect(result.hasApiKey).toBe(true);
    expect(result).not.toHaveProperty("apiKeyEncrypted");
  });

  it("creates a WhatsApp account owned by the caller", async () => {
    const accountId = randomUUID();
    const db = {
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      select: selectSequence([[
        {
          id: accountId,
          userId: 7,
          accountLabel: "Suporte",
          phoneNumber: "+5511936216745",
          status: "active",
        },
      ]]),
    };
    dbMocks.getDb.mockResolvedValue(db);

    const created = await appRouter.createCaller(userContext()).whatsappAccounts.save({
      accountLabel: "Suporte",
      phoneNumber: "+5511936216745",
      status: "active",
    });

    expect(created).toMatchObject({ userId: 7, accountLabel: "Suporte", status: "active" });
  });
});
