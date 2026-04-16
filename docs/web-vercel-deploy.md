---
title: SmartSend Web Vercel Deploy
status: draft
updated: 2026-04-16
---

# `apps/web` 部署到 Vercel

## 目标

本说明只覆盖 `apps/web` 的单独部署。

当前阶段：

- `apps/web` 可部署到 Vercel
- `apps/api` 与 `apps/worker` 还不是 Vercel 生产单元
- Web 需要通过环境变量指向一个可访问的 API 基地址

## Vercel 项目设置

在 Vercel 新建一个 Project，并把 Root Directory 设为仓库根目录：

`/Users/hugh/code/personal/SmartSend-v2`

说明：

- 当前仓库是 monorepo
- `apps/web` 依赖根目录配置和 `packages/contracts`
- 因此不要把 Root Directory 直接设为 `apps/web`

## 必填环境变量

在 Vercel Project 中配置：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`

示例：

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
VITE_API_BASE_URL=https://your-api-host.example.com
```

说明：

- `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 用于浏览器端 Supabase Auth
- `VITE_SUPABASE_URL` 必须是 `https://<project-ref>.supabase.co`，不能填你的前端站点地址，例如 `http://127.0.0.1:5173`
- `VITE_API_BASE_URL` 用于让前端请求真正的后端 API
- 如果不提供 `VITE_API_BASE_URL`，前端会默认请求当前 origin 下的 `/api/*`
- 在当前阶段，Vercel 上的 `apps/web` 项目本身并不提供这些 `/api/*` 路由

## 路由配置

仓库根目录 `vercel.json` 已添加 SPA rewrite，并指定：

- 所有前端路由会回退到 `index.html`
- `BrowserRouter` 深链接可直接打开
- 构建命令使用 `npm run build:web`
- 输出目录使用 `apps/web/dist`

## Supabase 配置

建议在 Supabase Dashboard 的 Auth URL 配置里加入你的前端域名：

- 本地开发地址
- Vercel preview 地址
- Vercel production 地址

虽然当前登录流使用邮箱 OTP，而不是 magic link 页面跳转，但仍建议把站点 URL 配置完整，避免后续行为不一致。

## 当前限制

- `apps/api` 仍是自托管 Fastify 进程，不是 Vercel Function
- `apps/worker` 仍是本地 async shim，不是 Vercel Queues / Cron 生产单元
- 因此当前“可上线版本”是：Vercel 托管前端，API 仍部署在其他可访问环境
