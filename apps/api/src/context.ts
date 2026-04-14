import { AppError } from "@smartsend/shared";
import { and, eq } from "drizzle-orm";
import { users, workspaceMembers } from "@smartsend/db";

import type { ApiServices } from "./services.js";
import type { ApiRequestContext } from "./auth/index.js";

export async function resolveApiRequestContext(
  services: ApiServices,
  request: { headers: Record<string, unknown> },
) {
  const identity = await services.authAdapter.authenticate(request as never);

  if (!identity) {
    throw new AppError("UNAUTHORIZED", "Authentication required.");
  }

  const db = services.requireDatabase();

  const membership = await db
    .select({
      userId: users.id,
      userEmail: users.email,
      userName: users.name,
      workspaceRole: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        eq(workspaceMembers.userId, identity.user.id),
        eq(workspaceMembers.workspaceId, identity.currentWorkspaceId),
      ),
    )
    .limit(1);

  const row = membership[0];

  if (!row) {
    throw new AppError(
      "FORBIDDEN",
      "User does not belong to the requested workspace.",
      {
        details: {
          userId: identity.user.id,
          workspaceId: identity.currentWorkspaceId,
        },
      },
    );
  }

  const context: ApiRequestContext = {
    session: identity.session,
    user: {
      id: row.userId,
      email: row.userEmail,
      name: row.userName,
    },
    currentWorkspaceId: identity.currentWorkspaceId,
    workspaceRole: row.workspaceRole,
  };

  return context;
}
