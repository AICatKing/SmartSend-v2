# SmartSend-v2

`SmartSend-v2` is a TypeScript monorepo for the Vercel-first backend rewrite of SmartSend.

Current implemented areas:

- `apps/api`: protected API, workspace sending config, campaign draft/queue flow, progress queries
- `apps/worker`: local async shim for development, queue-consumer-style processing, internal dev trigger
- `packages/db`: PostgreSQL + Drizzle schema and migrations
- `packages/contracts`: shared request/response schemas
- `packages/domain`: campaign, send-job, provider, and processing logic
- `packages/shared`: env loading, logging, errors, secret-box encryption

Current intentionally deferred areas:

- cron recovery and reconciliation
- retry backoff scheduling policy beyond immediate requeue
- real Vercel Queues production integration
- frontend wiring

## Prerequisites

- Node.js `>= 22`
- Docker Desktop or another Docker runtime

## Install

```bash
npm install
cp .env.example .env
```

## Required Environment Variables

Worker/local async shim currently requires:

- `DATABASE_URL`
- `API_ENCRYPTION_KEY`
- `PROVIDER_MODE`

Recommended local values:

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/smartsend
API_ENCRYPTION_KEY=replace-with-at-least-32-characters
PROVIDER_MODE=mock
```

Notes:

- `API_ENCRYPTION_KEY` must match the key used by `apps/api`, otherwise the worker cannot decrypt `workspace_sending_configs.encrypted_api_key`.
- `PROVIDER_MODE=mock` is the default local development mode.
- `PROVIDER_MODE=resend` keeps the real Resend HTTP adapter enabled.
- `LOCAL_ASYNC_SHIM_PORT` is the preferred worker port variable. `WORKER_PORT` is still accepted as a compatibility fallback.

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

`apps/worker` is still a development shim, not a production deployment unit. It mirrors the future queue-consumer and cron-handler boundaries while using the real database facts layer.

## Manually Trigger One Consumer Poll

Development-only internal route:

```bash
curl -X POST http://127.0.0.1:3001/internal/consume-once \
  -H 'content-type: application/json' \
  -H 'x-smartsend-internal-dev: true' \
  -d '{"messageCount":1}'
```

Behavior:

- route is only registered outside production mode
- request must include `x-smartsend-internal-dev: true`
- one call triggers one consumer polling cycle
- `messageCount` controls the maximum number of jobs claimed in that poll

This route is for local development only. It is not intended to be exposed as a public application API.

## Mock Provider Behavior

When `PROVIDER_MODE=mock`, the worker keeps the real database flow but simulates provider outcomes from recipient email patterns:

- normal email, for example `alice@example.com`: success -> `send_jobs.status = sent`
- email containing `retryable`: retryable failure -> `send_jobs.status = pending`
- email containing `nonretryable`: non-retryable failure -> `send_jobs.status = failed`
- email containing `unknown`: unknown failure -> currently treated through the retryable branch until max attempts are reached

The mock adapter still requires a stored workspace sending config because processing reads and decrypts the encrypted provider key before simulating the provider response.

## Minimal Local Processing Flow

1. Start Postgres.
2. Start `apps/api`.
3. Start `apps/worker` with `PROVIDER_MODE=mock`.
4. Create or update a workspace sending config through the API.
5. Create a campaign and queue it so `send_jobs` exist in the database.
6. Call `POST /internal/consume-once` on the local async shim.
7. Inspect `send_jobs`, `delivery_attempts`, and campaign progress.

## Tests

Run worker processing integration tests:

```bash
npm test --workspace @smartsend/local-async-shim
```

Run API tests:

```bash
npm test --workspace @smartsend/api
```

Both integration suites require `DATABASE_URL`. Without it, they are skipped by design.

## Typecheck

```bash
npm run typecheck
```

## Notes

- Drizzle schema source of truth is `packages/db/src/schema/*`
- Drizzle migration output is `packages/db/drizzle/`
- production direction remains `Vercel Functions + Vercel Queues + Vercel Cron Jobs`
- queue producer logging exists, but real queue delivery remains a later work package
- cron recovery remains intentionally deferred until the next backend package
- `npm run dev:worker` and `npm run start:worker` are kept as compatibility aliases and point to the local async shim
