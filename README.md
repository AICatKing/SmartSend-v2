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
- `SEND_JOB_LOCK_TIMEOUT_MS` controls when a `processing` job is considered timed out for cron recovery. Default is `900000` milliseconds (`15` minutes).

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

## Manually Trigger One Recovery Sweep

Development-only internal route:

```bash
curl -X POST http://127.0.0.1:3001/internal/recover-once \
  -H 'x-smartsend-internal-dev: true'
```

Behavior:

- route is only registered outside production mode
- request must include `x-smartsend-internal-dev: true`
- one call triggers one recovery sweep for timed-out `processing` jobs
- recovery only moves jobs to `pending` or `failed`
- recovery never marks a job as `sent`

Recovery rule:

- a `send_job` is considered stuck only when `status = processing`, `processed_at is null`, `locked_at is not null`, and `locked_at <= now() - SEND_JOB_LOCK_TIMEOUT_MS`
- recovery treats the timed-out processing attempt as consumed and increments `attempt_count`
- if the recovered attempt reaches `max_attempts`, the job becomes `failed`
- otherwise the job returns to `pending`
- every touched campaign is re-aggregated from `send_jobs` after recovery

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

## Minimal Local Recovery Validation

1. Start Postgres, `apps/api`, and `apps/worker`.
2. Queue a campaign so at least one `send_job` exists.
3. In PostgreSQL, simulate a stuck job:

```sql
update send_jobs
set
  status = 'processing',
  locked_at = now() - interval '20 minutes',
  locked_by = 'manual-test-worker',
  processed_at = null
where id = '<send_job_id>';
```

4. Trigger one recovery sweep:

```bash
curl -X POST http://127.0.0.1:3001/internal/recover-once \
  -H 'x-smartsend-internal-dev: true'
```

5. Verify:

- timed-out job moved to `pending` or `failed`
- `locked_at` and `locked_by` were cleared
- `attempt_count` increased by `1`
- related `campaign.status` was refreshed from current `send_jobs`

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

Worker tests now include cron recovery database scenarios and the internal manual recovery route.

## Typecheck

```bash
npm run typecheck
```

## Notes

- Drizzle schema source of truth is `packages/db/src/schema/*`
- Drizzle migration output is `packages/db/drizzle/`
- production direction remains `Vercel Functions + Vercel Queues + Vercel Cron Jobs`
- queue producer logging exists, but real queue delivery remains a later work package
- cron recovery exists for locked `processing` job reconciliation, but retry backoff policy remains a later package
- `npm run dev:worker` and `npm run start:worker` are kept as compatibility aliases and point to the local async shim
