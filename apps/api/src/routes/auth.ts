import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  authListWorkspacesOutputSchema,
  authLoginInputSchema,
  authLoginOutputSchema,
  authLogoutOutputSchema,
  authMeOutputSchema,
  authSwitchWorkspaceInputSchema,
  authSwitchWorkspaceOutputSchema,
} from "@smartsend/contracts";
import {
  authSessions,
  users,
  workspaceMembers,
  workspaces,
  type Database,
} from "@smartsend/db";
import { AppError } from "@smartsend/shared";

import { apiEnv } from "../env.js";
import {
  generateSessionToken,
  hashSessionToken,
  readCookieValue,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from "../auth/session-cookie.js";
import { requireApiContext } from "./helpers.js";

const SESSION_MAX_AGE_SECONDS = apiEnv.AUTH_SESSION_TTL_DAYS * 24 * 60 * 60;

export async function registerAuthRoutes(
  app: FastifyInstance<any, any, any, any>,
) {
  app.post("/api/auth/login", async (request, reply) => {
    const body = authLoginInputSchema.parse(request.body ?? {});
    const db = app.services.requireDatabase();
    const email = body.email.trim().toLowerCase();

    const loginResult = await db.transaction(async (tx) => {
      const existingUserRows = await tx
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const existingUser = existingUserRows[0];
      const userId = existingUser?.id ?? `user_${crypto.randomUUID()}`;

      if (!existingUser) {
        await tx.insert(users).values({
          id: userId,
          email,
          name: body.name?.trim() || null,
        });
      } else if (body.name?.trim() && existingUser.name !== body.name.trim()) {
        await tx
          .update(users)
          .set({
            name: body.name.trim(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id));
      }

      let memberships = await listMemberships(tx, userId);

      if (memberships.length === 0) {
        const workspaceId = `ws_${crypto.randomUUID()}`;

        await tx.insert(workspaces).values({
          id: workspaceId,
          name: `${body.name?.trim() || email} Workspace`,
        });

        await tx.insert(workspaceMembers).values({
          workspaceId,
          userId,
          role: "owner",
        });

        memberships = await listMemberships(tx, userId);
      }

      const selectedWorkspace = body.workspaceId
        ? memberships.find((item) => item.workspaceId === body.workspaceId)
        : memberships[0];

      if (!selectedWorkspace) {
        throw new AppError(
          "FORBIDDEN",
          "User does not belong to the requested workspace.",
        );
      }

      const sessionToken = generateSessionToken();
      const sessionId = `auth_session_${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

      await tx.insert(authSessions).values({
        id: sessionId,
        userId,
        currentWorkspaceId: selectedWorkspace.workspaceId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt,
      });

      return {
        sessionId,
        sessionToken,
        userId,
        currentWorkspaceId: selectedWorkspace.workspaceId,
      };
    });

    reply.header(
      "set-cookie",
      serializeSessionCookie({
        name: apiEnv.AUTH_SESSION_COOKIE_NAME,
        token: loginResult.sessionToken,
        maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
        secure: apiEnv.NODE_ENV === "production",
      }),
    );

    const output = await buildSessionContext(app, {
      sessionId: loginResult.sessionId,
      userId: loginResult.userId,
      currentWorkspaceId: loginResult.currentWorkspaceId,
    });

    return authLoginOutputSchema.parse(output);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = readCookieValue(
      readCookieHeader(request),
      apiEnv.AUTH_SESSION_COOKIE_NAME,
    );

    if (token) {
      await app
        .services
        .requireDatabase()
        .delete(authSessions)
        .where(eq(authSessions.tokenHash, hashSessionToken(token)));
    }

    reply.header(
      "set-cookie",
      serializeClearedSessionCookie({
        name: apiEnv.AUTH_SESSION_COOKIE_NAME,
        secure: apiEnv.NODE_ENV === "production",
      }),
    );

    return authLogoutOutputSchema.parse({ success: true });
  });

  app.get("/api/auth/me", { preHandler: requireApiContext }, async (request) => {
    const output = await buildSessionContext(app, {
      sessionId: request.apiContext.session.id,
      userId: request.apiContext.user.id,
      currentWorkspaceId: request.apiContext.currentWorkspaceId,
    });

    return authMeOutputSchema.parse(output);
  });

  app.get(
    "/api/auth/workspaces",
    { preHandler: requireApiContext },
    async (request) => {
      const workspaceList = await listMemberships(
        app.services.requireDatabase(),
        request.apiContext.user.id,
      );

      return authListWorkspacesOutputSchema.parse({
        currentWorkspaceId: request.apiContext.currentWorkspaceId,
        workspaces: workspaceList,
      });
    },
  );

  app.post(
    "/api/auth/switch-workspace",
    { preHandler: requireApiContext },
    async (request) => {
      const body = authSwitchWorkspaceInputSchema.parse(request.body ?? {});
      const db = app.services.requireDatabase();

      const workspaceList = await listMemberships(db, request.apiContext.user.id);
      const requestedWorkspace = workspaceList.find(
        (item) => item.workspaceId === body.workspaceId,
      );

      if (!requestedWorkspace) {
        throw new AppError(
          "FORBIDDEN",
          "User does not belong to the requested workspace.",
        );
      }

      const updated = await db
        .update(authSessions)
        .set({
          currentWorkspaceId: body.workspaceId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(authSessions.id, request.apiContext.session.id),
            eq(authSessions.userId, request.apiContext.user.id),
          ),
        )
        .returning({ id: authSessions.id });

      if (!updated[0]) {
        throw new AppError("UNAUTHORIZED", "Session not found or expired.");
      }

      const output = await buildSessionContext(app, {
        sessionId: request.apiContext.session.id,
        userId: request.apiContext.user.id,
        currentWorkspaceId: body.workspaceId,
      });

      return authSwitchWorkspaceOutputSchema.parse(output);
    },
  );
}

async function buildSessionContext(
  app: FastifyInstance<any, any, any, any>,
  input: {
    sessionId: string;
    userId: string;
    currentWorkspaceId: string;
  },
) {
  const db = app.services.requireDatabase();
  const userRows = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    throw new AppError("UNAUTHORIZED", "User no longer exists.");
  }

  const memberships = await listMemberships(db, input.userId);
  const currentMembership = memberships.find(
    (item) => item.workspaceId === input.currentWorkspaceId,
  );

  if (!currentMembership) {
    throw new AppError(
      "FORBIDDEN",
      "Current workspace is no longer accessible for this user.",
    );
  }

  return {
    sessionId: input.sessionId,
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
    },
    currentWorkspaceId: input.currentWorkspaceId,
    currentWorkspaceRole: currentMembership.role,
    workspaces: memberships,
  };
}

async function listMemberships(db: Pick<Database, "select">, userId: string) {
  return db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaces.createdAt);
}

function readCookieHeader(request: { headers: Record<string, unknown> }) {
  const header = request.headers.cookie;

  if (Array.isArray(header)) {
    return header[0];
  }

  return typeof header === "string" ? header : undefined;
}
