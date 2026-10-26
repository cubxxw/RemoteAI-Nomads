# Roamorrow Nomads MCP

无需登录的只读资料服务。一次主查询合并国家背景、候选城市、消费样本、历史气候和来源。站内数据库与对话运行时不参与公共请求。

当前为实现版本，尚未部署公共地址。MCP 接入地址在本地是 `http://127.0.0.1:8795/mcp`；拟定正式地址为 `https://mcp.roamorrow.com/mcp`，上线验收后再使用。

## 本地运行

在本仓库的 `mcp/` 目录运行，使用 Node.js 24：

```sh
npm ci
npm run check
npm run dev
```

在支持远程 MCP 的客户端添加本地地址即可，不填账户或密钥。服务支持2026无状态协议与2025握手兼容，已用两代官方SDK测试；具体桌面产品的兼容性仍需逐一确认。

`npm run test:live` 会启动临时本地 Worker，用两代官方客户端完成真实HTTP查询，再关闭自己启动的进程。测试已启动的服务可用 `npm run test:live -- --url http://127.0.0.1:8795/mcp`。

## 最少的查询

从国家或月份开始，优先 `nomads_get_context`。两城对比优先 `nomads_compare_cities`。两者已合并关键消费与工作资料，通常不需要先查询地名、覆盖统计和每座城市的背景。

例如 `get_context` 的参数：

```json
{
  "country": "TH",
  "months": [11],
  "currency": "CNY",
  "work_schedule": {
    "home_timezone": "Asia/Shanghai",
    "date": "2026-11-16",
    "times": ["09:00", "18:00"]
  }
}
```

日期仅演示格式，实际使用填写用户给定或明确说明的示例日期。响应包括 `data_version`；后续查询传回它，版本失效就明确重建本次比较。

没有 MCP 的环境也可 POST 到 `/api/query`，请求形状是 `{"tool":"nomads_get_context","arguments":{...}}`。调用同一组校验与查询函数，不需要另一个账户。

| 首版工具 | 用途 |
| --- | --- |
| nomads_search_places | 名称与歧义候选 |
| nomads_get_context | 一次建立国家或城市背景 |
| nomads_find_cities | 扩大候选、精确气候筛选 |
| nomads_compare_cities | 2–3城消费、工作与指标对照 |
| nomads_get_costs | 按地域和类别查价格明细 |
| nomads_get_climate | 指定月份的历史气候 |
| nomads_get_entry_rules | 明确护照的政策资料边界 |
| nomads_get_work_conditions | 工作场所、网络旧指标与地域名单 |
| nomads_get_sources | 来源、日期与许可记录 |
| nomads_get_catalog_info | 实际覆盖、版本和方法 |
| nomads_calculate_budget | 按人/整组、日/月/一次性费用演算 |
| nomads_convert_meeting_time | 按日期和时区换算，处理夏令时异常 |

## 安装 Skill

完整 Skill 在 [skills/roamorrow-nomad-planner](../skills/roamorrow-nomad-planner/SKILL.md)。将整个目录复制到所用客户端支持的 Skill 位置；安装不会自动修改 MCP 设置。按该客户端的方式添加服务地址。

`npm run package:skill` 生成 `public/skills/roamorrow-nomad-planner.zip`。安装包只有 Skill、必要参考、无依赖的查询脚本和许可文件。没有连接 MCP 时，脚本使用同一JSON接口；本地测试设置 `NOMADS_API_URL=http://127.0.0.1:8795/api/query`。

## 数据与限制

`npm run data` 只读取检查散列和隐私边界均通过的公开种子。导出字段使用白名单；不读取私人开发库、Notion映射或本机凭据。公开清单位于 `/data/manifest.json`，对应的JSON文件带稳定版本地址。来源只导出元数据和已审核公开事实，没有复制源网页全文或照片。

原币、单位、地域范围和观察日期保留。住房挂牌不是短租成交保证，全国居民统计不能替代城市租金。历史气候不是预报。旧安全与网络指标不升级为实测；其他护照无适用数据时不套用CN，仍可提供未判定适用性的官方参考链接。

许可未填写的来源标为 `not_recorded`，不声称资料统一适用代码的MIT许可。需要进一步分发时按来源核对；接口没有公开源网页全文、图片或内部导入信息。

首版只查询当前发布版本，不增加历史归档存储。未知版本返回 `DATA_VERSION_UNAVAILABLE`。公开快照不包含用户上下文；预算方案留在客户端重传。快照数据可缓存，请求和个人预算响应不共享缓存，也不记录参数正文。

默认请求上限16 KiB，结果上限64 KiB；搜索最多20条、费用明细最多50条、对比最多3城。短期限流按来源网络粗略防滥用，超限返回429及重试时间，不建立“每个用户”的身份额度。共享出口和地区级近似计数的边界见 [Cloudflare限流文档](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。

## 部署

完成检查并核对当前账户后，从 `mcp/` 运行 `npx wrangler deploy`。当前配置没有网站D1、Durable Object、模型密钥或OAuth绑定。独立Worker仍可能共用账号级额度，本地通过不等于免费CPU额度下的生产性能已验证。

域名绑定和正式接入地址需在部署后核验。客户端无登录需求；维护者仍需自己的 Cloudflare 部署权限。已记录的兼容日期与锁定依赖可在本地运行，不跟随未经验证的最新包。

桌面客户端可省略Origin；浏览器接入默认允许本站和localhost。其他可信浏览器来源通过 `ALLOWED_ORIGIN_HOSTS` 显式配置主机名，不根据请求自己声明的主机名自动放行。

需要临时关闭查询时，将 `MCP_ENABLED` 设为 `false` 后发布，客户端得到503和重试时间。部署回退使用 Cloudflare 已保存的 Worker 版本，原始公开种子不随回退改写。

协议处理使用 [官方TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) 的 `createMcpHandler`，直接复用其无状态与旧版兼容实现，不自写握手。Skill 格式依据 [Agent Skills规范](https://agentskills.io/specification)。
