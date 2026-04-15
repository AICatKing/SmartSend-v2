---
title: SmartSend-v2 Backend Backlog
status: draft
updated: 2026-04-15
---

# SmartSend-v2 当前待开发 Backlog

本文档只整理当前后端待开发项，重点围绕：

- PostgreSQL truth layer
- type-safe contracts
- API / worker / async processing
- 当前已接受 ADR 的后续收口

不包含：

- 旧仓库 `~/code/personal/SmartSend`
- 前端页面接入
- 超出当前阶段的体验类增强

## 优先级说明

- `P0`: 不做会直接影响 async 系统的可靠性闭环
- `P1`: 很重要，但可以排在主链路稳定性之后
- `P2`: 有价值，但不应压过核心 async 生命周期
- `P3`: 明确后置

## P0

### 工作包名称

`Phase 6-B: Cron Recovery and Locked Job Reconciliation`

### 目标

- 为超时卡住的 `processing` 任务提供恢复路径
- 避免 worker 中断、函数超时或重复投递后留下永久卡死状态
- 给 `campaign` 聚合状态提供一次补偿性重算入口

### 验收标准

- 存在独立 recovery handler，可由本地 shim 手动触发
- 能扫描 `locked_at` 超过阈值的 `send_jobs`
- 恢复策略只允许：
  - 回到 `pending`
  - 或进入 `failed`
- 不允许 recovery 直接把任务写成 `sent`
- 恢复后能刷新对应 `campaign` 状态
- 有数据库级测试覆盖：
  - 单个卡住任务恢复
  - 重复执行 recovery 不导致状态错乱
  - 多个任务混合状态下的 campaign 聚合结果

### 风险

- recovery 逻辑最容易破坏状态机
- 若幂等处理不严谨，会导致重复发送或错误失败
- 若锁超时阈值设计过于激进，会误伤仍在执行中的任务

### 优先级

`P0`

---

### 工作包名称

`Phase 6-C: Retry Scheduling and Backoff Policy`

### 目标

- 给 `retryable` / `unknown` 失败提供明确的重试调度规则
- 避免当前“立即回到 pending”造成热重试或无节制重试

### 验收标准

- retryable 失败后，`scheduled_at` 按明确策略后移
- unknown 失败遵循 ADR-004：视为可重试，但受上限约束
- 达到 `max_attempts` 后进入 `failed`
- 重试策略至少在代码中可读、可测试，不依赖隐式魔法常量
- 有数据库级测试覆盖：
  - 首次 retryable 延后重试
  - 多次 retryable 后到达上限
  - unknown 路径的调度与终态失败

### 风险

- backoff 规则过弱会造成 provider 压力
- backoff 规则过强会拖慢业务反馈
- 如果 `attempt_count`、`scheduled_at`、recovery 三者协同不好，后续排障会很困难

### 优先级

`P0`

---

### 工作包名称

`Operational Validation: Real Database Test Execution Baseline`

### 目标

- 把“测试代码已存在”升级为“有测试库时能稳定跑通”
- 固化最小测试库运行方式，避免每次都靠人工猜测环境

### 验收标准

- 明确本地测试数据库初始化方法
- `apps/api` 与 `apps/worker` 集成测试在有 `DATABASE_URL` 时可稳定通过
- README 或专门文档明确：
  - 需要哪些环境变量
  - 如何准备测试数据
  - 如何运行测试
- 至少完成一轮真实数据库下的人工验证记录

### 风险

- 如果长期停留在“测试会 skip”，回归保护等于不存在
- 没有稳定测试基线时，后续 cron/retry 改动风险会迅速放大

### 优先级

`P0`

## P1

### 工作包名称

`Testing Infrastructure: Shared Fixtures and Helpers`

### 目标

- 抽出最小测试层，减少 API / worker / future cron 测试中的重复 seed 和 cleanup 代码

### 验收标准

- 存在共享测试 helper，至少覆盖：
  - DB cleanup
  - user/workspace membership fixture
  - campaign/send_job fixture
  - workspace sending config fixture
- 新测试优先复用 helper，而不是继续复制粘贴 seed 逻辑
- 不为了抽象而抽象，helper 只收敛已稳定复用的部分

### 风险

- 抽得太早会做成脆弱的测试框架
- 抽得太重会让写测试本身变慢

### 优先级

`P1`

---

### 工作包名称

`Processing Hardening: Unknown Classification and Edge Cases`

### 目标

