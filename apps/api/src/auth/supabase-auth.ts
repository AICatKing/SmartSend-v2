import { ConfigError } from "@smartsend/shared";
import { createClient } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";

import { apiEnv } from "../env.js";
import type { AuthAdapter, AuthUser } from "./types.js";

export function createSupabaseAuthAdapter(): AuthAdapter {
  if (!apiEnv.SUPABASE_URL || !apiEnv.SUPABASE_ANON_KEY) {
    throw new ConfigError(
      "SUPABASE_URL and SUPABASE_ANON_KEY are required when AUTH_MODE=supabase.",
    );
  }

  const supabase = createClient(apiEnv.SUPABASE_URL, apiEnv.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return {
    kind: "supabase",
    async authenticate(request: FastifyRequest) {
      const accessToken = readBearerToken(request);

      if (!accessToken) {
        return null;
      }

      const { data, error } = await supabase.auth.getUser(accessToken);

      if (error || !data.user) {
        return null;
      }

      return {
        session: {
          id: `supabase:${data.user.id}`,
          userId: data.user.id,
        },
        user: toAuthUser(data.user),
        currentWorkspaceId: readPreferredWorkspaceId(request),
      };
    },
  };
}

function toAuthUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: unknown;
}): AuthUser {
  const metadata =
    user.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : {};
  const name =
    typeof metadata.name === "string"
      ? metadata.name
      : typeof metadata.full_name === "string"
        ? metadata.full_name
        : null;

  return {
    id: user.id,
    email: user.email?.trim().toLowerCase() ?? null,
    name,
  };
}

function readBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;

  if (!value || !value.startsWith("Bearer ")) {
    return null;
  }

  const token = value.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function readPreferredWorkspaceId(request: FastifyRequest) {
  const header = request.headers["x-smartsend-workspace-id"];

  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return typeof header === "string" && header.trim().length > 0 ? header.trim() : null;
}
