import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { ConfigError } from "@smartsend/shared";

export interface SecretBox {
  encrypt(value: string): string;
  decrypt(payload: string): string;
}

export function createSecretBox(secret: string | undefined): SecretBox {
  if (!secret) {
    throw new ConfigError(
      "API_ENCRYPTION_KEY is required for workspace sending config updates.",
    );
  }

  const key = createHash("sha256").update(secret).digest();

  return {
    encrypt(value: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();

      return [
        "v1",
        iv.toString("base64"),
        tag.toString("base64"),
        encrypted.toString("base64"),
      ].join(".");
    },
    decrypt(payload: string) {
      const [version, ivBase64, tagBase64, dataBase64] = payload.split(".");

      if (version !== "v1" || !ivBase64 || !tagBase64 || !dataBase64) {
        throw new ConfigError("Encrypted secret has invalid format.");
      }

      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(ivBase64, "base64"),
      );
      decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataBase64, "base64")),
        decipher.final(),
      ]);

      return decrypted.toString("utf8");
    },
  };
}
