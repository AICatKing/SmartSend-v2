# SmartSend 旧项目业务模块迁移盘点

更新时间：2026-04-14

## 目的

这份文档基于旧项目 `~/code/personal/SmartSend` 的实际运行时代码盘点业务模块，目标是为 `SmartSend-v2` 的 schema、contract、domain、API 和 async flow 设计提供输入。

这份文档刻意区分两类东西：

- 需要迁移的是业务语义、字段、状态、约束和关键流程
- 不应直接迁移的是旧前端架构、localStorage 持久化、页面驱动发送和浏览器内状态机

本盘点参考了 `SmartSend-v2` 当前 ADR：

- ADR-001: PostgreSQL + Drizzle + migration source of truth
- ADR-002: Better Auth + workspace context + RBAC
- ADR-003: Vercel-first async model
- ADR-004: Resend + retryable/non_retryable/unknown error model

## 旧项目当前模块清单

### 1. 联系人管理

主要代码：

- `hooks/useContacts.ts`
- `components/ContactManager.tsx`
- `services/mockDataService.ts`

真实能力：

- 联系人新增、编辑、删除
- 批量导入 CSV / JSON
- 按 `group` 分组查看与删除整组联系人
- 基于 `name` / `email` / `company` 搜索
- 保留任意额外列，作为动态字段参与模板变量替换

当前真实字段：

- `id`
- `email`
- `name`
- `company?`
- `group?`
- 任意自定义字段 `[key: string]: any`

业务价值判断：

- 高价值：`email`、`name`、`company`、分组/列表语义、任意扩展字段、导入行为
- 低价值：前端生成 `id` 的方式、文件名直接映射 `group` 的具体实现、浏览器内搜索状态

### 2. 模板编写与保存

主要代码：

- `hooks/useTemplates.ts`
- `components/EmailComposer.tsx`

真实能力：

- 编辑邮件 `subject` 和 `body`
- 保存模板草稿
- 载入已保存模板
- 删除模板
- 使用 `{{variable}}` 插入联系人字段
- 支持富文本 HTML 编辑和源码视图切换

当前真实字段：

- `id`
- `subject`
- `body`
- `created_at`

业务价值判断：

- 高价值：模板实体、`subject/body`、merge tag 语义、草稿保存
- 中价值：`created_at`
- 低价值：浏览器 contentEditable 编辑器、`document.execCommand`、源码/所见即所得切换实现

### 3. AI 模板生成与垃圾邮件风险分析

主要代码：

- `services/geminiService.ts`
- `api/ai/analyze.js`
- `api/ai/generate.js`
- `server/index.js`
- `components/EmailComposer.tsx`

真实能力：

- 调用 DeepSeek 的 OpenAI-compatible 接口生成模板
- 调用同一 provider 分析垃圾邮件风险
- 前端通过 header 传入用户自己的 DeepSeek API key

当前真实输入输出语义：

- generate 输入：`topic`、`tone`
- generate 输出：`subject`、`body`
- analyze 输入：`subject`、`body`
- analyze 输出：`score`、`riskLevel`、`suggestions[]`
- AI 提示词要求模板使用 `{{name}}`、`{{company}}`、`{{email}}` 作为个性化占位符

业务价值判断：

- 高价值：AI 生成和分析是独立能力，且输出字段明确
- 中价值：现有 prompt 可作为初版参考
- 低价值：文件名 `geminiService.ts` 与实际 DeepSeek provider 不一致，这只是历史命名残留

### 4. 设置 / 发件配置

主要代码：

- `components/Settings.tsx`
- `services/emailService.ts`
- `config/email.config.ts`
- `api/send.js`
- `server/index.js`

真实能力：

- 保存用户自己的 DeepSeek API key
- 保存用户自己的 Resend API key
- 保存 `reply-to` 邮箱
- 保存发件人名称
- 保存 `from email`
- 发送时由前端读取这些配置并传给 `/api/send`

当前真实字段：

- `userDeepSeekKey`
- `userResendKey`
- `userReplyEmail`
- `userSenderName`
- `userFromEmail`
- 默认配置：`defaultFromEmail = noreply@cekai.site`、`defaultSenderName = SmartSend`

业务价值判断：

- 高价值：workspace 级发件配置这个业务概念
- 高价值：`from_email`、`from_name`、`reply_to_email`、provider API key
- 低价值：localStorage 存储方式、把用户 key 直接放进 header 的前端实现

