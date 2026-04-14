---
title: ADR-005 Contact Segmentation Model
status: accepted
date: 2026-04-14
---

# ADR-005: 第一阶段联系人分组建模

## 状态

Accepted

## 决策

第一阶段联系人分组先采用单值字段：

- `contacts.group_name`

当前不引入：

- tags
- lists
- 多对多关系表

## 为什么这样定

- 旧项目已经证明“按组筛选和发送”是有效业务语义
- 但当前还没有足够证据支持更复杂的 tag/list 体系
- Phase 2 第一包优先需要稳定 contacts/template/campaign ingress 的事实层，不应提前引入额外关系复杂度

## 升级路径

未来如果出现以下需求，再升级：

- 一个联系人同时属于多个分组
- 需要可复用静态列表
- 需要动态 segment 规则

升级方式：

- 保留 `group_name` 作为兼容输入或迁移来源
- 新增 `contact_lists` / `contact_tags` 等正式模型
- 通过数据迁移把已有 `group_name` 提升为 list/tag 关系
