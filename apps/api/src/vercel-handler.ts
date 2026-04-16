import { createApiApp } from "./app.js";

type ApiApp = ReturnType<typeof createApiApp>;
type ReadyApiApp = Awaited<ApiApp>;
type InjectedResponse = {
  body: string;
  headers: Record<string, string | string[] | number | undefined>;
  statusCode: number;
};

let apiApp: ApiApp | null = null;
let apiAppReadyPromise: Promise<void> | null = null;

export async function handleVercelApiRequest(request: Request) {
  const app = await getApiApp();
  const url = new URL(request.url);
  const payload = await readPayload(request);

  const response = await injectIntoApp(app, {
    headers: Object.fromEntries(request.headers.entries()),
    method: request.method,
    ...(payload ? { payload } : {}),
    url: `${url.pathname}${url.search}`,
  });

  return new Response(response.body, {
    status: response.statusCode,
    headers: toResponseHeaders(response.headers as Record<string, string | string[] | undefined>),
  });
}

async function getApiApp() {
  if (!apiApp) {
    apiApp = createApiApp({
      includeLegacyFrontend: false,
    });
    apiAppReadyPromise = Promise.resolve(apiApp.ready()).then(() => undefined);
  }

  await apiAppReadyPromise;

  if (!apiApp) {
    throw new Error("API app failed to initialize.");
  }

  return apiApp;
}

async function readPayload(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const body = await request.arrayBuffer();

  if (body.byteLength === 0) {
    return undefined;
  }

  return Buffer.from(body);
}

async function injectIntoApp(
  app: ReadyApiApp,
  options: Record<string, unknown>,
): Promise<InjectedResponse> {
  return new Promise((resolve, reject) => {
    app.inject(options as never, (error, response) => {
      if (error) {
        reject(error);
        return;
      }

      if (!response) {
        reject(new Error("Fastify inject returned no response."));
        return;
      }

      resolve({
        body: response.body,
        headers: response.headers as Record<string, string | string[] | number | undefined>,
        statusCode: response.statusCode,
      });
    });
  });
}

function toResponseHeaders(
  headers: Record<string, string | string[] | number | undefined>,
) {
  const responseHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        responseHeaders.append(key, item);
      }

      continue;
    }

    responseHeaders.set(key, String(value));
  }

  return responseHeaders;
}
