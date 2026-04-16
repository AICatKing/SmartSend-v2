---
title: SmartSend-v2 Go-Live Plan
status: draft
updated: 2026-04-16
---

# SmartSend-v2 上线开发计划

## 结论

基于当前代码、文档和本地验证结果，`SmartSend-v2` 已经具备“本地最小业务闭环”，但还未达到“可公开上线部署”的状态。

当前已具备：

- `apps/web` 可生产构建，`npm run build:web` 通过
- API / worker 真实 PostgreSQL 集成测试可跑通，本地验证通过
- 已有最小业务链路：登录、工作区、联系人、模板、活动 draft / queue、发送处理、进度查询

当前距离“可上线部署”仍有若干硬门槛，核心集中在：

- 生产认证
- 真实异步执行
- 部署与 CI 闭环
- 可观测性与邮件合规

## 关键判断

- README 已明确声明“真实 Vercel Queues 生产集成”仍是延期项：[README.md](/Users/hugh/code/personal/SmartSend-v2/README.md#L15)
- `apps/worker` 当前仍是 development shim，不是生产部署单元：[README.md](/Users/hugh/code/personal/SmartSend-v2/README.md#L168)
- 当前登录模型实质上是“输入邮箱即可创建/登录用户”，还不是生产级认证：[auth.ts](/Users/hugh/code/personal/SmartSend-v2/apps/api/src/routes/auth.ts#L36)
- 当前 queue producer 只记录日志，没有真实消息投递：[producer.ts](/Users/hugh/code/personal/SmartSend-v2/apps/worker/src/queue/producer.ts#L18)
- `queueCampaign` 只写数据库，没有接真实异步入口：[campaigns.ts](/Users/hugh/code/personal/SmartSend-v2/apps/api/src/routes/campaigns.ts#L44)
- 当前测试验证文档明确说明：只覆盖本地开发环境，尚未接入 CI：[testing-validation-log.md](/Users/hugh/code/personal/SmartSend-v2/docs/testing-validation-log.md#L45)
- 根 `typecheck` 当前仍失败，阻塞上线前的构建门禁：[app.integration.test.ts](/Users/hugh/code/personal/SmartSend-v2/apps/api/src/app.integration.test.ts#L1065)

## P0

### P0-1. 生产认证落地

目标：

- 替换当前“邮箱即登录”的方案
- 落地真正可公开使用的认证方式
- 完成 preview / production 域名、cookie、安全配置收口

建议范围：

- 选定并实现真正的 Better Auth / magic link / OAuth 方案之一
- 明确 session cookie 的域名、secure、过期策略
- 覆盖 preview / production host 的认证联调

验收标准：

- 陌生用户不能仅凭任意邮箱直接登录
- preview / production 域名下认证链路正常
- 登录、登出、获取当前用户、切换 workspace 全链路可用

### P0-2. 真实异步执行落地

目标：

- 让 `queueCampaign` 之后的发送链路自动运行
- 去掉对本地手动 `/internal/consume-once` 的依赖

建议范围：

- 如果坚持 `Vercel-first`，补齐真实 `Vercel Queues + Cron` producer / consumer / recovery handler
- 如果目标是尽快上线，优先考虑“Node API + 常驻 worker”作为第一版生产部署模型，避免被 `Vercel Queues` Beta 卡住

验收标准：

- `queueCampaign` 之后任务可自动进入异步发送
- retry / recovery 在线上运行模型中可触发
- 不依赖开发用 shim 接口

### P0-3. 部署闭环

目标：

- 从仓库状态收口到“新环境可独立部署”

建议范围：

- 选定正式部署平台
- 补齐部署配置、环境变量文档、数据库迁移流程、启动命令、健康检查
- 形成一份上线 runbook

当前缺口：

- 仓库内暂无现成 `vercel.json`
- 暂无 CI workflow
- 暂无正式部署说明或自动化发布配置

验收标准：

- 新环境可从 0 完成部署
- 数据库迁移路径清晰可重复
- API / Web / async runtime 的启动与检查方式明确

### P0-4. 代码门禁修正

目标：

- 建立最低限度的上线质量门槛

建议范围：

- 修复根 `typecheck` 当前错误
- 建立统一门禁：`typecheck`、`build`、`test:baseline:db`

验收标准：

- 主分支在标准环境下可稳定通过全部门禁
- 不再出现“功能可用但类型检查失败”的状态

### P0-5. 生产可观测性

目标：

- 让线上问题可定位、可追踪、可告警

建议范围：

- 落地结构化日志采集
- 关键失败链路告警
- 为登录、queue publish、consumer、provider、recovery 建立最小观测点

验收标准：

- 线上故障可通过日志快速缩小范围
- 关键异步链路失败可被动发现，而不是依赖人工碰运气

## P1

### P1-1. 邮件合规与可投递性

目标：

- 补齐真实外发邮件所需的基础合规能力

建议范围：

- 退订能力
- 抑制名单
- 基础反滥发约束
- 发信域名配置检查与提示

说明：

- 如果产品面向真实外部联系人发送邮件，这一项非常重要，但可以排在主链路上线之后

### P1-2. 送达状态回流

目标：

- 让“发送成功”不只停留在 provider API 请求成功

建议范围：

- 接入 provider webhook
- 回写 delivered / bounced / complained 等状态
- 补充状态查询或运营视图

说明：

- 当前仓库内未看到 webhook / bounce / complaint 等回流能力

### P1-3. RBAC 与团队能力补齐

目标：

- 把现有 workspace / member 结构补成可运营的团队模型

建议范围：

- owner / admin / member 权限收口
- 邀请成员
- 成员管理

说明：

- 当前已有 workspace membership 基础，但还没有真正的权限策略收口

### P1-4. 运维与数据操作工具

目标：

- 降低上线后人工排障和手工修复成本

建议范围：

- 失败任务重试入口
- 活动暂停 / 取消
- 死信 / 重放策略
- 基础运营排障页

### P1-5. 产品层增强

目标：

- 在系统稳定后补齐体验和可视化

建议范围：

- dashboard
- 更丰富的报表
- 模板预览增强
- 列表分页、筛选与查询体验优化

## 建议执行顺序

1. 先确定生产认证方案与正式部署模型。
2. 再落地真实异步执行链路。
3. 然后补齐 CI、typecheck、部署脚本与 runbook。
4. 最后补 webhook、邮件合规、RBAC 与运营工具。

## 当前建议

如果目标是“尽快上线第一版”，建议先以“认证 + 真实 async + 部署闭环”作为唯一 P0 主线，不要先扩 dashboard 或报表类需求。
