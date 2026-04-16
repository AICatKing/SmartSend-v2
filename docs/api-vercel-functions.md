---
title: SmartSend API Vercel Functions
status: draft
updated: 2026-04-16
---

# `apps/api` 部署到 Vercel Functions

## 当前方案

项目保留现有 Fastify 业务逻辑不变，在 `apps/api` 自身目录内提供 Vercel Function 包装层：

- Vercel 入口：`apps/api/api/[...route].ts`
- Fastify app 工厂：`apps/api/src/app.ts`
- Request 桥接：`apps/api/src/vercel-handler.ts`

这样 Vercel 上的 `/api/*` 请求会进入同一套 Fastify routes，而本地开发仍可继续使用 `npm run dev:api`。

## 建议部署方式

建议把 API 作为单独的 Vercel Project 部署，并把 Root Directory 直接设为：

- `apps/api`

推荐：

- 前端项目使用仓库根目录：`vercel.json`
- API 项目使用：`apps/api/vercel.json`

原因：

- 仓库根目录 `vercel.json` 明确用于前端 SPA 构建
- API 项目如果也指向仓库根目录，容易误用前端 `buildCommand` 和 `outputDirectory`
- 将 API Root Directory 固定为 `apps/api` 后，构建和路由边界更清晰

## 路由说明

- `GET /api/...` 和 `POST /api/...` 等请求进入 Vercel Function
- `GET /health` 在 `apps/api/vercel.json` 中被转发到 `/api/health`

## 必需环境变量

部署到 API 项目时，需要配置 API 运行时变量：

- `AUTH_MODE=supabase`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `DATABASE_URL`
- `API_ENCRYPTION_KEY`

按当前业务还建议保留：

- `LOG_LEVEL`

## 当前限制

- 发送异步 worker 仍不是 Vercel 生产单元
- `apps/worker` 仍需要后续改造成真实 Vercel Queues / Cron
- 目前可上线范围是：前端静态站点 + Fastify API 的 Vercel Function 化