### 5. Campaign / 发送监控

主要代码：

- `components/CampaignMonitor.tsx`
- `hooks/useCampaigns.ts`
- `services/emailService.ts`
- `services/mockDataService.ts`

真实能力：

- 从联系人中选择全部或某个 `group` 作为目标受众
- 使用模板与联系人数据做变量插值
- 页面内逐个发送邮件
- 支持开始、暂停、继续
- 记录最近发送日志
- 成功发送后记录一条发送结果

当前发送相关字段：

- `contact_email`
- `contact_name`
- `subject`
- `success`
- `group?`
- `sent_at`

当前页面状态：

- `IDLE`
- `SENDING`
- `PAUSED`
- `COMPLETED`

业务价值判断：

- 高价值：按联系人批量发送、按分组发送、模板插值、每个收件人的发送结果记录
- 中价值：暂停/继续说明了旧产品确实存在“长发送流程”的需求
- 低价值：`setTimeout(..., 1000)` 串行循环、浏览器里执行发送、页面状态枚举直接驱动发送

### 6. Dashboard / 统计

主要代码：

- `components/Dashboard.tsx`
- `hooks/useCampaigns.ts`
- `utils/campaignStats.ts`

真实能力：

- 展示联系人数
- 展示模板是否已就绪
- 展示 AI / email provider 是否配置
- 展示近 7 天发送量
- 展示按组统计
- 展示最近发送记录

业务价值判断：

- 高价值：这些统计维度本身有产品价值
- 低价值：当前统计全部来自 localStorage 聚合，不能作为真相建模来源

## 旧模块 -> v2 模块映射表

| 旧模块 | 旧实现现状 | v2 对应模块 | 迁移方式 |
| --- | --- | --- | --- |
| ContactManager + useContacts | localStorage CRUD + CSV/JSON 导入 + group | `contacts` schema / contracts / API / domain | 迁移业务字段和导入规则，不迁移 localStorage hook |
| EmailComposer + useTemplates | localStorage 模板保存 + merge tags + AI 按钮 | `templates` schema / contracts / API / domain | 迁移模板实体和 merge tag 语义，不迁移编辑器实现 |
| geminiService + `/api/ai/*` | DeepSeek 代理调用 | AI template generation / analysis contracts + provider adapter | 迁移接口语义和输出结构，不迁移旧命名和前端直传 key 模式 |
| Settings + emailService + `/api/send` | 浏览器保存 provider key 和 sender profile | workspace sending config + provider adapter + audit logs | 迁移配置字段和安全边界，不迁移 localStorage 与 header 透传 |
| CampaignMonitor + useCampaigns | 页面驱动逐个发送 + 成功日志记录 | `campaigns` + `send_jobs` + `delivery_attempts` + queue producer / consumer / cron | 迁移发送业务语义，不迁移浏览器循环和暂停状态机 |
| Dashboard + campaignStats | localStorage projection | stats queries / progress API | 迁移统计口径，不迁移 localStorage 聚合工具作为真相 |

## 推荐优先迁移顺序

1. 联系人与模板

- 旧项目中最稳定、最清晰的业务实体
- 可以先落 `contacts` / `templates` schema、CRUD contract 和 workspace 边界

2. 发件配置

- 直接决定 ADR-004 的 provider adapter 输入
- 需要尽早从“前端持有 API key”改成“后端受控密文存储”

3. Campaign draft / queue 入口

- 旧项目虽然没有真正的 campaign 聚合实体，但已经有“选目标 + 套模板 + 触发发送”的业务动作
- 下一步应把它抽成正式 `campaign` 和 `send_job`

4. Async consumer / delivery attempts

- 对应旧项目中逐个发送和日志输出的真实需求
- 这是从页面驱动发送迁移到 ADR-003 async model 的关键

5. Dashboard / progress / audit

- 这些是 projection 层，应建立在前面几个事实表上

## 可以直接吸收的业务语义

### 联系人

- 联系人最小字段是 `email` 和 `name`
- `company` 是高频附加字段，值得保留为一等字段
- 联系人确实需要承载自定义字段，因为模板插值依赖它
- “group targeting” 是真实需求，但 v2 需要决定它是简单字符串分组、标签，还是独立 contact list 实体

### 模板

