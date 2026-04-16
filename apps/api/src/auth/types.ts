import type { FastifyRequest } from "fastify";
import type { WorkspaceRole } from "@smartsend/domain";

export type AuthSession = {
  id: string;
  userId: string;
};

export type AuthUser = {
  id: string;
  email: string | null;
  name?: string | null;
};

export type AuthIdentity = {
  session: AuthSession;
  user: AuthUser;
  currentWorkspaceId: string | null;
};

export type ApiRequestContext = {
  session: AuthSession;
  user: AuthUser;
  currentWorkspaceId: string;
  workspaceRole: WorkspaceRole;
};

export interface AuthAdapter {
  readonly kind: "dev_headers" | "supabase";
  authenticate(request: FastifyRequest): Promise<AuthIdentity | null>;
}
