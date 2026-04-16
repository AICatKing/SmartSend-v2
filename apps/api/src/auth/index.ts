import { ConfigError } from "@smartsend/shared";

import { apiEnv } from "../env.js";
import { createDevHeaderAuthAdapter } from "./dev-header-auth.js";
import { createSupabaseAuthAdapter } from "./supabase-auth.js";
import type { AuthAdapter } from "./types.js";

export function createAuthAdapter(): AuthAdapter {
  if (apiEnv.AUTH_MODE === "supabase") {
    return createSupabaseAuthAdapter();
  }

  if (apiEnv.NODE_ENV === "production") {
    throw new ConfigError(
      "AUTH_MODE=dev_headers cannot be used in production. Switch to Supabase Auth integration first.",
    );
  }

  return createDevHeaderAuthAdapter();
}

export * from "./types.js";
