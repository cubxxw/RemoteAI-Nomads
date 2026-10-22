# 旅居指南质量优化计划

> 2026-10-23 整合说明：本计划记录原指南检出的实施范围；“README”中的城市卡现并入[目的地笔记](../../../guides/destination-notes.md)。远端主分支既有网站与发布流程保留；下文“不推送”等约束仅记录当时轮次，后续发布按用户本次指令执行。

> **For agentic workers:** 使用 subagent-driven-development 分工实施，每项完成后独立审查，最后统一验证。用户已要求 sub-agent 深度分析并直接优化。

**Goal:** 让现有指南更易作出选择，价格可逐项追溯，过期提醒与数据损坏可及时发现。

**Architecture:** 保留 Markdown + JSON，不新增网站、数据库或第三方运行依赖。两个独立 Python 标准库检查器分别负责数据与本地文档链接，GitHub Actions 运行相同命令。

**Tech Stack:** Python 3.10+、unittest、Markdown、JSON、GitHub Actions。

**Spec:** 本文件以下范围与接口为本轮实施依据；不涉及新产品架构。

## Global Constraints

- 保留原核读日期；今天修改内容不等于今天重新核实全部资料。
- 不把 `null` 月预算改成零，不把个案价格变成城市平均价。
- 保留 `discovery_only`、`excluded` 与反例的使用边界。
- 价格新增 `source_id`、`source_date_kind`，后者仅 `published_on` / `checked_on`；目的地 schema_version 升为 2。
- 外网可达性与政策正确性需人工核读；本地检查通过不表示事实全部有效。
- 仅修改当前已隔离的工作区；不推送、不合并。

## Review Focus

- 金额为 bool、负数、NaN/Infinity，不能误判为合法价格。
- 来源不明、用途为 discovery_only/excluded/counterexample_only 的价格，不能进入推荐证据。
- 价格日期应匹配发布日或核读日，不能通过改日期制造“新鲜”报价。
- 缺失文件、中文锚点、重复标题、代码块内伪链接与参考式链接应有明确行为。
- 到期提醒只表示需要人工复核；警告不应把历史经验变成错误或自动否决推荐。

## Task 1: 数据可追溯与数据检查器

**Files:** `data/destinations.json`、`data/sources-2026-10-14.json`、`scripts/check_data.py`、`tests/test_check_data.py`。

**Interfaces:** `validate_data(destinations: dict, sources: dict, as_of: date) -> list[str]` 返回结构错误；CLI `python3 scripts/check_data.py [--as-of YYYY-MM-DD]` 通过返回 0，结构错误返回 1；到期提醒可独立输出而不失败。

- [x] 为缺少引用、无效金额、错误日期语义、无效时区及到期提醒写回归测试，先确认失败。
- [x] 实施零依赖检查器，核查必要字段、ID 唯一性、来源用途、价格与日期、时区及预算边界；文件错误输出可定位诊断。
- [x] 为 18 条价格补直接来源及日期类型；只添加有明确意义的复核提醒。
- [x] 用当前真实数据和恶意/错误变体运行校验。

## Task 2: 本地文档链接检查器

**Files:** `scripts/check_links.py`、`tests/test_check_links.py`。

**Interfaces:** CLI `python3 scripts/check_links.py [--root PATH]` 递归检查 Markdown；正常返回 0，本地目标或锚点错误返回 1。不请求网络。

- [x] 先写临时文档测试：缺文件、缺锚点、中文标题、重复标题、显式 id、参考式链接、代码片段排除。
- [x] 实施有明确支持范围的 Markdown 检查器，不引入解析依赖。
- [x] 检查全部真实文档，输出文件与行号。

## Task 3: 阅读路径、事实时效与维护流程

**Files:** `README.md`、`CONTRIBUTING.md`、`data/README.md`、必要的地区指南、`CHANGELOG.md`、`.github/workflows/validate.yml`、`research/2026-10-22-project-audit.md`。

- [x] 把需要重新核实的短期天气与已核读的历史事件区分；仅基于本轮实际取得的官方信息更新现状。
- [x] 连通预算方法、资源专题与目的地待核入口；用可操作检查替代未定义的贡献规则。
- [x] 贡献说明记录价格字段、来源状态、验证命令和人工复核范围。
- [x] Actions 在 PR、push、每周和手动运行只读检查；最小权限，无外部写入。
- [x] 审计报告列出证据、优先级、本轮完成内容和后续建议。

## Task 4: 独立复审与交付

- [x] 独立 sub-agent 审查最终差异，修复重要问题。
- [x] 运行 `python3 -m unittest discover -s tests -v`、两个 CLI 和 `git diff --check`。
- [x] 报告实际测试数量与残留的人工复核事项，不声称 GitHub 云端 CI 已运行。
