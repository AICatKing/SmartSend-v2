# SmartSend-v2

Phase 1 currently provides a TypeScript monorepo skeleton for:

- `apps/api`: minimal HTTP process with `/health`
- `apps/worker`: local async shim for development only, mirroring future queue consumer and cron handler boundaries
- `packages/db`: PostgreSQL + Drizzle connectivity and schema layout placeholders
- `packages/contracts`: shared contract schemas
- `packages/domain`: shared domain primitives for workspace context, async runtime, and provider/error classification
- `packages/shared`: env loading, logger, and base error model

This repository intentionally does not yet implement business modules such as `contacts`, `templates`, `campaigns`, `send_jobs`, real auth flows, provider integrations, or async send execution logic.

## Prerequisites

- Node.js `>= 22`
- Docker Desktop or another Docker runtime

## Install

```bash
npm install
cp .env.example .env
```

`LOCAL_ASYNC_SHIM_PORT` is the preferred port variable for `apps/worker`. `WORKER_PORT` is still accepted as a compatibility fallback.

## Start PostgreSQL

```bash
docker compose up -d postgres
```

## Verify Database Connectivity

```bash
npm run db:check
```

## Start API

```bash
npm run dev:api
```

API health endpoint:

```bash
curl http://127.0.0.1:3000/health
```

## Start Local Async Shim

```bash
npm run dev:async-shim
```

Local shim health endpoint:

```bash
curl http://127.0.0.1:3001/health
```

## Typecheck

```bash
npm run typecheck
```

## Notes

- Drizzle schema source of truth is fixed at `packages/db/src/schema/*`
- Drizzle migration output is fixed at `packages/db/drizzle/`
- Phase 1 only sets the schema file layout and DB connection path. Business tables and migrations are intentionally deferred to the next work packages.
- `apps/worker` is a development shim, not a production deployment unit.
- Production direction is `Vercel Functions + Vercel Queues + Vercel Cron Jobs`; the local shim only mirrors handler boundaries for development.
- Phase 1 now exposes explicit placeholders for queue producer, queue consumer handler, and cron recovery/reconciliation handler under `apps/worker/src/`.
- `npm run dev:worker` and `npm run start:worker` are kept as compatibility aliases, but they now point to the local async shim.
