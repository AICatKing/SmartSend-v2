import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { FastifyInstance } from "fastify";

const frontendDir = fileURLToPath(new URL("../frontend", import.meta.url));

const assetMap = {
  "main.js": { fileName: "main.js", contentType: "text/javascript; charset=utf-8" },
  "styles.css": { fileName: "styles.css", contentType: "text/css; charset=utf-8" },
} as const;

export async function registerFrontendRoutes(
  app: FastifyInstance<any, any, any, any>,
) {
  app.get("/app", async (_request, reply) => {
    const html = await readFrontendFile("index.html");

    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/app/", async (_request, reply) => {
    return reply.redirect("/app");
  });

  app.get("/app/:asset", async (request, reply) => {
    const { asset } = request.params as { asset: string };
    const mappedAsset = assetMap[asset as keyof typeof assetMap];

    if (!mappedAsset) {
      return reply.code(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Asset not found.",
        },
      });
    }

    const content = await readFrontendFile(mappedAsset.fileName);

    return reply.type(mappedAsset.contentType).send(content);
  });
}

async function readFrontendFile(fileName: string) {
  return readFile(join(frontendDir, fileName), "utf8");
}