- 模板最小可用结构是 `subject + body`
- 模板主体需要支持 HTML
- merge tag 语法已经在旧项目中稳定为 `{{fieldName}}`
- 模板生成时默认期待 `name/company/email` 三个基础变量

### 发件配置

- 需要 provider
- 需要 `from_email`
- 需要 `from_name`
- 需要 `reply_to_email`
- 需要 provider API key

### 发送业务

- 按目标联系人批量生成收件任务
- 支持针对全部联系人或某个分组/列表发送
- 每个收件人都需要独立结果
- 模板插值发生在发送路径上，而不是联系人导入阶段
- 发送结果至少要区分成功和失败
- 需要保留最近发送日志和统计查询能力

### AI 能力

- “根据 topic + tone 生成模板” 是独立可调用能力
- “对模板做 spam/deliverability 分析” 是独立可调用能力
- 这两者都适合成为 API contract，而不是粘在编辑器组件内部

## 不应直接迁移的旧实现模式

### 1. localStorage 作为真相层

旧项目把以下内容放在 localStorage：

- 联系人：`smartsend.contacts`
- 模板：`smartsend.templates`
- 发送记录：`smartsend.campaigns`
- AI / Resend 配置：`userDeepSeekKey`、`userResendKey`、`userReplyEmail`、`userSenderName`、`userFromEmail`

这些只能视为旧原型的持久化方式，不能迁移为 v2 的事实模型。

### 2. 页面驱动发送

`CampaignMonitor.tsx` 通过浏览器页面里的 `setTimeout` 循环逐个发送，状态由前端控制。

这不应进入 v2，因为它和 ADR-003 冲突：

- 依赖页面存活
- 没有正式队列语义
- 没有任务 claim / retry / lock recovery
- 暂停与继续只是前端 UI 状态，不是后端任务状态机

### 3. “Campaign” 被简化成单条发送记录

`useCampaigns.ts` 当前存的是每封邮件的结果快照，不是真正的 `campaign` 聚合实体。

因此这些旧字段不能直接映射为 v2 `campaigns` 表：

- `contact_email`
- `contact_name`
- `subject`
- `sent_at`
- `success`
- `group`

它们更接近：

- `send_jobs`
- `delivery_attempts`
- 以及 `campaign` 的统计投影输入

### 4. 前端直接持有敏感配置

旧项目设置页把 provider key 和 AI key 存在浏览器 localStorage，并在请求时通过 header 传给 app 自己的 API route。

这不应迁移，因为 v2 已明确要求：

- API key 只允许后端读取
- 不允许返回给前端
- 配置变更要进入审计

### 5. 统计从前端聚合反推真相

`Dashboard` 和 `utils/campaignStats.ts` 都是基于前端记录做聚合。

v2 应反过来：

- 先有事实表
- 再由查询或 projection 产出 dashboard

## 值得复用的代码类型

### 值得复用为参考或重写的

- `services/mockDataService.ts` 的 merge tag 插值规则
- `services/mockDataService.ts` 的 CSV/JSON 导入字段映射思路
- `api/ai/generate.js` 和 `api/ai/analyze.js` 的输入输出结构
- `services/emailService.ts` / `api/send.js` 中 Resend 调用 payload 结构
- `components/Settings.tsx` 中暴露出的发件配置字段集合
- `components/CampaignMonitor.tsx` 中成功/失败日志字段

### 不值得直接复用的

- React 组件本身
- `usePersistentState`
- `useContacts` / `useTemplates` / `useCampaigns` 的 localStorage CRUD
- `CampaignMonitor` 的 `setTimeout` 发送循环
- contentEditable 编辑器逻辑和 `document.execCommand`
- `server/index.js` 与 `api/*` 的重复实现结构

## Phase 2 最应该先落的字段和状态

### contacts

建议先落：

- `id`
- `workspace_id`
- `email`
- `name`
- `company`
- `group_name` 或替代的列表/标签归属字段
- `custom_fields_json`
- `created_at`
- `updated_at`
- `deleted_at`

原因：

- 这是旧项目里最稳定的业务实体
- 模板插值和后续 campaign 建任务都依赖它

### templates

建议先落：

- `id`
- `workspace_id`
- `name`
- `subject`
- `body_html`
- `created_at`
- `updated_at`
- `deleted_at`

说明：

- 旧项目没有显式模板名，但 v2 大概率需要，否则无法稳定管理多个模板

### workspace sending config

