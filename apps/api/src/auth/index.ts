import { ConfigError } from "@smartsend/shared";

import { apiEnv } from "../env.js";
import { createBetterAuthAdapterPlaceholder } from "./better-auth.js";
import { createDevHeaderAuthAdapter } from "./dev-header-auth.js";
import type { AuthAdapter } from "./types.js";

export function createAuthAdapter(): AuthAdapter {
  if (apiEnv.AUTH_MODE === "better_auth") {
    return createBetterAuthAdapterPlaceholder();
  }

  if (apiEnv.NODE_ENV === "production") {
    throw new ConfigError(
      "AUTH_MODE=dev_headers cannot be used in production. Switch to Better Auth integration first.",
    );
  }

  return createDevHeaderAuthAdapter();
}

export * from "./types.js";
