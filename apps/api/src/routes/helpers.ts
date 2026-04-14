import type { FastifyReply, FastifyRequest } from "fastify";

import { resolveApiRequestContext } from "../context.js";

export async function requireApiContext(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  request.apiContext = await resolveApiRequestContext(request.server.services, request);
}
