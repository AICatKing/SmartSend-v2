import { AppError } from "@smartsend/shared";
import { eq } from "drizzle-orm";
import { users, workspaceMembers, workspaces, type Database } from "@smartsend/db";

import type { ApiRequestContext } from "./auth/index.js";
import type { AuthIdentity } from "./auth/types.js";
import type { ApiServices } from "./services.js";

export async function resolveApiRequestContext(
  services: ApiServices,
  request: { headers: Record<string, unknown> },
) {
  const identity = await services.authAdapter.authenticate(request as never);

  if (!identity) {
    throw new AppError("UNAUTHORIZED", "Authentication required.");
  }

  const db = services.requireDatabase();
  const { localUser, memberships } = await ensureLocalUserAndMemberships(db, identity);
  const currentMembership = identity.currentWorkspaceId
    ? memberships.find((item) => item.workspaceId === identity.currentWorkspaceId)
    : memberships[0];

  if (!currentMembership) {
    throw new AppError(
      "FORBIDDEN",
      identity.currentWorkspaceId
        ? "User does not belong to the requested workspace."
        : "User does not belong to any accessible workspace.",
      identity.currentWorkspaceId
        ? {
            details: {
              userId: localUser.id,
              workspaceId: identity.currentWorkspaceId,
            },
          }
        : undefined,
    );
  }

  const context: ApiRequestContext = {
    session: {
      id: identity.session.id,
      userId: localUser.id,
    },
    user: {
      id: localUser.id,
      email: localUser.email,
      name: localUser.name,
    },
    currentWorkspaceId: currentMembership.workspaceId,
    workspaceRole: currentMembership.role,
  };

  return context;
}

async function ensureLocalUserAndMemberships(db: Database, identity: AuthIdentity) {
  const normalizedEmail = identity.user.email?.trim().toLowerCase() ?? null;
  const normalizedName = identity.user.name?.trim() || null;

  return db.transaction(async (tx) => {
    let localUser = (
      await tx
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, identity.user.id))
        .limit(1)
    )[0];

    if (!localUser && normalizedEmail) {
      localUser = (
        await tx
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
          })
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1)
      )[0];
    }

    if (!localUser) {
      if (!normalizedEmail) {
        throw new AppError(
          "UNAUTHORIZED",
          "Supabase user email is required for SmartSend workspace access.",
        );
      }

      await tx.insert(users).values({
        id: identity.user.id,
        email: normalizedEmail,
        name: normalizedName,
      });

      localUser = {
        id: identity.user.id,
        email: normalizedEmail,
        name: normalizedName,
      };
    } else if (
      (normalizedEmail && localUser.email !== normalizedEmail) ||
      (normalizedName && localUser.name !== normalizedName)
    ) {
      await tx
        .update(users)
        .set({
          email: normalizedEmail ?? localUser.email,
          name: normalizedName ?? localUser.name,
          updatedAt: new Date(),
        })
        .where(eq(users.id, localUser.id));

      localUser = {
        ...localUser,
        email: normalizedEmail ?? localUser.email,
        name: normalizedName ?? localUser.name,
      };
    }

    let memberships = await listMemberships(tx, localUser.id);

    if (memberships.length === 0) {
      const workspaceId = `ws_${crypto.randomUUID()}`;

      await tx.insert(workspaces).values({
        id: workspaceId,
        name: `${normalizedName || localUser.email} Workspace`,
      });

      await tx.insert(workspaceMembers).values({
        workspaceId,
        userId: localUser.id,
        role: "owner",
      });

      memberships = await listMemberships(tx, localUser.id);
    }

    return {
      localUser,
      memberships,
    };
  });
}

async function listMemberships(db: Pick<Database, "select">, userId: string) {
  return db
    .select({
      workspaceId: workspaces.id,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaces.createdAt);
}
