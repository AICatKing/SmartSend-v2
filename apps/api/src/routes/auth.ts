import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  authListWorkspacesOutputSchema,
  authLogoutOutputSchema,
  authMeOutputSchema,
  authSwitchWorkspaceInputSchema,
  authSwitchWorkspaceOutputSchema,
} from "@smartsend/contracts";
import {
  users,
  workspaceMembers,
  workspaces,
  type Database,
} from "@smartsend/db";
import { AppError } from "@smartsend/shared";

import { requireApiContext } from "./helpers.js";

export async function registerAuthRoutes(
  app: FastifyInstance<any, any, any, any>,
) {
  app.post("/api/auth/logout", async () => {
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
