import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";

export function isSafeStorageKey(key: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,240}$/.test(key);
}

function registerStorageProxy(app: express.Express) {
  app.get("/manus-storage/:key", async (request, response) => {
    const key = request.params.key;
    if (!isSafeStorageKey(key)) {
      response.status(400).type("text").send("Invalid storage key");
      return;
    }

    const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL ?? "").replace(/\/+$/, "");
    const forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY;
    if (!forgeBaseUrl || !forgeApiKey) {
      response.status(503).type("text").send("Asset service unavailable");
      return;
    }

    try {
      const forgeUrl = new URL("v1/storage/presign/get", `${forgeBaseUrl}/`);
      forgeUrl.searchParams.set("path", key);
      const forgeResponse = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${forgeApiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!forgeResponse.ok) {
        response.status(502).type("text").send("Asset service error");
        return;
      }

      const payload = (await forgeResponse.json()) as { url?: unknown };
      if (typeof payload.url !== "string" || !payload.url.startsWith("https://")) {
        response.status(502).type("text").send("Invalid asset response");
        return;
      }

      response.set("Cache-Control", "no-store").redirect(307, payload.url);
    } catch {
      response.status(502).type("text").send("Asset service error");
    }
  });
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  app.get("/api/health", (_request, response) => response.status(200).json({ status: "ok" }));
  return app;
}
