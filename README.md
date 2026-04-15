# SmartSend-v2

`SmartSend-v2` is a TypeScript monorepo for the Vercel-first backend rewrite of SmartSend.

Current implemented areas:

- `apps/api`: protected API, workspace sending config, campaign draft/queue flow, progress queries
- `apps/web`: Vite + React + TypeScript + React Router SPA for product frontend flows
- `apps/worker`: local async shim for development, queue-consumer-style processing, internal dev trigger
- `packages/db`: PostgreSQL + Drizzle schema and migrations
- `packages/contracts`: shared request/response schemas
- `packages/domain`: campaign, send-job, provider, and processing logic
- `packages/shared`: env loading, logging, errors, secret-box encryption

Current intentionally deferred areas:

- real Vercel Queues production integration
- dashboard and rich reporting

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
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/smartsend_test
API_ENCRYPTION_KEY=replace-with-at-least-32-characters
PROVIDER_MODE=mock
```

Notes:

- `DATABASE_URL` is the development database. `TEST_DATABASE_URL` must point to a separate database used only for integration tests.
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

## Seed Local Dev Bootstrap Data

Create one reusable local dev user, workspace membership, and workspace sending config:

```bash
npm run db:seed:local
```

The seed is idempotent and prepares:

- user: `user_local_owner`
- workspace: `ws_local_demo`
- membership: `owner`
- workspace sending config for `ws_local_demo`

This seed is for local manual verification only. It does not try to model full demo data and it does not write `audit_logs`.

## Start API

```bash
npm run dev:api
```

API health endpoint:

```bash
curl http://127.0.0.1:3000/health
```

## Start Product Web App

```bash
npm run dev:web
```

Default local URL:

```bash
open http://127.0.0.1:5173
```

`apps/web` uses Vite dev proxy and forwards `/api` requests to `http://127.0.0.1:3000` by default.

Optional override when API runs on a different origin:

```bash
WEB_API_TARGET=http://127.0.0.1:3100 npm run dev:web
```

Product pages currently cover the minimum real loop:

- workspace sending config get/upsert
- contacts list/create/import/delete
- templates list/create/delete
- campaign create draft / queue
- campaign progress / send-jobs / recent-failures views

## `/app` Integration Tool Page

The old integration tool page is still available for backend debugging only:

```bash
open http://127.0.0.1:3000/app
```

It is not the product frontend and should not be expanded for product UX.

## Start Local Async Shim

```bash
npm run dev:async-shim
```

Local shim health endpoint:

```bash
curl http://127.0.0.1:3001/health
```

`apps/worker` is still a development shim, not a production deployment unit. It mirrors the future queue-consumer and cron-handler boundaries while using the real database facts layer.

Queue ingress boundary:

- stable queue message contract is `version + kind + sendJobId`
- queue messages are only processing hints, not database truth
- current local shim exposes a polling development entry
- future Vercel queue consumer should map one queue message to one `send_job` processing attempt

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
- email containing `retryable`: retryable failure -> `send_jobs.status = pending` with delayed `scheduled_at`
- email containing `nonretryable`: non-retryable failure -> `send_jobs.status = failed`
- email containing `unknown`: unknown failure -> follows the same retry scheduling policy as retryable, but still records `classification = unknown`

Additional processing edge behavior:

- repeating `processSendJob` on a job that is no longer claimable returns `NOT_FOUND` and does not create a second `delivery_attempt`
- consumer polling with no due `pending` jobs is a no-op and returns zero counts instead of throwing
- a `pending` job with `scheduled_at` in the future is intentionally invisible to consumer claim until it becomes due

The mock adapter still requires a stored workspace sending config because processing reads and decrypts the encrypted provider key before simulating the provider response.

## Retry Backoff Policy

Retry scheduling is defined centrally in `packages/domain` and currently uses:

- base delay: `5 minutes`
- growth rule: exponential backoff with multiplier `2`
- resulting sequence: `5m -> 10m -> 20m`, capped at `60m`
- `retryable`: requeue to `pending` with `scheduled_at` moved into the future
- `unknown`: same scheduling policy as `retryable`, but still treated as `unknown` classification in attempt history and processing results
- `non_retryable`: no requeue, immediate `failed`
- if the next failed attempt reaches `max_attempts`, the job becomes `failed` instead of being requeued

Boundary with recovery:

- `scheduled_at` answers "when may this pending job be claimed again"
- `locked_at` timeout recovery answers "what to do with a job stuck in processing"
- they are complementary mechanisms, not one merged mechanism

## Audit Coverage

