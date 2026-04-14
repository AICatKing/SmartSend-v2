---
title: ADR-003 Worker Runtime Model
status: accepted
date: 2026-04-14
---

# ADR-003: Vercel-first 后台执行模型与本地开发方式

## 状态

Accepted

## 背景

`SmartSend-v2` 的核心价值之一，是把“页面驱动发送”改成“后端异步任务系统”。

项目当前新增约束是：

> 后期部署尽量全部贴合 Vercel。

这意味着第一阶段不能继续把“同仓独立常驻 worker 进程”作为正式运行模型，因为 Vercel 的主模型是函数式执行，而不是长期常驻 daemon。

截至 2026-04-14，Vercel 官方能力边界可概括为：

- `Vercel Queues`：用于异步消费与 durable event streaming，当前为 Beta
- `Vercel Cron Jobs`：用于定时触发函数，不自动重试
- `waitUntil()` / `after()`：适合响应后短任务，但仍受函数时长约束

因此，这份 ADR 需要从“常驻 worker”改成“Vercel-first 后台执行模型”。

## 决策

第一阶段采用：

- deployment model: `Vercel-first`
- request handling: `Vercel Functions`
- async execution: `Vercel Queues`
- scheduled maintenance: `Vercel Cron Jobs`
- truth layer: `PostgreSQL`
- local dev model: 本地函数式 handler + 本地 Postgres 模拟生产流程

## 为什么这样选

### 1. 保持部署模型和目标平台一致

`api` 负责：

- 接受请求
- 创建 `campaign`
- 生成 `send_jobs`
- 查询进度、统计和审计

异步后台执行不再定义为“常驻 worker 进程”，而定义为两类入口：

- queue consumer：处理发送任务
- cron-triggered function：处理补偿、锁恢复与状态 reconciliation

这样可以从第一阶段起就沿着最终部署环境建设。

### 2. 保持异步执行与事实层分离

`Vercel Queues` 承载“该做什么异步工作”。

`PostgreSQL` 仍然承载系统事实：

- `campaigns`
- `send_jobs`
- `delivery_attempts`
- `audit_logs`

队列不是主真相来源，只是执行触发器。

### 3. 不把 `waitUntil()` 当主 worker

`waitUntil()` 或 `after()` 只用于响应后短任务，例如：

- 非关键通知
- cache 更新
- 次要审计补写

它们不应用来承载核心发送链路，因为仍受函数时长上限约束。

## 运行模型

### 主发送链路

1. 用户通过 API 创建 `campaign`
2. API 生成 `send_jobs`
3. API 将异步消息发布到 `Vercel Queues`
4. queue consumer 处理消息
5. consumer 调用 provider
6. 结果写回 `delivery_attempts` 与 `send_jobs`
7. 必要时刷新 `campaign` 聚合状态

### 定时补偿链路

`Vercel Cron Jobs` 负责：

- 扫描超时未恢复的 `processing` 任务
- 重算 `campaign` 聚合状态
- 扫描需要补偿的异常状态

注意：

- Cron 不自动重试
- Cron 可能发生重入
- Cron 事件必须按幂等方式设计

## 队列与消费策略

`send_jobs` 至少需要以下字段：

- `status`
- `scheduled_at`
- `locked_at`
- `locked_by`
- `attempt_count`
- `max_attempts`

即使生产改为 `Vercel Queues`，数据库仍要保留这些状态字段，因为：

- 队列消息不等于数据库事实
- consumer 仍可能重复投递或重试
- 需要依赖数据库状态避免重复发送

消费规则：

1. consumer 收到消息后先读取 `send_job`
2. 若任务已终态，则直接跳过
3. 若任务允许处理，则以原子方式转为 `processing`
4. 处理完成后进入 `sent` / `failed` / `pending`

## 锁恢复与补偿

为了应对函数超时、consumer 失败或消息重复投递，第一阶段定义：

- 若任务处于 `processing` 且 `locked_at` 超过阈值，则允许恢复
- 恢复行为由 `Cron Job` 触发的补偿函数执行
- 恢复时不能直接标记 `sent`，只能重新回到 `pending` 或进入 `failed`
- 补偿逻辑不允许假定 provider 一定已经成功处理过该请求

## 本地开发方式

本地最小开发环境：

- `postgres`
- `apps/api`
- 一个用于模拟 queue consumer 的本地 handler

推荐命令模型：

- 一个命令启动数据库
- 一个命令启动 API
- 一个命令执行本地 consumer / cron 模拟

本地开发不要求真实连接 Vercel Queues，但代码结构要与生产保持一致：

- producer 代码放在可替换的 queue adapter 中
- consumer 以函数入口形式存在
- cron 补偿逻辑以单独 handler 或任务函数存在

## 可观测性要求

第一阶段后台链路至少记录：

- queue publish 成功 / 失败
- consumer 收到消息
- `send_job` 占用成功 / 跳过 / 恢复
- provider 调用结果
- 重试调度结果
- cron 补偿执行结果
- 任务最终状态

日志先以结构化应用日志为主，不提前引入复杂 tracing 系统。

## Consequences

正面影响：

- 部署模型与目标平台一致
- 不需要额外维护独立常驻 worker 平台
- 仍能保留清晰的 API / async consumer / cron 补偿边界

负面影响：

- `Vercel Queues` 截至 2026-04-14 仍为 Beta，存在平台演进风险
- 必须更认真处理函数超时、重复投递、cron 重入与幂等
- 本地开发和生产环境的运行方式不完全同构

## 第一阶段验收

- API 可以发布 queue 消息
- queue consumer 可以独立处理发送任务
- cron 补偿可以恢复超时卡住的任务
- 主发送链路不依赖浏览器页面存活
- 非关键后台动作才使用 `waitUntil()` / `after()`

## Review Trigger

当出现以下任一情况时，重新评估该决策：

- `Vercel Queues` 的 Beta 状态或产品边界不再满足需求
- 发送吞吐量明显超出函数式消费模型的成本或可靠性边界
- 需要迁移为独立 worker 平台或 Workflow-first 模型
