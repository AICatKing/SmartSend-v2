import type { FastifyBaseLogger } from "fastify";
import { ConfigError } from "@smartsend/shared";
import {
  createDatabase,
  type Database,
  type DatabaseClient,
} from "@smartsend/db";

import {
  createDatabaseAuditAdapter,
  createPendingAuditAdapter,
  type AuditAdapter,
} from "./audit/audit-adapter.js";
import { createAuthAdapter, type AuthAdapter } from "./auth/index.js";
import { apiEnv } from "./env.js";
import { createSecretBox, type SecretBox } from "./security/secret-box.js";

export type ApiServices = {
  authAdapter: AuthAdapter;
  auditAdapter: AuditAdapter;
  close(): Promise<void>;
  db: Database | null;
  requireDatabase(): Database;
  requireSecretBox(): SecretBox;
  secretBox: SecretBox | null;
};

type CreateApiServicesOptions = {
  auditAdapter?: AuditAdapter;
  authAdapter?: AuthAdapter;
  db?: Database | null;
  dbClient?: DatabaseClient | null;
  logger: FastifyBaseLogger;
  secretBox?: SecretBox | null;
};

export function createApiServices(
  options: CreateApiServicesOptions,
): ApiServices {
  const databaseBundle =
    options.db !== undefined
      ? { db: options.db, client: options.dbClient ?? null }
      : apiEnv.DATABASE_URL
        ? createDatabase(apiEnv.DATABASE_URL)
        : { db: null, client: null };

  const authAdapter = options.authAdapter ?? createAuthAdapter();
  const auditAdapter =
    options.auditAdapter ??
    (databaseBundle.db
      ? createDatabaseAuditAdapter(databaseBundle.db, options.logger)
      : createPendingAuditAdapter(options.logger));
  const secretBox =
    options.secretBox !== undefined
      ? options.secretBox
      : apiEnv.API_ENCRYPTION_KEY
        ? createSecretBox(apiEnv.API_ENCRYPTION_KEY)
        : null;

  return {
    authAdapter,
    auditAdapter,
    db: databaseBundle.db,
    requireDatabase() {
      if (!databaseBundle.db) {
        throw new ConfigError("DATABASE_URL is required for protected API routes.");
      }

      return databaseBundle.db;
    },
    requireSecretBox() {
      if (!secretBox) {
        throw new ConfigError(
          "API_ENCRYPTION_KEY is required for workspace sending config updates.",
        );
      }

      return secretBox;
    },
    secretBox,
    async close() {
      if (databaseBundle.client) {
        await databaseBundle.client.end();
      }
    },
  };
}
