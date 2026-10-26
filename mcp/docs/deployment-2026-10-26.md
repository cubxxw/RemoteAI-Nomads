# MCP 正式发布记录

2026-10-26，完成 PR #39 合并和 Cloudflare 正式部署。以下是线上实际请求的结果，不是本地预演。

## 已发布地址

| 入口 | 地址 |
| --- | --- |
| MCP 客户端接入 | `https://mcp.roamorrow.com/mcp` |
| 普通JSON查询 | `https://mcp.roamorrow.com/api/query` |
| 健康状态 | [healthz](https://mcp.roamorrow.com/healthz) |
| Skill 安装包 | [roamorrow-nomad-planner.zip](https://mcp.roamorrow.com/skills/roamorrow-nomad-planner.zip) |
| 公开数据清单 | [manifest.json](https://mcp.roamorrow.com/data/manifest.json) |

客户端无需账户、密钥或登录。MCP 地址供协议客户端发送请求；健康和下载入口可直接访问。

## 版本与绑定

- PR #39 合并提交：`b47443be54d6df5e6cf81ee5453732f6cc65d75b`。
- 独立 Worker：`roamorrow-nomads-mcp`。
- 正式版本：`3a6369a8-e00b-486e-8cc6-19d1642d623e`。
- 首次发布版本：`5943d1c1-4057-4e18-a871-1643148e281c`；随后同步更新了安装包中的正式地址说明。
- 数据版本：`public-6484b36f123d186cbfc5`。
- 公开快照SHA256：`c276551a62a38b573cb27d0d1a00fbaa6b1955f9c65944e27a4903e7d64a4503`。

Cloudflare API 回读确认，自定义域名 `mcp.roamorrow.com` 绑定到上述 Worker。发布选择域名所属账户，账户凭据没有写入源码。配置没有启用额外的workers.dev入口，也没有绑定站内D1、对话运行时或模型密钥。

## 线上验收

官方SDK v2.4.0与v1.29.0分别通过真实HTTPS完成工具发现、泰国背景查询、会议时间换算和预算演算。两代客户端都发现12个工具，返回3个候选与13个来源，使用相同数据版本。客户端没有配置认证提供方。

另外通过正式JSON接口验证四项行为，全部HTTP200且结果符合预期：国家背景；东京不符合指定温度时不进入候选；城市住房范围不返回全国统计；美国护照缺口不套用CN资格。

健康检查返回 `ok=true`、350城和匹配的数据版本，没有设置应用会话Cookie。查询响应为 `Cache-Control: no-store`；数据清单为60秒复核缓存，带版本的原始快照为一年不可变缓存。

安装包经正式地址下载，与本地发布包SHA256一致：

`141b78aba597e3c8663e92e333e4b071ab555e1e0e328424d7097188ab078565`

大小7465字节，CRC通过，包含Skill主文件、使用参考、查询脚本和MIT许可四个文件。解压线上下载包后，清除本地接口覆盖参数，直接运行其中的查询脚本；默认正式地址成功返回泰国背景与3个候选。

验收使用本机现有正常代理网络，没有关闭TLS验证。功能请求通过不代表完成持续压测；共享出口限流误伤、具体桌面产品界面和高并发下的CPU表现仍未单独验收。价格、气候和政策继续保留各自原日期，部署日期不冒充资料核读日。

## 后续发布与回退

从 `mcp/` 执行数据构建、Skill打包及检查，通过后，在域名所属账户运行 `npx wrangler deploy`。多账户环境通过维护者自己的 `CLOUDFLARE_ACCOUNT_ID` 选择账户。正式域名路由已写入版本控制，不依赖本机临时绑定。

如需立即退回首次可用版本，在正确账户下运行：

```sh
npx wrangler rollback 5943d1c1-4057-4e18-a871-1643148e281c
```

如需暂停查询，将 `MCP_ENABLED` 设为字符串 `false` 后发布，查询入口返回503与重试时间。不可变公开资料和下载文件不作为个人数据存储，不随预算请求写入。