建议先落：

- `workspace_id`
- `provider`
- `from_email`
- `from_name`
- `reply_to_email`
- `encrypted_api_key`
- `created_at`
- `updated_at`

### campaigns

旧项目没有现成 campaign 聚合实体，但根据真实流程，Phase 2 应至少定义：

- `id`
- `workspace_id`
- `template_id`
- `target_scope_type`
- `target_scope_ref`
- `status`
- `queued_at`
- `started_at`
- `completed_at`
- `created_by_user_id`

建议状态先从以下集合开始：

- `draft`
- `queued`
- `processing`
- `completed`
- `failed`
- `cancelled`

### send_jobs

这是旧项目页面逐个发送逻辑在 v2 中最关键的替代物，建议优先明确：

- `id`
- `workspace_id`
- `campaign_id`
- `contact_id`
- `status`
- `scheduled_at`
- `locked_at`
- `locked_by`
- `attempt_count`
- `max_attempts`
- `last_error_code`
- `last_error_message`
- `provider_message_id`
- `created_at`
- `updated_at`

建议状态先从以下集合开始：

- `pending`
- `processing`
- `sent`
- `failed`
- `cancelled`

### delivery_attempts

旧项目虽然没有独立 attempts 表，但真实日志需求已经存在。建议先落：

- `id`
- `workspace_id`
- `send_job_id`
- `provider`
- `provider_message_id`
- `status`
- `error_code`
- `error_message`
- `requested_at`
- `completed_at`
- `raw_response_json`

## 当前发现的歧义、风险和未决点

### 1. “group” 到底是什么

旧项目把 `group` 当成联系人属性，并且默认由上传文件名生成。

这说明“分组发送”是真需求，但还不能直接得出最终建模应为：

- 联系人上的单值 `group_name`
- 多标签系统
- 独立 `contact_lists`

这个点会直接影响 contacts schema、campaign target contract 和统计维度。

### 2. 旧项目没有真正的 campaign 聚合模型

当前只有“发送一封就记一条结果”的记录方式，没有：

- campaign draft
- queue time
- campaign lifecycle
- per-campaign progress truth

所以 v2 不能机械迁移旧 `campaigns` 命名，必须重建实体边界。

### 3. 敏感信息边界在旧项目中是薄弱的

旧项目 UI 声称 key “never transmitted to our servers”，但真实代码会把用户 API key 通过 header 发给应用自己的 API route。

这在 v2 中必须明确改正，否则会误导配置模型和安全边界。

### 4. AI provider 命名已经漂移

前端服务文件叫 `geminiService.ts`，但真实 provider 是 DeepSeek 的 OpenAI-compatible endpoint。

这说明旧代码命名不能当 source of truth，应以实际调用为准。

### 5. 旧文档里有 Supabase / queue / migration 叙述，但运行时代码并未落地

代码层面没有看到真实的 Supabase runtime、auth、workspace、多租户或 queue consumer 落地。

因此下一阶段必须以运行时代码盘点为准，而不是把旧文档中的设计稿当成已实现事实。

### 6. 模板变量与联系人自定义字段需要更严格边界

当前插值规则允许任意 `{{key}}` 读取联系人对象属性。

这很灵活，但 v2 需要明确：

- 是否允许任意字段暴露给模板
- 如何验证模板变量是否合法
- 如何处理缺失字段
- 是否需要在保存模板时做静态检查

### 7. Dashboard 统计口径需要重新定义

旧项目里“总发送数、近 7 天、按组统计、最近记录”都基于前端记录。

这些维度本身值得保留，但要重新基于：

- `campaigns`
- `send_jobs`
- `delivery_attempts`

来定义，而不是沿用旧 localStorage 聚合逻辑。

## 建议给 Phase 2 的直接输入

下一阶段最适合先消费这份盘点的工作包是：

1. 定义 `contacts`、`templates`、`workspace_sending_config` schema
2. 定义 `contact.create/list`、`template.create/list` contract
3. 定义 `campaign.createDraft`、`campaign.queueCampaign` contract
4. 明确 `group/list/tag` 建模选择
5. 设计 `send_jobs` / `delivery_attempts` 的最小状态机与字段

在进入这一步之前，不建议继续沿用旧前端里的 `campaigns` 命名和 `SendStatus` 枚举，因为它们描述的是 UI 执行过程，不是后端事实状态。
