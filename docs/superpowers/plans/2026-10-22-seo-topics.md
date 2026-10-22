# 2026-10-22 SEO 专题四篇：实现计划

用户明确要求直接执行（不走额外设计审批），并授权本轮串行测试。研究判断、提交、PR、合并与部署由父任务负责；本计划只记录本工作树内的实现与验证。

**目标**：按下述四个选题与[来源账本](../../../research/2026-10-22-seo-topics.md)发布四篇中文专题指南，走既有城市指南发布管线，不新增依赖。

## 四篇与稳定 slug

| # | slug | 标题 | 城市关联 |
| --- | --- | --- | --- |
| 1 | `november-nomad-destinations` | 11月去哪旅居：先看清迈、河内和大理，再决定要不要去海边 | chiang-mai, hanoi, dali, penang, da-nang |
| 2 | `monthly-budget-5000` | 月预算5000元能去哪旅居？先把房租、工位和押金分开算 | dali, pokhara, baku, hanoi, chiang-mai |
| 3 | `beijing-time-remote-work` | 按北京时间上班，去哪旅居不用熬夜？把9点到18点换算一次 | dali, penang, kuala-lumpur, ubud, chiang-mai, hanoi, pokhara, baku, lisbon, madrid |
| 4 | `chinese-passport-long-stay` | 中国护照想在国外住久一点：免签、电子签和远程工作签证怎么选 | kuala-lumpur, penang, chiang-mai |

编辑视角：2026 年 11 月视角页按 2026-10-22 编辑；只做“选择与规划”，不做完整排名，也不做法律/税务意见。URL 不带年份。

## 架构决策

1. 四篇为 `web/content/city-guides/` 下的真实 HTML 批准源，目录 `kind=guide`、新增可选布尔 `topic=true` 校验；指南索引单列“旅居专题”分区，不混入“住一个月，先把账算清楚”。
2. 首页排行加一条紧凑的选题入口（`rank-pages.js` 单一实现，数据库与公开快照同渲染）。
3. `build-city-guides.mjs`：`config.kind='topic'` 时要求 `checkedOn` 与来源表、允许缺少 `fx`（报告 `fxDate:null`）；预算指南仍要求 `fx.date`。不为签证/时区/季节页编造汇率日。
4. 社交卡图片复用已授权真实城市照片的字节副本 `og-topic-*.webp`，记录 sha256 与作者/许可，注明复用非新采。
5. 版式复用 `preview.css`/`reader.js` 既有样式，仅追加专题页 `<details>` 章节导航所需几行 CSS（同步 publication.json 中 preview.css 指纹）。

## 内容决定（沿用简报，保留限制）

- 11月页：清迈/河内/大理为第一候选，槟城、岘港为有条件对照；11月气候取公开种子 2023–2025 ERA5 三年聚合（保留原 source ID），不称气候常年值、不做预报；BAANNOI 同一房型旺季 +2,500 泰铢只代表那一间房；不把清迈 28,900 泰铢（3–10月口径）当 11 月全包价；大理取暖/热水/试住与询价保留待核。
- 5000 元页：单人 30 晚规划上限，不含押金/机票/保险签证/未知杂费；编辑示例账单 2000+1500+300+200+500=4500，余 500；五个城市沿用各自 `checkedOn`、`fxDate` 与 `planning-estimate` 口径，不排名国别；BAANNOI+RealSpace 19,000 泰铢为反例。
- 北京时间页：用 `city-ui.js` 的 `meetingTime`/Intl+IANA 计算 2026-11-16 与 2027-07-15 两天的 09:00–18:00 对应当地时间；只做钟表换算，不是工作许可；夏令时按日期。
- 护照页：区分有效期/停留期/允许活动/延期；只给马来西亚免签、泰国 DTV、马来西亚 DE Rantau 三条路径；不写费用表、不做税务保证；30 天≠30 晚，45 天停留不能靠一次 30 天免签。

## 验证门禁（顺序执行）

`npm run guides:build` → `guides:check` → `data:pages` → `seasonal:readme -- --check` → `check` → `build`，最后 `git diff --check`。测试新增：专题来源校验（含 fx 规则）、预览/带查询 noindex、不依赖 D1 的路由、城市关联、sitemap、指南索引分区与移动端章节语义；四篇新增导致的既有用例计数变化按预期更新，不弱化断言。

## 交付边界

不提交、不推送、不部署、不写生产 D1、不重新生成公开数据种子；`research/2026-10-22-seo-topics.md` 记录读取范围、来源 ID、日期口径、去 AI 味复查与配图复用出处。父任务负责最终编辑审阅与发布。
