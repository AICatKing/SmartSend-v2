---
title: SmartSend-v2 Real DB Validation Log
status: draft
updated: 2026-04-15
---

# SmartSend-v2 真实数据库测试验证记录

## 记录时间

- 2026-04-15

## 环境前提

- Node.js `22.x`
- Docker Compose
- PostgreSQL container: `smartsend-postgres`
- 测试数据库：`postgres://postgres:postgres@127.0.0.1:5432/smartsend_validation`

## 实际执行命令

1. `docker compose up -d postgres`
2. `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/smartsend_validation npm run test:baseline:db`

## 实际结果

- `db:test:prepare`: 通过
- `test:api:db`: 通过，`10/10`
- `test:worker:db`: 通过，`12/12`

本轮执行确认：

- 可以从空测试库重建 schema
- API 集成测试可在真实 PostgreSQL 上执行
- worker 集成测试可在真实 PostgreSQL 上执行
- worker 测试已覆盖 processing、retry/backoff、recovery 场景

## 失败定位入口

- 先跑 `npm run db:test:prepare`，确认不是脏库或 migration 问题
- 再单独跑 `npm run test:api:db` 或 `npm run test:worker:db` 缩小范围
- 若 migration 命令没有落到目标测试库，优先检查环境变量是否显式传入，以及 `TEST_DATABASE_URL` 是否与 `DATABASE_URL` 分离
- 若 PostgreSQL 异常，检查 `docker logs smartsend-postgres`

## 已知限制

- workspace 级原生命令 `npm test --workspace @smartsend/api` 与 `npm test --workspace @smartsend/local-async-shim` 仍然直接读取 `DATABASE_URL`，未提供时会 skip；推荐优先使用根脚本
- `apps/api` 与 `apps/worker` 不应并行打到同一个测试数据库；两侧集成测试都采用全表清理策略，推荐使用 `test:baseline:db` 顺序执行
- 当前基线只覆盖本地开发环境，不包含 CI 平台集成
