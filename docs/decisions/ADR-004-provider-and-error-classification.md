---
title: ADR-004 Provider and Error Classification
status: accepted
date: 2026-04-14
---

# ADR-004: 第一阶段邮件 provider 与错误分类

## 状态

Accepted

## 背景

`SmartSend-v2` 的 worker 必须明确知道：

- 第一阶段到底对接哪一家 provider
- 调用失败后是否重试
- 哪些错误进入终态失败
- 如何记录 provider 返回的信息用于排障

如果这些问题不先固定，`delivery_attempts`、worker 重试逻辑和配置模型都会变得不稳定。

## 决策

第一阶段采用：

- primary provider: `Resend`
- provider strategy: 单 provider 适配层
- error model: `retryable` / `non_retryable` / `unknown`

## 为什么先只做 Resend

- 当前 `SmartSend` 的产品语义已经建立在邮件发送场景上
- 原项目已显式围绕 Resend 展开过实现
- 第一阶段重点是系统正确性，不是 provider 抽象能力

第一阶段不追求：

- 多 provider fallback
- 自动 provider 切换
- provider-specific feature matrix

## 错误分类规则

### Retryable

满足以下情况时，允许重试：

- 网络超时
- 临时网络异常
- provider 限流
- 暂时性服务不可用

处理策略：

- 记录一次 `delivery_attempt`
- `attempt_count + 1`
- 按退避策略重设 `scheduled_at`
- `send_job` 回到 `pending`

### Non-retryable

满足以下情况时，直接进入终态失败：

- 收件地址非法
- 发件配置错误
- 凭证无效
- 权限不足
- 模板渲染得到非法发送输入

处理策略：

- 记录一次 `delivery_attempt`
- `send_job` 进入 `failed`
- 更新 `last_error_code` 和 `last_error_message`

### Unknown

无法明确归类时：

- 先记录完整上下文
- 视为 retryable，但只在上限内重试
- 若连续达到上限则进入 `failed`

## provider message 记录

以下字段必须进入 `delivery_attempts`：

- `provider`
- `provider_message_id`
- `status`
- `error_code`
- `error_message`
- `requested_at`
- `completed_at`

`send_jobs` 也可保留最后一次的 `provider_message_id` 与错误摘要，但它不是尝试历史的替代品。

## 配置模型

第一阶段只支持 workspace 级发件配置：

- `provider`
- `from_email`
- `from_name`
- `reply_to_email`
- `encrypted_api_key`

规则：

- API key 只允许后端读取
- 不允许返回给前端
- 配置变更必须写 `audit_logs`

## Consequences

正面影响：

- worker 的失败处理会更可预测
- `delivery_attempts` 字段设计更稳定
- 不会在第一阶段被多 provider 抽象分散精力

负面影响：

- 第一阶段没有 provider 级高可用
- 后续新增 provider 时需要显式扩展 adapter 和错误映射

## 第一阶段验收

- 可恢复错误会重试
- 不可恢复错误会直接失败
- 每次发送尝试都会留下可查询记录
- 能根据 `provider_message_id` 辅助排障

## Review Trigger

只有在明确要做多 provider 商业能力时，才重开此 ADR。