- 补齐当前 processing 主链路的边界覆盖
- 让 `unknown`、重复调用、无可 claim 任务等场景更明确

### 验收标准

- 为 `unknown` provider 分类补测试
- 为“同一任务重复 process”补测试
- 为“无 pending job 时 consumer poll”补测试
- README 或测试说明中明确 mock provider 的边界行为

### 风险

- 如果边界没被固化，后续 recovery/retry 逻辑可能在小概率路径上失稳

### 优先级

`P1`

---

### 工作包名称

`Async Ingress: Real Queue Producer Integration Strategy`

### 目标

- 为未来接入真实 queue ingress 做清晰边界设计
- 保持本地 shim 与未来 Vercel queue consumer 的接口兼容

### 验收标准

- 明确 queue message shape
- producer 与 consumer 边界保持稳定
- 至少形成一份 ADR 或设计说明
- 不要求本包直接落地线上真实集成

### 风险

- 如果 ingress 边界不先固定，后面接真实队列时会反复改 domain 和 worker

### 优先级

`P1`

## P2

### 工作包名称

`Audit Coverage Expansion`

### 目标

- 补齐关键业务动作的审计覆盖和测试

### 验收标准

- processing 相关关键动作有清晰审计策略
- 发件配置、campaign、template、contact 的 audit 测试更完整

### 风险

- 若过早扩展，会分散对 async 主链路稳定性的注意力

### 优先级

`P2`

---

### 工作包名称

`Projection Queries and Operator Visibility`

### 目标

- 提升发送进度、任务列表、近期失败等查询能力
- 强化排障时对 `send_jobs` / `delivery_attempts` 的观察性

### 验收标准

- 增加必要的查询接口或列表能力
- 保持 projection 不反向定义 truth layer

### 风险

- 如果过早做 dashboard 风格需求，容易把项目拉回“先做展示而不是先做事实层”

### 优先级

`P2`

---

### 工作包名称

`Developer Experience: Local Seed and Manual Verification Helpers`

### 目标

- 降低本地手工验证成本
- 不再要求开发者先手动插入 `users/workspaces/workspace_members`

### 验收标准

- 存在最小 seed 脚本或文档化 SQL
- README 能指导开发者在不改代码的情况下跑通一轮 processing

### 风险

- 若把 DX 放在主链路可靠性之前，会影响阶段节奏

### 优先级

`P2`

## P3

### 工作包名称

`Frontend Integration`

### 目标

- 把现有 API/worker 能力接入前端

### 验收标准

- 前端能调用 contacts/templates/campaign/workspace sending config
- 能触发 campaign queue 并查看进度

### 风险

- 如果主链路的 recovery/retry 没收口，前端接入会把不稳定能力更早暴露出来

### 优先级

`P3`

---

### 工作包名称

`Dashboard and Rich Reporting`

### 目标

- 增加统计、报表和发送视图

### 验收标准

- 统计口径来自数据库 projection
- 不引入前端状态作为事实来源

### 风险

- 容易提前消耗时间在展示层，而非 async 基础能力

### 优先级

`P3`

---

### 工作包名称

`Production Queue Platform Integration`

### 目标

- 接真实 Vercel Queues 或最终确定的线上异步平台

### 验收标准

- producer/consumer 接口与部署模型打通
- 保持数据库仍为 truth layer

### 风险

- 如果在 recovery/retry/测试基线没稳定前就做平台接入，会把平台问题和业务问题混在一起

### 优先级

`P3`

## 推荐推进顺序

1. `Phase 6-B: Cron Recovery and Locked Job Reconciliation`
2. `Phase 6-C: Retry Scheduling and Backoff Policy`
3. `Operational Validation: Real Database Test Execution Baseline`
4. `Testing Infrastructure: Shared Fixtures and Helpers`
5. `Processing Hardening: Unknown Classification and Edge Cases`
6. `Async Ingress: Real Queue Producer Integration Strategy`
7. `Audit Coverage Expansion`
8. `Projection Queries and Operator Visibility`
9. `Developer Experience: Local Seed and Manual Verification Helpers`
10. `Frontend Integration`
11. `Dashboard and Rich Reporting`
12. `Production Queue Platform Integration`

## 当前判断

当前项目最缺的不是更多业务面，而是 async 生命周期的完整性：

- 已有：draft -> queue -> send_job processing
- 缺少：recovery / retry scheduling / 真实测试基线

因此，下一阶段不应优先铺更多 API 或前端，而应先把 `processing -> recovery -> retry scheduling` 这一条补完。
