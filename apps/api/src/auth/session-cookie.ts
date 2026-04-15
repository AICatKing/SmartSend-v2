import { createHash, randomBytes } from "node:crypto";

export function generateSessionToken() {
  return randomBytes(48).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function readCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(";");

  for (const pair of pairs) {
    const [rawName, ...rawValue] = pair.trim().split("=");
    if (!rawName || rawValue.length === 0) {
      continue;
    }

    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

export function serializeSessionCookie(input: {
  name: string;
  token: string;
  maxAgeSeconds: number;
  secure: boolean;
}) {
  return [
    `${input.name}=${encodeURIComponent(input.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(1, Math.floor(input.maxAgeSeconds))}`,
    ...(input.secure ? ["Secure"] : []),
  ].join("; ");
}

export function serializeClearedSessionCookie(input: {
  name: string;
  secure: boolean;
}) {
  return [
    `${input.name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(input.secure ? ["Secure"] : []),
  ].join("; ");
}
