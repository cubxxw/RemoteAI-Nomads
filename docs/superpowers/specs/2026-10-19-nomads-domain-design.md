# Nomads 挂载到 Roamorrow 的切换设计

目标：把游民服务的正式入口迁移到 `https://roamorrow.com/nomads`，保留两个项目独立部署。用户已授权先准备计划、再执行切换。

## 已核对的现状

- `cubxxw/RemoteAI-Nomads` 使用 Cloudflare Worker、静态资源、D1 和原生助手对象；正式地址为 `https://nomads.cubxxw.com`。
- `getyak/roamorrow` 的网页使用 Next.js 15，正式站在 Vercel。其根页面、`/zh`、`/app` 和既有城市体验页面继续由现项目提供。
- 两个主检出都有未提交资料，已记录状态、散列和 tracked patch；本次在各自独立 worktree 修改。
- 游民公开浏览有已审核静态副本，D1 健康与公开浏览可用性必须分别验收。

## 方案与边界

采用 Vercel 的外部 rewrite，把 `/nomads` 和 `/nomads/*` 转发到现有 Worker 的同名前缀。保留原域名作为上游，不修改 Roamorrow 的 DNS，不创建数据库、不重放数据初始化、不更改模型额度或费用套餐。

另外两种方式暂不采用：将整个游民项目搬入 Next.js 会扩大迁移范围；通过 Cloudflare 接管主站流量需要改变主站网络入口，增加回退成本。

Worker 增加挂载适配层：外部路径带 `/nomads`，内部业务路由继续使用 `/cities/`、`/api/agent/` 等现有路径。所有 HTML 链接、动态导航、图片、CSS、模块加载、地图、API 请求、canonical、结构化数据和 sitemap 必须使用正式挂载路径。外部 rewrite 保留查询参数、方法、正文、响应 Cookie 和流式响应。

Next.js 禁用自动去除尾斜杠，避免与游民页面现有补斜杠逻辑形成循环；主站已有入口另做回归。游民首页的公开地址统一为 `/nomads`；子页面继续沿用原来的目录尾斜杠。

助手请求按公开源站检查 Origin，并将匿名 Cookie 限制在 `/nomads/api/agent/`。不放宽跨站请求，不改变工具权限，不把会话或接口响应加入共享缓存。

Vercel 到 Cloudflare 的代理连接会改变 Cloudflare 看到的连接 IP。主站仅在助手 API 的 middleware 中，使用平台覆写的 `X-Forwarded-For` 生成带时间窗的 HMAC-SHA256 网络标识；Worker 验证后才用于原有网络额度。签名只证明网络来源，不授予会话或运维权限。窄用途密钥 `NOMADS_PROXY_SECRET` 只保存在两个服务的服务器端 Secret 中，不进入客户端、仓库或日志。未签名的直连旧站仍使用 Cloudflare 的真实连接 IP；任意未认证的转发头都不受信任。

## 旧地址与本机记录

先部署兼容版本，旧站保持正常服务；新入口验收后，再打开旧地址到新地址的一对一永久重定向。保留路径与查询参数，禁止把所有深链都跳到首页。

浏览器本机记录不能自动跨域。旧站保留一个不重定向、不索引的本机记录导出页；新站提供对应导入入口。迁移在用户浏览器内执行，只处理游民服务明确列出的本地键及已存在的可见聊天记录，不上传服务器、不复制 Cookie 或运行锁，不覆盖新站已有同名记录。

旧页面延迟加载的静态资源、地图数据和助手 API 继续在旧源提供，避免永久跳转破坏其同源限制。迁移白名单也包括经过校验的指南清单勾选进度。

## 切换顺序与回退

1. 保存线上发布版本、Vercel 当前部署和 Worker 配置；准备并测试新路径。
2. 发布兼容 Worker，暂不重定向旧站。确认旧入口可用，再发布主站 rewrite。
3. 在真实浏览器验证新入口的排行、过滤分享、国家与城市、比较、地图资源、助手状态和记录迁移页；检查主站原入口。
4. 验收通过后启用旧站永久跳转、更新 README 与公开链接、canonical 和 sitemap，核对线上 release。
5. 若出问题，先关闭旧站跳转，让旧入口恢复；再回退主站路由部署。没有数据库结构变化，数据库不需要恢复。

## 验收标准

- 新首页和代表性深链可用，查询参数与分享视角保留；资源和接口均处于 `/nomads`，没有跳转循环。
- 旧首页和城市深链分别永久跳到新地址；本机导出入口仍可打开。
- canonical、Open Graph、结构化数据和 sitemap 指向新地址；筛选页继续 noindex，真实 404 保持 404。
- 助手状态、同源拒绝、Cookie 路径及取消/流式传输通过测试；模型成功路径以真实请求结果报告，不由状态接口代替。
- D1 故障时只读副本继续有效，健康接口不伪装成功。
- Roamorrow 原首页、中文页、地图和已有城市页无回归；两个原检出的受保护文件散列保持不变。

## 官方依据

- Next.js 外部 rewrite：https://nextjs.org/docs/15/app/api-reference/config/next-config-js/rewrites
- Next.js 尾斜杠处理：https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware#advanced-middleware-flags
- Vercel 外部转发：https://vercel.com/docs/routing/rewrites
- Cloudflare 静态资源与 Worker 路由：https://developers.cloudflare.com/workers/static-assets/routing/worker-script/

搜索引擎收录与排名恢复不属于一次部署即可证明的结果；本次验收覆盖公开地址、抓取信号和实际使用路径。
