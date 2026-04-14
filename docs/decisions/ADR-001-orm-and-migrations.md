---
title: ADR-001 ORM and Migrations
status: accepted
date: 2026-04-14
---

# ADR-001: ORM 与 migration 方案

## 状态

Accepted

## 背景

`SmartSend-v2` 的第一阶段要优先稳定以下能力：

- PostgreSQL 作为系统事实层
- 清晰的 schema 与 migration 路径
- 对 `campaigns`、`send_jobs`、`delivery_attempts` 这类状态型表有足够强的建模能力
- 后续能支撑事务、锁定、重试与审计

当前不再保留 “Prisma 或 Drizzle” 的开放选项，需要先定案，避免脚手架、schema 和查询层反复返工。

## 决策

第一阶段采用：

- ORM / schema toolkit: `Drizzle ORM`
- Database: `PostgreSQL`
- Migration: `drizzle-kit` 生成与管理
- Schema source of truth: `packages/db/src/schema/*`

## 选择理由

### 1. 这个项目不是纯 CRUD

`SmartSend-v2` 的核心难点不在“快速生成 CRUD”，而在：

- 队列任务拉取
- 原子状态更新
- worker 锁定
- 重试调度
- 统计与审计查询

这些能力更接近“需要明确 SQL 边界”的后端系统。`Drizzle` 更适合把 SQL 能力和 TypeScript 类型系统放在一起使用，而不是把复杂部分频繁降级到 raw SQL 黑盒。

### 2. schema 更接近数据库本体

`Drizzle` 的 schema 定义更接近 SQL 结构本身，便于明确：

- 唯一约束
- 索引
- 枚举
- 外键
- 默认值
- 软删字段

这和 `SmartSend-v2` 以数据库为 truth layer 的方向一致。

### 3. 更适合队列与状态机系统

后续 `send_jobs` 需要处理：

- `pending -> processing -> sent|failed|cancelled`
- 锁定超时恢复
- 批量拉取待处理任务
- 失败重试

这些都要求数据库访问层保持显式和可控。`Drizzle` 在这类系统上更稳妥。

## 结果约束

### Schema 组织

第一阶段按领域分文件，但只保留一套 schema 真相：

- `packages/db/src/schema/users.ts`
- `packages/db/src/schema/workspaces.ts`
- `packages/db/src/schema/contacts.ts`
- `packages/db/src/schema/templates.ts`
- `packages/db/src/schema/campaigns.ts`
- `packages/db/src/schema/send-jobs.ts`
- `packages/db/src/schema/delivery-attempts.ts`
- `packages/db/src/schema/audit-logs.ts`
- `packages/db/src/schema/index.ts`

### Migration 组织

- migration 统一放在 `packages/db/drizzle/`
- 所有 schema 变更必须通过 migration 落地
- 不允许手改数据库后再补写 schema

### 查询边界

- 普通 CRUD 与常规读写优先使用 `Drizzle`
- 必须依赖数据库特性的复杂查询可以使用显式 SQL
- 如果使用显式 SQL，仍要放在 `packages/db` 或 `packages/domain` 的受控边界内，不直接散落在 router

## 不选择 Prisma 的原因

- 对复杂队列和锁定逻辑，后期更容易出现 “主路径 ORM，关键路径 raw SQL” 的双轨维护
- schema 和数据库本体之间会多一层抽象感，不利于把数据库作为第一真相层来思考
- 当前项目的重点不是尽快做完页面 CRUD，而是把系统状态边界讲清楚

## Consequences

正面影响：

- schema、索引、状态枚举和约束会更显式
- 更适合 worker、队列和事务型 use case
- 后续复杂查询不容易脱离主建模体系

负面影响：

- 上手成本会略高于“脚手架驱动”的 ORM 体验
- 团队需要更接受 SQL-first 的思维方式

## 第一阶段落地要求

- 初始化 `packages/db`
- 接入 `drizzle-orm` 和 `drizzle-kit`
- 配好本地开发数据库连接
- 先落第一批核心表，不做多余抽象层

## Review Trigger

只有在出现以下情况时，才重新评估该决策：

- `Drizzle` 无法稳定承载当前事务与迁移需求
- 团队明确转向“快速应用原型优先”而非“状态系统优先”
