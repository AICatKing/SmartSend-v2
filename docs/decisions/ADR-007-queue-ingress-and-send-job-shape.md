---
title: ADR-007 Queue Ingress and Send Job Shape
status: accepted
date: 2026-04-14
---

# ADR-007: queue ingress 与 send_jobs 最小形态

## 状态

Accepted

## 背景

Phase 6 之后，项目已经具备：

- `campaign.queueCampaign` 写入 `send_jobs`
- worker processing
- retry / backoff
- cron recovery
- 本地 async shim

但真实 queue ingress 仍未接入。此时最容易出现的问题不是“没有线上队列”，而是：

- producer 和 consumer 各自隐含一套消息假设
- 本地 shim 的轮询入口与未来 Vercel queue push 入口边界不一致
- queue message 如果过早承载过多 domain 细节，后续会频繁破坏 contract

因此这份 ADR 的目标是先固定 ingress contract 和职责边界，让未来真实接入只替换 adapter，而不反复改 worker 主逻辑。

## 决策

- `send_jobs` 是 queue ingress 的最小处理单元：一条任务对应一个收件人。
- `createDraft` 与 `queueCampaign` 必须拆开：
  - `createDraft` 只定义活动配置
  - `queueCampaign` 才执行目标解析、模板渲染与任务生成
- `queueCampaign` 本轮只做事实写入，不做真实消息发布与发送。
- queue message 使用稳定最小 contract：

```ts
{
  version: 1,
  kind: "send_job.process",
  sendJobId: string
}
```

- queue message 只表达“请尝试处理这个 `send_job`”，不表达处理结果，也不替代数据库事实。
- consumer 必须始终回到数据库，根据 `sendJobId` 判断该任务是否仍可 claim / process。
- 本地 shim 当前保留 polling dev 入口，但未来真实 Vercel queue consumer 应直接走“单消息 -> 单 send_job”处理入口。

## 为什么这样定

- 发送链路的真实边界是“每个收件人的独立任务状态”，不是页面层批处理状态。
- 拆分 `draft -> queued` 可以防止“配置未冻结就开始入队”。
- 提前固化 `renderedSubject/renderedBody`，可以避免后续模板或联系人变更导致发送结果漂移。
- 只传 `sendJobId`，可以避免把 `recipientEmail`、渲染内容、attempt 计数、锁状态等内部细节直接泄漏到队列层。
- `version + kind + sendJobId` 足够稳定，也为后续消息演进保留空间。

## 第一阶段必须字段

`send_jobs` 第一阶段保留：

- 任务身份：`id/workspaceId/campaignId/contactId`
- 收件人与渲染快照：`recipientEmail/recipientName/renderedSubject/renderedBody`
- 状态与调度：`status/attemptCount/maxAttempts/scheduledAt/lockedAt/lockedBy/processedAt`
- 错误与 provider 追踪：`lastErrorCode/lastErrorMessage/provider/providerMessageId`
- 时间：`createdAt/updatedAt`

## Queue Contract 边界

### 稳定 contract 字段

- `version`
  - 用于消息 shape 演进，不等于业务状态版本
- `kind`
  - 用于区分未来可能出现的其他 async message 类型
- `sendJobId`
  - 唯一的业务定位字段

### 不应泄漏到 queue message 的内容

以下内容都属于数据库 truth 或运行时实现细节，不应作为第一阶段 queue contract 的稳定字段：

- `status`
- `attemptCount`
- `maxAttempts`
- `scheduledAt`
- `lockedAt`
- `lockedBy`
- `processedAt`
- `lastErrorCode`
- `lastErrorMessage`
- `providerMessageId`
- `recipientEmail`
- `recipientName`
- `renderedSubject`
- `renderedBody`
- workspace secret / sending config 信息

原因：

- 这些字段都可能在消息发出后被数据库中的后续状态变化覆盖
- 把它们塞进消息层会制造“双真相”
- consumer 若信任消息快照而不是数据库，将更容易产生重复发送和状态机漂移

## Producer / Consumer 职责边界

### Producer 负责

- 在 `send_jobs` 已经成功写入后，发布一个或多个稳定 queue message
- 确保消息只引用 `sendJobId`
- 记录 publish 成功 / 失败的结构化日志

### Producer 不负责

- claim 任务
- 推断任务是否仍可发送
- 在消息中携带运行时状态快照

### Consumer 负责

- 接收 queue message
- 根据 `sendJobId` 回到数据库判断任务是否仍可 claim
- 继续沿用既有 `claim -> processing -> sent/failed/pending` 主逻辑
- 对已终态、未到 `scheduledAt`、已被其他 worker 占用的任务安全 skip

### Consumer 不负责

- 把 queue message 当作事实层
- 绕过数据库直接驱动发送
- 依赖消息里的 attempt / lock / rendered content 快照

## 本地 Shim 与未来 Vercel Queue 的兼容关系

### 当前本地 shim

- 通过 `/internal/consume-once` 手动触发一次 polling cycle
- 适合本地开发中“从数据库里拉取 due job”验证处理链路
- 不是生产 queue ingress 的精确模拟

### 未来 Vercel queue consumer

- 每条消息进入一次 handler
- handler 读取 `sendJobQueueMessage`
- handler 再根据 `sendJobId` 回数据库 claim / process

### 兼容关系

- 两者最终都落到同一套数据库 claim / process 语义
- 本地 shim 保留“开发便捷入口”
- 未来真实 queue consumer 使用“稳定消息入口”
- 因此后续真实接入应主要替换 producer adapter 和 Vercel queue handler 外壳，而不是重写 domain / processing 主逻辑

## 先不做

- 真实消息发布（Vercel Queues producer）
- 真实 Vercel queue SDK 集成
- provider 多队列 / 多优先级设计
- queue-level dead-letter / replay 机制

注意：

- `delivery_attempts`、retry/backoff、cron recovery 已在数据库事实层与 worker 主链路中存在
- 本 ADR 当前要固定的是 ingress contract，而不是重新设计这些能力
