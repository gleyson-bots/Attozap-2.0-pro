import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";
import * as db from "../db";
import { ENV } from "./env";

type SessionPayload = { userId: number };

function sessionKey() {
  if (!ENV.cookieSecret || ENV.cookieSecret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createSessionToken(userId: number) {
  return new SignJWT({ userId } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_MAX_AGE_MS) / 1000))
    .sign(sessionKey());
}

export async function authenticateRequest(req: Request): Promise<User> {
  const sessionToken = parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
  if (!sessionToken) throw new Error("MISSING_SESSION");

  const { payload } = await jwtVerify(sessionToken, sessionKey(), { algorithms: ["HS256"] });
  const userId = payload.userId;
  if (typeof userId !== "number" || !Number.isInteger(userId)) throw new Error("INVALID_SESSION");

  const user = await db.getUserById(userId);
  if (!user || !user.passwordHash) throw new Error("USER_NOT_FOUND");
  await db.touchLastSignedIn(user.id);
  return user;
}
