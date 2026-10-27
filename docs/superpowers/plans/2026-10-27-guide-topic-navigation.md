# Guide Topic Navigation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将拥挤的单排分类改为易区分、可筛选的旅居专题入口。

**Architecture:** 文章目录生成六个入口及完整分组，新增轻量浏览器模块控制组的显示和URL片段。公开HTML始终保留所有链接，分类与计数来自同一目录。

**Tech Stack:** Existing Worker SSR, vanilla JavaScript and CSS.

**Spec:** docs/superpowers/specs/2026-10-27-guide-topic-navigation-design.md

## Global Constraints

保留原文章地址、系列编号、正文、照片及资料日期。沿用品牌深棕色。无脚本仍能读取所有文章，未知分类不丢内容。只在本工作区修改。

## Review Focus

- 64篇全部纳入分组，任何一篇只出现一次。
- 现有锚点、未知片段和浏览器前进后退保持可恢复。
- 手机与大字不横向滚动，分类说明能读完。
- 筛选不移走键盘焦点，选中状态同时有语义和视觉反馈。
- 动态与静态回退保留相同文章链接和计数。

### Task 1: 目录与筛选

- [x] 为真实篇数、64篇唯一归组、无分类与无效分类写失败测试并确认失败。
- [x] 修改web/src/article-catalog.js与目录JSON，增加可验证的topicCategory及完整分组；保留现有锚点。
- [x] 新增web/public/modules/guide-topics.js并由content-ui.js初始化，使用原生链接、hash历史和状态播报。
- [x] 在web/public/editorial.css实现六个短入口、两排布局与响应式选中状态。
- [x] 真实浏览器验证筛选、全部、回退、键盘及无脚本，查看目标宽度画面并修复。
- [ ] 完成中文白名单复查、全量检查和独立审查，同步公开构建、合并发布并读回正式网页。
