# 正式部署与维护

当前网站：https://nomads.cubxxw.com 。网页、图片和远程 D1 已上线；原生 Flash 助手已开放试用，全量消费云端月更仍未启用。

## 首次配置

复制 `wrangler.production.example.jsonc` 为 `wrangler.production.jsonc`，创建自己的 D1 后填入账号、数据库标识和域名。真实配置被忽略，密钥通过 Worker Secrets 设置。公开演示从 `npm run data:bootstrap` 开始，不需要本节资源。首次建立正式库时，只在空库上应用迁移和公开种子；已有库先备份并生成更新差异，禁止再次整库初始化。

## 已建立的资源

| 资源 | 正式配置 |
| --- | --- |
| Cloudflare 账号 | 维护者本机配置；源码仅提供示例 |
| 网页 Worker | `remoteai-nomads` |
| 自定义域名 | `nomads.cubxxw.com`，Cloudflare 自动管理 HTTPS |
| D1 | `remoteai-nomads-production` |
| 正式配置 | `wrangler.production.jsonc` |
| 助手运行时 | `NOMAD_AGENT` 原生对象，与网页共用 `wrangler.production.jsonc` |

没有修改 cubxxw.com 主站，也没有使用其他网站的数据库。当前从维护者工作区直接发布。GitHub 自动执行公开数据重建、测试和打包，不持有部署密钥，也不会自动更新正式网站。

## 公开数据

`scripts/prepare-release.py --origin https://nomads.cubxxw.com` 从只读本地数据库生成独立发布快照。输出 `.data/release/` 被 Git 忽略，不会覆盖本地资料。

公开快照包括 350 城、258 个国家与地区、4,622 条城市及全国消费观测，另有10条区域参考观察。Notion 页面标识被移除，城市 ID 改为稳定 slug；原私人来源以公开方法页说明其历史、无法独立核验的状态。私人笔记、Notion 映射、原始导入记录、候选文章和评测记录不进入发布库。原始消费基线及评分没有被月更报价覆盖。

首批导入已完成。`.data/release/initial-publication.sql` 是首次初始化文件，**不要再次对正式数据库执行**。后续更新先备份，再生成差异；迁移只通过 migrations 目录执行。

## 日常发布

在 web 目录执行，使用 Node 24 或更新的兼容版本：

```sh
npm ci --registry=https://registry.npmjs.org
npm run check
npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
node scripts/release-manifest.mjs --native-agent
npx wrangler deploy --config wrangler.production.jsonc
```

发布工具根据实际配置的 `SITE_ORIGIN` 生成 canonical 与站点地图；公开种子的原始发布来源另行保留，不会被改成你的站点。线上评测必须显式指定自己的域名，脚本不会默认向原站发送密钥。

`/release.json` 的 release_id 必须与 `.data/deploy/manifest.json` 一致，version_id 应与发布输出一致。`/healthz` 实查 D1，而非固定返回成功。HTML 边缘缓存包含 release_id，发布后不复用旧版本 HTML。过滤结果、404 和私人接口不写入共享 HTML 缓存。

至少在实际浏览器核验：排行预设与 URL、手机菜单、城市预算/月份、对比页月份、指南、真实图片和不存在的 URL。生产 canonical 使用正式域名；筛选页和薄内容保留 noindex。网站地图发布成功不等于搜索引擎已收录。

## 原生 Flash 助手

当前采用 Workers + D1 + DeepSeek API。模型固定为官方 `deepseek-flash`，规划开启 low 思考，事实核对关闭额外思考。没有将模型切回 Pro，也没有部署容器或开通 Workers Paid。

SQLite Durable Objects 属于 Workers 免费版可用组件，用于匿名会话的活动任务、取消与少量追踪状态。城市数据仍在 D1。每次工具调用通过私有的独立对象请求执行，以免整段模型对话共用免费版每次 invocation 的 50 条 D1 查询额度。模型只有 17 类只读工具；没有任意 SQL、Shell、写库和私人 Notion 读取能力。

发布顺序：

```sh
node scripts/configure-agent-secrets.mjs --native
node scripts/release-manifest.mjs --stage-native-agent
npx wrangler deploy --config wrangler.production.jsonc
npm run evals:live -- --url https://你的部署域名
node scripts/check-flash-live.mjs --url https://你的部署域名
```

`--stage-native-agent` 保持公开入口关闭。运维请求携带服务器端桥接密钥才能验收；不能把这个密钥写进网页、URL 或公共日志。通过验收后，使用 `node scripts/release-manifest.mjs --native-agent` 再发布以开放入口。

模型密钥和桥接密钥经标准输入上传到 Worker Secrets。本机私有副本位于 `.data/deploy/agent-secrets.json`，权限 0600；不要提交该文件、`.dev.vars`、Wrangler 凭据或个人登录资料。普通会话不需要、也不应得到这些密钥。

当前限制为全站滚动 24 小时 20 次公开提问、单会话每小时 4 次且每天 10 次、同来源网络每小时 8 次。D1 中网络标识经过带密钥的摘要处理。单次最多 12 次规划、6 次核验、20 次真实工具读取、180 秒；另有按新输入、缓存输入和输出加权的后续请求软限额。这些都不等于固定金额的账单上限。模型使用 DeepSeek 账户按量计费；Workers、D1 和 Durable Objects 的免费额度需分别观察，不能承诺永久零费用。

