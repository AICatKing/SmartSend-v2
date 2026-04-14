---
title: ADR-002 Auth and Workspace Context
status: accepted
date: 2026-04-14
---

# ADR-002: 认证、会话与 workspace 上下文方案

## 状态

Accepted

## 背景

`SmartSend-v2` 不是单用户脚本，而是一个有工作区边界的 SaaS backend。第一阶段必须先回答：

- 用户如何登录
- API 如何识别当前用户
- API 如何识别当前 workspace
- `owner/admin/member` 的最小 RBAC 放在哪一层

如果这些问题不先定，后续 router、domain 和数据库设计会一起漂移。

## 决策

第一阶段采用：

- Auth library: `Better Auth`
- Session model: database-backed session
- Workspace context: 显式 `currentWorkspaceId`
- Authorization model: workspace-level `RBAC`
- Deployment assumption: `Vercel-first`

## 认证与上下文原则

### 1. 用户身份和 workspace 上下文分开

- `userId` 表示“是谁”
- `workspaceId` 表示“在哪个租户边界下操作”

不能把“用户已登录”误当成“用户有权访问任意 workspace”。

### 2. 所有业务资源默认属于某个 workspace

第一阶段的核心资源：

- `contacts`
- `templates`
- `campaigns`
- `send_jobs`
- `delivery_attempts`
- `audit_logs`

都必须在 workspace 边界内读取和写入。

### 3. 只做 workspace 级 RBAC

第一阶段只保留三个角色：

- `owner`
- `admin`
- `member`

不做资源级 ACL，不做细粒度策略引擎。

## API 上下文设计

`apps/api` 中的 request context 至少要包含：

- `session`
- `user`
- `currentWorkspaceId`
- `workspaceRole`

对于每个受保护接口：

1. 先验证 session
2. 再验证当前 workspace 是否存在
3. 再验证当前用户是否属于该 workspace
4. 最后做角色校验

## 路由约束

### authRouter

第一阶段最小接口：

- `getMe`
- `listMyWorkspaces`
- `switchWorkspace`

### workspaceRouter

第一阶段最小接口：

- `getById`
- `listMembers`

更改成员角色、邀请成员和工作区创建可以保留在后续小工作包中，不阻塞主链路。

## Domain 层约束

- router 只负责鉴权入口与参数整形
- domain 层仍要显式接收 `workspaceId`
- domain 层不接受“缺省 workspace”这种隐式行为

这样可以避免把租户隔离只做成 router 表层约束。

## 为什么选择 Better Auth

- 适合 TypeScript-first 项目
- 适合后续 monorepo 演进
- 比手写认证更稳妥，也比把认证外包到当前未选定的平台更可控

## Vercel 部署约束

由于项目目标是尽量全部贴合 Vercel，认证配置必须从第一阶段就兼容：

- production 自定义域名
- `*.vercel.app` preview 部署
- 本地开发地址

根据 Better Auth 官方文档，Vercel / preview 场景应使用动态 `baseURL.allowedHosts`，而不是只写死单一 `baseURL`。

第一阶段要求：

- 允许生产域名
- 允许 `*.vercel.app`
- 允许本地开发 host
- 明确协议在本地和生产的差异

建议方向：

- `allowedHosts` 包含生产域名、`*.vercel.app`、`localhost:*`
- 不使用过宽的任意 host 信任策略

这部分属于安全边界，不应等到部署阶段再修。

## Consequences

正面影响：

- 后续所有领域接口都可建立在稳定的 `user + workspace + role` 上下文之上
- 能较早建立多租户边界，而不是后补
- preview deployment 与 production deployment 可以共用同一套 auth 配置思路

负面影响：

- 初始化成本高于“先假装单用户再重构”
- 需要从第一天开始把测试和 seed 数据设计成 workspace-aware

## 第一阶段验收

- 未登录请求返回认证错误
- 已登录但不属于 workspace 的请求返回授权错误
- 普通成员不能跨 workspace 访问资源
- 所有核心领域接口都要求显式 workspace 上下文
- Better Auth 配置可同时兼容本地、preview 和 production host

## Review Trigger

只有在明确把产品重新降级为单用户工具时，才重新评估该决策。