Current Phase 1 audit coverage is intentionally focused on control-plane writes:

- `contact.create` / `contact.update` / `contact.remove` / `contact.import`
- `template.create` / `template.update` / `template.remove`
- `campaign.createDraft` / `campaign.queueCampaign` / `campaign.queueCampaign.failed`
- `workspace_sending_config.upsert`

Current processing strategy:

- processing / retry / recovery state transitions do not write extra `audit_logs`
- async truth remains `send_jobs` + `delivery_attempts`
- this avoids introducing a second audit-based truth for send outcomes

## Projection Queries

Current operator-facing campaign projections are intentionally read-only views derived from database truth:

- `GET /api/campaigns`
  - campaign list for current workspace
- `GET /api/campaigns/:campaignId/progress`
  - aggregated status counts from `send_jobs`
- `GET /api/campaigns/:campaignId/send-jobs`
  - current task list from `send_jobs`
- `GET /api/campaigns/:campaignId/recent-failures`
  - recent failed attempts from `delivery_attempts` joined with current `send_jobs` context

Boundary:

- these endpoints are projections only
- they do not define workflow state
- `campaigns`, `send_jobs`, and `delivery_attempts` remain the system truth

## Minimal Local Processing Flow

1. Start Postgres.
2. Run `npm run db:migrate`.
3. Run `npm run db:seed:local`.
4. Start `apps/api`.
5. Start `apps/web`.
6. Start `apps/worker` with `PROVIDER_MODE=mock`.
7. In `apps/web`, complete: workspace config -> contacts -> templates -> campaigns.
8. In `Campaigns` page, create draft and queue it.
9. Call `POST /internal/consume-once` on the local async shim.
10. Back in `Campaigns` page, refresh progress/send-jobs/recent-failures.

You can also validate the same flow with direct API calls:

11. Create a contact:

```bash
curl -X POST http://127.0.0.1:3000/api/contacts \
  -H 'content-type: application/json' \
  -H 'x-dev-user-id: user_local_owner' \
  -H 'x-dev-workspace-id: ws_local_demo' \
  -d '{
    "email":"alice@example.com",
    "name":"Alice Example"
  }'
```

12. Create a template:

```bash
curl -X POST http://127.0.0.1:3000/api/templates \
  -H 'content-type: application/json' \
  -H 'x-dev-user-id: user_local_owner' \
  -H 'x-dev-workspace-id: ws_local_demo' \
  -d '{
    "name":"Local Welcome",
    "subject":"Hello {{name}}",
    "bodyHtml":"<p>Hello {{name}}</p>"
  }'
```

13. Create a campaign draft using the returned `template.id`:

```bash
curl -X POST http://127.0.0.1:3000/api/campaigns/drafts \
  -H 'content-type: application/json' \
  -H 'x-dev-user-id: user_local_owner' \
  -H 'x-dev-workspace-id: ws_local_demo' \
  -d '{
    "templateId":"<template_id>",
    "name":"Local Processing Demo",
    "target":{"type":"all_contacts"}
  }'
```

14. Queue the campaign using the returned `campaign.id`:

```bash
curl -X POST http://127.0.0.1:3000/api/campaigns/<campaign_id>/queue \
  -H 'content-type: application/json' \
  -H 'x-dev-user-id: user_local_owner' \
  -H 'x-dev-workspace-id: ws_local_demo' \
  -d '{}'
```

15. Call `POST /internal/consume-once` on the local async shim.
16. Inspect `send_jobs`, `delivery_attempts`, and campaign progress.

Useful queries:

```bash
curl -H 'x-dev-user-id: user_local_owner' \
  -H 'x-dev-workspace-id: ws_local_demo' \
  http://127.0.0.1:3000/api/campaigns/<campaign_id>/progress
```

```bash
curl -H 'x-dev-user-id: user_local_owner' \
  -H 'x-dev-workspace-id: ws_local_demo' \
  http://127.0.0.1:3000/api/campaigns/<campaign_id>/send-jobs
```

```bash
curl -H 'x-dev-user-id: user_local_owner' \
  -H 'x-dev-workspace-id: ws_local_demo' \
  http://127.0.0.1:3000/api/campaigns/<campaign_id>/recent-failures
```

## Minimal Local `/app` Debug Flow

1. Start Postgres and run `npm run db:migrate`.
2. Run `npm run db:seed:local`.
3. Start API: `npm run dev:api`.
4. Start worker local async shim: `npm run dev:async-shim` (with `PROVIDER_MODE=mock`).
5. Open `http://127.0.0.1:3000/app` (debug tool only).
6. Confirm request context defaults:
   - `x-dev-user-id=user_local_owner`
   - `x-dev-workspace-id=ws_local_demo`
