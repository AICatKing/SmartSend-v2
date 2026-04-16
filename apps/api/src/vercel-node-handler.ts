import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

import { handleVercelApiRequest } from "./vercel-handler.js";

export async function handleVercelNodeRequest(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const requestBody = shouldIncludeBody(req.method)
    ? await readRequestBody(req)
    : undefined;
  const request = new Request(buildRequestUrl(req), {
    method: req.method ?? "GET",
    headers: toFetchHeaders(req.headers),
    ...(requestBody ? { body: requestBody } : {}),
  });

  const response = await handleVercelApiRequest(request);

  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

function buildRequestUrl(req: IncomingMessage) {
  const forwardedProtocol = readSingleHeader(req.headers["x-forwarded-proto"]) ?? "https";
  const forwardedHost =
    readSingleHeader(req.headers["x-forwarded-host"]) ??
    readSingleHeader(req.headers.host) ??
    "localhost";
  const path = req.url ?? "/";

  return new URL(path, `${forwardedProtocol}://${forwardedHost}`);
}

function toFetchHeaders(headers: IncomingHttpHeaders) {
  const result = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }

      continue;
    }

    result.set(key, value);
  }

  return result;
}

function shouldIncludeBody(method: string | undefined) {
  return method !== "GET" && method !== "HEAD";
}

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

function readSingleHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
