---
title: SmartSend-v2 Testing Notes
status: draft
updated: 2026-04-14
---

# SmartSend-v2 第一阶段测试与验收清单

## 目标

这份文档不追求覆盖所有测试类型，只定义第一阶段必须存在的最小验证闭环，避免开发过程中把“看起来能跑”误当成“系统已正确”。

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
- Campaign 聚合状态按任务结果刷新
- cron 补偿能恢复超时卡住的 `processing` 任务

通过标准：

- 主链路能在测试数据库中完整跑通
- 中间失败不会留下无法解释的状态

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
