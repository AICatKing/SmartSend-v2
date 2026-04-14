import type { FastifyRequest } from "fastify";

import type { AuthAdapter, AuthIdentity } from "./types.js";

export function createDevHeaderAuthAdapter(): AuthAdapter {
  return {
    kind: "dev_headers",
    async authenticate(request: FastifyRequest): Promise<AuthIdentity | null> {
      const userId = getHeader(request, "x-dev-user-id");
      const currentWorkspaceId = getHeader(request, "x-dev-workspace-id");

      if (!userId || !currentWorkspaceId) {
        return null;
      }

      return {
        session: {
          id: `dev-session:${userId}`,
          userId,
        },
        user: {
          id: userId,
          email: getHeader(request, "x-dev-user-email") ?? null,
          name: getHeader(request, "x-dev-user-name") ?? null,
        },
        currentWorkspaceId,
      };
    },
  };
}

function getHeader(request: FastifyRequest, name: string) {
  const header = request.headers[name];

  if (Array.isArray(header)) {
    return header[0];
  }

  return typeof header === "string" ? header : undefined;
}