任务停止或断连会中止模型请求，并在提交后续数据库查询前检查取消；已提交给 D1 的查询可能正常完成，不能承诺回滚已提交的读取。兼容字段 `runtime_reaped` 在原生实现中表示主执行及其模型请求已经关闭，不表示存在或回收了容器进程。普通追踪不保存用户问题、答案或推理内容；完整证据只在当前对象内存及主动运行的本机评测记录中可用。服务器追踪保留约一小时。小狐对话全文、可见依据、预算选择和草稿由浏览器 IndexedDB 保存在本机，不同步到账号或其他设备；支持导出、删除与撤销。查看历史、打开或收起小狐均不调用模型；明确发送问题才请求模型，并附上当前会话最近三轮完整问答。清理浏览器数据会删除本机记录。

`npm run evals` 使用真实 Flash API 和只读的公开数据库快照运行 30 题；`npm run evals:live` 对实际线上 D1 与助手重跑同一题集，并核对测试前后发布版本没有变化。成对反例使用 `npm run evals:semantics`，它是受控材料测试，不冒充完整用户路径。旧 DSH 的成绩只作为历史记录，不计入原生版本成绩。同一模型核验通过也不等于所有语义事实都正确。

### 定时同步边界

本次原生 AI 发布不自动启用全量消费同步 Cron。既有消费月更脚本和本地任务保留；云端月更还需要分批处理与首次运行验收，不能把“可用定时器”当成已经月更成功。每日 FX 云端更新也未开启。原生模式的发布参数不会悄悄开启旧容器模式的 Cron。

### 历史 DSH 路径

`deploy/Dockerfile`、`deploy/wrangler.agent.example.jsonc` 与 `npm run agent` 保留用于本机 DSH 对照；它们不是当前正式 AI 后台。旧容器方案仍需对应套餐和授权，不是原生 Flash 助手的前置条件。不要运行旧 `--with-agent` / `--stage-agent` 参数替代原生发布参数。

## 备份与回退

```sh
npx wrangler d1 export DB --remote --config wrangler.production.jsonc --output .data/deploy/production-backup.sql
chmod 600 .data/deploy/production-backup.sql
npx wrangler deployments list --config wrangler.production.jsonc
npx wrangler rollback <已验证的版本ID> --config wrangler.production.jsonc
```

备份日志可能包含短期下载链接，也应仅本机保存。网页回退不回退 D1；数据库恢复必须先核对备份和迁移兼容性，不能通过重跑初始化 SQL 代替恢复。

若只需暂停公开助手，设置 `PUBLIC_AGENT=false`，重新生成发布标识并发布网页；保留原生对象绑定和迁移历史，避免误删状态对象。该做法保留排行和城市页可用。操作后重新验证 `/release.json` 与实际网页。

## 证据位置

`.data/deploy/` 保存本轮发布输出、远程数据库回读、生产依赖扫描、浏览器核验、版本清单和私有备份。它们是本机证据，不作为公共静态资源。部署没有承诺审美 98 分或 Agent 95 分；质量评分仍需在实际线上能力可用后独立评估。

### 公开浏览兜底与本机历史

`release-manifest.mjs` 会先执行 `build-public-pages.mjs`，从审核后的 `.data/release/published.sqlite` 和 `publication.json` 重建 `public/published-pages/`，再计算发布标识。必须先准备最新公开发布快照；不得改用私人预览库。构建检查published状态、排除表、Notion标识、私密路径及凭据形文本，生成失败不会覆盖旧产物或继续发布。

D1故障时，Worker只为预发布清单中的浏览页面与排行JSON提供只读副本；两城比较可用公开排行数据即时渲染。响应带 `X-Data-Mode: published-snapshot` 和副本日期；该日期是公开数据库文件日期，原始来源与采价日期保持在正文中。数据库健康读取失败时保持503，不会以备用页面伪装正常；count探针成功也不等于AI新提问可用。AI新问答不走静态兜底。副本资产直接路径不索引，真实页面保持canonical和查询页noindex。

2026-10-18遇到账号D1免费日读取额度耗尽，服务方提示UTC午夜重置。已实测公开浏览兜底和本机历史可用；线上新问答成功路径仍需额度重置后复核。本轮真实Flash回答与取消使用本机只读公开快照完成，不能混同为线上D1成功验收。

## 国内资料接入（2026-10-19）

本批大陆目录14个目的地，新增北京、广州及获授权的城市照片。国内筛选和明确的国内城市搜索保留未评分地点，排在有分数的城市之后；预算、月份及安全排除条件仍生效，不用缺失值补分。

`0005_regional_references.sql`增加区域、目的地归属及区域观察。大理州8项食品监测的采样期为2026年6月1—7日；大理市2项统计为2024年居民年度支出。年鉴2025年编辑，具体出版日未标明。网页和Agent按地域、单位与原始日期分别读取；既有预算和分数不受导入影响。

`import-china-references.mjs`验证本机缓存散列并产生待审SQL；`prepare-china-release.mjs`同时准备公开快照和增量补丁，支持`--source=PATH`指定变更前的只读发布库。它们针对本批已核读资料，尚不支持发现最新周报，也未新增自动采集调度。公开种子与页面副本同步包含新表和新城市。

D1普通迁移查询因账号日读取额度耗尽返回7500。本次先备份，再通过官方文件导入执行增量结构与数据补丁，并登记迁移版本；不重放整库初始化。文件导入返回成功不代表普通查询或线上AI恢复，另用导出回读及线上请求分别验证。
