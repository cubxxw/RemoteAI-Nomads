# RemoteAI Nomads · 开发说明

[正式网站](https://nomads.cubxxw.com/) · [给旅居者的项目首页](../README.md) · [部署与回退](docs/deployment.md)

网站提供城市排行、地图、城市预算与双城对比。服务端生成可直接阅读的 HTML，浏览器负责即时重排和交互；人工在 Notion 写描述，业务数据保存在 D1。

## 从公开数据开始

需要 Node.js 24 或更新的兼容版本。首次运行只安装开发依赖、重建公开数据和初始化本地 D1；不访问 Notion，不需要 Cloudflare 账号或模型密钥。

```sh
cd web
npm ci
npm run demo
```

打开 http://127.0.0.1:8787 。`demo` 依次执行公开种子引导、页面快照重建、本地迁移与初始化，最后启动预览。预览仅绑定本机地址，所有页面 noindex。

`data/public-catalog.json.gz` 随仓库提供，含 350 城、258 个国家与地区条目及已审核的消费观测。它不包含私人笔记、Notion 标识、草稿或运行日志。生成的 `.data/` 和 `.wrangler/` 均不提交。引导会拒绝覆盖未标记的已有数据；保留旧工作区，首次体验可另建一个克隆目录。

```sh
# 已完成首次初始化后
npm run dev

# 单独重建公开演示资料与页面
npm run data:bootstrap
npm run data:pages

# 自动测试与 Worker 打包检查；不会调用模型
npm run check
npm run build
```

种子初始化不能代替后续数据更新。现有数据的更新要先生成差异、复核范围，再导入；不要反复执行 `db:seed` 更新日常数据。

## 去哪里改

| 想改什么 | 入口 |
| --- | --- |
| 路由、服务端页面、只读数据查询 | `src/worker.js`、`src/render.js`、`src/rank-pages.js` |
| 排行、城市预算、地图和小狐界面 | `public/`、`public/modules/`、`src/agent-markup.js` |
| 数据表、约束、索引 | `migrations/`、[数据字典](docs/data-dictionary.md) |
| 原生 Flash 助手与工具 | `src/flash-runtime.js`、`agent/flash-agent.mjs`、`src/agent-tools.js` |
| 数据采集、公开种子与页面快照 | `scripts/`、[数据说明](data/README.md) |
| 设计、证据和已知限制 | [设计约定](design.md)、[验收入口](docs/verification.md) |

## 小狐与模型接入

全站右下角的小狐可打开、收起、检索历史、新建和继续对话。全文与草稿由当前浏览器的 IndexedDB 保存，可导出或删除；不会同步到账号和其他设备，清理浏览器数据后不能恢复。只有发送问题才请求模型，最近三轮问答会作为上下文发往服务端和模型供应商。

正式助手使用 **DeepSeek Flash + Workers 原生工具 + SQLite Durable Objects**。不需要云容器。模型可调用类型化的只读工具查城市、费用、月份、入境规则和来源，也能比较多组预算；没有任意 SQL、Shell 或写库权限。旧月消费是参考，报价样本不能被推成生活下限，签证入境与远程工作权限分开核对。

演示默认没有模型凭据，数据浏览和本地历史可正常使用；新提问会说明尚未接入。要部署原生助手，按[部署说明](docs/deployment.md)配置 Worker Secrets 和对象绑定，再做真实请求验收。DeepSeek API 按量收费，30 题评测也会产生费用，不包含在普通测试里。

```sh
# 配好服务端凭据后才运行；这些命令会真实调用模型
npm run evals
npm run evals:live -- --url https://你的部署域名
```

`npm run agent`、`agent/server.mjs` 与 `deploy/Dockerfile` 保留为早期本机 DSH 对照，不是正式网站的前置依赖；`.dev.vars.example` 仅供该对照使用。原生 Flash 的证据与边界见 [flash-verification.md](docs/flash-verification.md)，小狐交互与本地记录见 [companion-design.md](docs/companion-design.md)。自动通过率不能当作用户满意度，也没有证据宣布所有体验达到 98 分。

## 数据与公开范围

224 城具备完整六项历史评分；350 城有真实照片与缩略图，342 城有坐标，158 城有 2023–2025 年历史气候。没有把缺失值补成零分，也没有把历史气候当作天气预报。

消费观测覆盖 CostCompass 的 155 城与日本 e-Stat 全国单身家庭统计，保留各自口径、币种和日期。家庭统计不能当作东京游客房租；ECB 汇率也是参考价。采集与每月 15 日更新入口见[消费来源说明](docs/cost-sources.md)，全量云端月更目前未启用。

Notion 普通页面可用于人工写描述。`scripts/import-notion-text.py` 只导出指定页面的候选资料，不跟随子页、不写 Notion、不自动发布；旧数据库、私人导入包与原始笔记不随源码提供。旧的导入和采集脚本为维护者工具，新电脑运行演示不需要重跑。

照片来源、作者和许可见 [CREDITS.md](CREDITS.md) 与 `scripts/photos.json`；公开数据的来源记录也保留在种子中。代码采用 MIT，外部资料不因此变为 MIT。

## 部署与维护

复制 `wrangler.production.example.jsonc` 为 `wrangler.production.jsonc`，填入自己的账号、D1 和域名。实际部署配置、密钥、私人导入和评测产物都被忽略，不能提交；现有网站维护者继续使用自己的本机配置。

生产只读取已发布资料。发布前从公开数据库重建页面快照，D1 读取受限时仍可浏览已发布内容；AI 需要真实查询，不会拿静态文字假装完成回答。URL 中的筛选、未审核对比和薄内容保留 noindex，已上线不等于已被搜索引擎收录。

GitHub 自动检查会从公开种子重建资料，运行测试并打包，不持有生产密钥，也不会自动发布。[正式部署与回退](docs/deployment.md)说明资源、发布版本核对及费用边界。
