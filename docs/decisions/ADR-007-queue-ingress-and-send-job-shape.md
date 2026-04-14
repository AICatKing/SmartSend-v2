---
title: ADR-007 Queue Ingress and Send Job Shape
status: accepted
date: 2026-04-14
---

# ADR-007: queue ingress 与 send_jobs 最小形态

## 状态

Accepted

## 决策

- `send_jobs` 是 queue ingress 的最小处理单元：一条任务对应一个收件人。
- `createDraft` 与 `queueCampaign` 必须拆开：
  - `createDraft` 只定义活动配置
  - `queueCampaign` 才执行目标解析、模板渲染与任务生成
- `queueCampaign` 本轮只做事实写入，不做真实消息发布与发送。

## 为什么这样定

- 发送链路的真实边界是“每个收件人的独立任务状态”，不是页面层批处理状态。
- 拆分 `draft -> queued` 可以防止“配置未冻结就开始入队”。
- 提前固化 `renderedSubject/renderedBody`，可以避免后续模板或联系人变更导致发送结果漂移。

## 第一阶段必须字段

`send_jobs` 第一阶段保留：

- 任务身份：`id/workspaceId/campaignId/contactId`
- 收件人与渲染快照：`recipientEmail/recipientName/renderedSubject/renderedBody`
- 状态与调度：`status/attemptCount/maxAttempts/scheduledAt/lockedAt/lockedBy/processedAt`
- 错误与 provider 追踪：`lastErrorCode/lastErrorMessage/provider/providerMessageId`
- 时间：`createdAt/updatedAt`

## 先不做

- 真实消息发布（Vercel Queues producer）
- consumer 消费逻辑
- delivery_attempts 写入
- retry/backoff 与 cron recovery
