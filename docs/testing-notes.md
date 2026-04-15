---
title: SmartSend-v2 Testing Notes
status: draft
updated: 2026-04-14
---

# SmartSend-v2 第一阶段测试与验收清单

## 目标

这份文档不追求覆盖所有测试类型，只定义第一阶段必须存在的最小验证闭环，避免开发过程中把“看起来能跑”误当成“系统已正确”。

## 当前真实数据库测试基线

当前仓库约定：

- `DATABASE_URL` 用于本地开发数据库
- `TEST_DATABASE_URL` 用于本地测试数据库
- 两者必须指向不同数据库名，避免测试清理误伤开发数据

当前最小基线命令：

1. `docker compose up -d postgres`
2. `npm run db:test:prepare`
3. `npm run test:api:db`
4. `npm run test:worker:db`

或者直接执行：

1. `docker compose up -d postgres`
2. `npm run test:baseline:db`

当前基线脚本行为：

- `db:test:prepare` 会重建 `TEST_DATABASE_URL` 指向的数据库并执行 migration
- `test:api:db` 与 `test:worker:db` 会把 `TEST_DATABASE_URL` 注入为测试进程的 `DATABASE_URL`
- workspace 级原生命令仍可直接运行，但若未显式提供 `DATABASE_URL` 仍会 skip
- `apps/api` 与 `apps/worker` 当前不应并行打到同一个测试库，因为两侧测试都采用全表清理策略

## 共享测试 Helper

共享 helper 当前位于：

- `packages/db/src/testing.ts`

当前已收敛的最小公共部分：

- `resetIntegrationTestDatabase`
- `seedWorkspaceMembershipFixture`
- `insertTemplateFixture`
- `insertContactFixture`
- `insertCampaignFixture`
- `insertSendJobFixture`
- `insertWorkspaceSendingConfigFixture`

推荐用法：

- 在 API / worker / future cron 的真实数据库测试里，优先复用这些 helper 做 cleanup 和稳定重复出现的数据准备
- helper 应只负责“把明确的数据插进去”，不要在 helper 内隐藏复杂业务流程
- 测试文件里仍应保留场景本身的可读性，例如一个 campaign 需要哪些 contact、哪个 send_job 处于什么状态，应直接在测试里写清楚

适用边界：

- 这些 helper 服务当前 PostgreSQL integration tests
- 它们不是新的测试框架，也不是通用 factory system
- 如果某类 seed 模式还只出现一两次，不应急着继续抽象

## 第一阶段必须验证的系统不变量

- 同一个 `send_job` 任一时刻只能有一个活跃处理流程
- `campaign` 不能绕过建任务直接进入完成态
- `send_job` 只能沿合法状态机流转
- 关键写操作必须写 `audit_logs`
- queue consumer / cron 重入不能导致重复发送
- 统计查询是 projection，不反向定义 truth layer

## 最小测试层次

### 1. Schema / migration checks

必须验证：

- 数据库 schema 可创建
- migration 可顺序执行
- 新环境可以从零初始化数据库

通过标准：

- 本地空数据库能完整跑完 migration
- migration 后关键表、索引、约束存在
- 对当前仓库，至少应能通过 `npm run db:test:prepare` 从空测试库完成重建

### 2. Contract tests

必须覆盖：

- `auth.getMe`
- `auth.listMyWorkspaces`
- `contact.create`
- `contact.list`
- `template.create`
- `campaign.createDraft`
- `campaign.queueCampaign`
- `campaign.getProgress`

通过标准：

- 输入校验错误与权限错误可区分
- 输出结构与约定 contract 一致

### 3. Domain / integration tests

必须覆盖：

- 创建 `campaign` 并批量生成 `send_jobs`
- queue publish 成功后可触发异步处理
- consumer 处理并占用待处理任务
- 成功发送后写入 `delivery_attempts`
- 可重试错误进入重新调度
- 不可重试错误进入终态失败
- `unknown` provider 分类按“可重试但受上限约束”处理
- 同一 `send_job` 重复 `process` 调用不会重复发送
- 无可 claim 的 `pending` job 时 consumer poll 是显式 no-op
- Campaign 聚合状态按任务结果刷新
- cron 补偿能恢复超时卡住的 `processing` 任务

通过标准：

- 主链路能在测试数据库中完整跑通
- 中间失败不会留下无法解释的状态
- `apps/api` 与 `apps/worker` 两侧测试都能在同一个独立测试库上重复执行

### 4. Authorization tests

必须覆盖：

- 未登录用户不能访问受保护资源
- 不属于 workspace 的用户不能读取该 workspace 资源
- `member` 不能执行仅 `owner/admin` 允许的操作
- preview / production host 下 Better Auth 配置不会错误拒绝合法域名

### 5. Audit tests

必须覆盖：

- Contact 创建 / 更新 / 删除
- Template 创建 / 更新 / 删除
- Campaign 创建 / 启动 / 暂停 / 取消
- 发件配置修改

通过标准：

- `audit_logs` 至少记录 `workspaceId`、`actorUserId`、`action`、`targetType`、`targetId`

## 推荐的测试顺序

1. schema/migration
2. auth/workspace authorization
3. contact/template CRUD
4. campaign draft/queue
5. queue consumer send flow
6. audit/stats queries

## 每个工作包结束后的最低检查

- `typecheck`
- 与本工作包相关的测试
- 一轮结构化 review

结构化 review 至少回答：

- 有没有把 projection 当 truth
- 有没有破坏状态机
- 有没有越过 workspace 边界
- 有没有遗漏审计
- 有没有引入重复发送风险
- 有没有把 `waitUntil()` 误当成核心 worker

## 暂不强制的内容

第一阶段不强制：

- E2E 浏览器测试
- 性能压测
- tracing / metrics 完整体系
- 多 provider 回归矩阵
- Vercel Queues Beta 的平台级回退策略

这些可以在主链路稳定后再补。