7. In the page, run the minimal loop:
   - load/upsert workspace sending config
   - create/import contacts
   - create a template
   - create campaign draft and queue it
   - open progress/send-jobs/recent-failures for that campaign
8. Trigger worker consumer poll:

```bash
curl -X POST http://127.0.0.1:3001/internal/consume-once \
  -H 'content-type: application/json' \
  -H 'x-smartsend-internal-dev: true' \
  -d '{"messageCount":1}'
```

9. Back in `/app`, refresh or enable polling on campaign progress to observe state changes.

## Minimal Local Retry Validation

1. Start Postgres, run `npm run db:migrate`, run `npm run db:seed:local`, then start `apps/api` and `apps/worker` with `PROVIDER_MODE=mock`.
2. Queue a campaign whose recipient email contains `retryable` or `unknown`.
3. Trigger one consumer poll:

```bash
curl -X POST http://127.0.0.1:3001/internal/consume-once \
  -H 'content-type: application/json' \
  -H 'x-smartsend-internal-dev: true' \
  -d '{"messageCount":1}'
```

4. Verify in PostgreSQL:

- `send_jobs.status = 'pending'`
- `send_jobs.scheduled_at > now()`
- `send_jobs.attempt_count` increased by `1`
- a `delivery_attempts` row was written with `status = 'failed'`
- if the recipient contains `unknown`, the attempt still follows the retry/backoff path but retains `error_code = 'MOCK_UNKNOWN'`

5. Trigger another immediate consumer poll and verify the same job is not claimed again before `scheduled_at`.

## Minimal Local Recovery Validation

1. Start Postgres, run `npm run db:migrate`, run `npm run db:seed:local`, then start `apps/api` and `apps/worker`.
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

## Prepare Test Database

Integration tests should run against `TEST_DATABASE_URL`, not the development `DATABASE_URL`.

From an empty local environment:

1. Start PostgreSQL:

```bash
docker compose up -d postgres
```

2. Set a dedicated test database URL:

```bash
export TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/smartsend_test
```

3. Reset and migrate the test database:

```bash
npm run db:test:prepare
```

Behavior:

- drops and recreates the database pointed to by `TEST_DATABASE_URL`
- refuses to run if `TEST_DATABASE_URL` uses the same database name as `DATABASE_URL`
- runs Drizzle migrations against the recreated test database

## Run Integration Tests

Run API integration tests against the dedicated test database:

```bash
npm run test:api:db
```

Run worker integration tests against the dedicated test database:

```bash
npm run test:worker:db
```

Run the full minimal baseline end-to-end:

```bash
npm run test:baseline:db
```

Do not run `test:api:db` and `test:worker:db` in parallel against the same `TEST_DATABASE_URL`. Both suites clear and reseed shared tables.

Run worker processing integration tests:

```bash
npm test --workspace @smartsend/local-async-shim
```

Run API tests:

```bash
npm test --workspace @smartsend/api
```

The direct workspace commands above still depend on `DATABASE_URL` and will skip if it is missing. Prefer the root `*:db` scripts so `TEST_DATABASE_URL` is wired consistently.

Worker tests now include retry backoff and cron recovery database scenarios, plus the internal manual routes.
Worker tests also cover mock `unknown` classification, duplicate `processSendJob` rejection, and no-op consumer polling when no due pending job exists.

## Failure Triage

If baseline execution fails, start here:

- verify Docker Postgres is running: `docker compose ps`
- verify the test database is reachable: `DATABASE_URL="$TEST_DATABASE_URL" npm run db:check`
- recreate the test database from scratch: `npm run db:test:prepare`
- inspect PostgreSQL container logs: `docker logs smartsend-postgres`
- list migrated tables in the test database:

```bash
docker exec -it smartsend-postgres psql -U postgres -d smartsend_test -c '\dt'
```

Use the actual database name from `TEST_DATABASE_URL` in the last command.

## Typecheck

```bash
npm run typecheck
```

## Notes

- Drizzle schema source of truth is `packages/db/src/schema/*`
- Drizzle migration output is `packages/db/drizzle/`
- production direction remains `Vercel Functions + Vercel Queues + Vercel Cron Jobs`
- queue producer logging exists, but real queue delivery remains a later work package
- retry backoff and cron recovery now exist as separate mechanisms for delayed retry and stuck-job compensation
- `npm run dev:worker` and `npm run start:worker` are kept as compatibility aliases and point to the local async shim
