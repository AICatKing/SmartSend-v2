import { and, eq, gt } from "drizzle-orm";
import { authSessions, users } from "@smartsend/db";
import type { FastifyRequest } from "fastify";

import { apiEnv } from "../env.js";
import { hashSessionToken, readCookieValue } from "./session-cookie.js";
import type { AuthAdapter } from "./types.js";

export function createBetterAuthAdapter(): AuthAdapter {
  return {
    kind: "better_auth",
    async authenticate(request: FastifyRequest) {
      const token = readCookieValue(
        readHeader(request, "cookie"),
        apiEnv.AUTH_SESSION_COOKIE_NAME,
      );

      if (!token) {
        return null;
      }

      const tokenHash = hashSessionToken(token);
      const db = request.server.services.requireDatabase();

      const rows = await db
        .select({
          sessionId: authSessions.id,
          sessionUserId: authSessions.userId,
          currentWorkspaceId: authSessions.currentWorkspaceId,
          userId: users.id,
          userEmail: users.email,
          userName: users.name,
        })
        .from(authSessions)
        .innerJoin(users, eq(authSessions.userId, users.id))
        .where(
          and(
            eq(authSessions.tokenHash, tokenHash),
            gt(authSessions.expiresAt, new Date()),
          ),
        )
        .limit(1);

      const row = rows[0];

      if (!row) {
        return null;
      }

      return {
        session: {
          id: row.sessionId,
          userId: row.sessionUserId,
        },
        user: {
          id: row.userId,
          email: row.userEmail,
          name: row.userName,
        },
        currentWorkspaceId: row.currentWorkspaceId,
      };
    },
  };
}

function readHeader(request: FastifyRequest, name: string) {
  const header = request.headers[name];

  if (Array.isArray(header)) {
    return header[0];
  }

  return typeof header === "string" ? header : undefined;
}
