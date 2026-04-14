import { ConfigError } from "@smartsend/shared";

import type { AuthAdapter } from "./types.js";

export function createBetterAuthAdapterPlaceholder(): AuthAdapter {
  return {
    kind: "better_auth",
    async authenticate() {
      throw new ConfigError(
        "AUTH_MODE=better_auth is reserved but Better Auth server integration is not implemented yet.",
      );
    },
  };
}
