# 数据模型与编辑流程

## 推荐结构

Notion 只承担人工文本：品牌叙事、城市体验、推荐理由、对比文章、编辑手记。国家、城市、价格、政策、来源、审核状态、关联、检索全部由 D1 负责。现有 Notion Countries / Cities 仅用于本次一次性迁移；不再扩字段、创建新数据库或要求长期双写。

Notion 首页下只需要普通文档：「品牌与写作」「城市体验」「对比与指南」「编辑手记」。正文用自然语言和来源链接，不让人手填数据库键、时间戳、单位或 JSON。私人 Notes 不在导出允许列表。

人工长文通过明确指定 page_id 导入为 content_documents 的候选版本；保留原文、哈希、来源页与导入时间。AI 提取事实到候选观测，不把原文直接覆盖成结构化判断。正文发布资格和审核状态存在 D1 的 editorial_pages，不由 Notion 的属性驱动。首版只实现指定文档的本地候选导入，不建立定时双向同步。

## D1 表与关联

国家 countries → 城市 cities → city_months / workspace_quotes。国家另外关联 ai_availability / visa_programs / metric_observations。所有来源性记录引用 sources；metric_definitions 解释单位与范围。visa_observations 保留 Nomad Terminal、WhereNext 的各自原文，不按国家名强行合并多个方案。

editorial_pages 与 editorial_cities 连接比较/指南和城市。import_runs 保存文件哈希与导入统计。notion_links 保存 page_id 与本地稳定键，独立于公开内容。城市 slug 稳定且唯一，国家使用 ISO2；XK 为旅行目录扩展码，历史争议地区使用 legacy: 前缀，不伪造 ISO 标准。Puerto Rico 重复 Notion 页映射到同一个地理实体，但保留两条外部关联。

核心条件使用专门字段：成本金额/币种/口径/来源日期，签证资金门槛与月收入门槛分开。统计观测采用定义表 + 数值观测表，因为指标会持续增加。无来源、缺失、过时、冲突分别表达，不用 0 代替空值。

## AI 最顺手的输入与输出

输入采用稳定 ID + 结构化 JSON；日期 ISO 8601，金额数值与币种分列，枚举固定英文值。AI 只能提交候选观测：entity_id、field、value、unit、source_url、source_published_at、checked_at、scope、confidence、reason；confidence 是候选判断，不能变成官方正确率。不得把抓取日期覆盖政策生效日。

流程：读取允许字段 → 记录来源及哈希 → 校验类型和外键 → 比较差异 → 将有变化的建议设为 Review → 编辑确认 → 导出 Published 白名单。首批导入按外部 ID 幂等插入；重复导入跳过既有记录。后续更新应生成差异供审核，不能直接覆盖。人工文字永不由自动采集覆盖；AI 不自动改 Published、Notes 或私人页面正文。冲突保留双方证据，禁止最后一条覆盖。运行时网页没有 Notion 凭证，也没有 AI 发布端点。

首版实现本地批次导入与 Notion 普通文档候选导入；定时抓取、在线 AI 工作流与生产自动发布属于后续运营接线，不假装已经在后台运行。

## 内容与 SEO 运营

首要页面：/cities/、/cities/{slug}/、/countries/{code}/、/compare/{a}-vs-{b}/、/guides/{slug}/。比较 A/B 按 slug 排序统一 URL；未选定的城市组合可使用但 noindex。筛选页 canonical 指向城市目录且 noindex。404 返回真实 404，缺失项不造空壳排名页。

优先主题：「清迈还是槟城，冬季住一个月」「岘港还是清迈，先看出发月份」「里斯本与第比利斯，预算和时区怎么取舍」。每篇至少有明确人群、共同预算口径、季节差异、限制、数据日期与一段独立编辑结论。现有内容为待审样稿；只有 Published 内容进入正式 sitemap。不得通过上万自动对比页制造规模化薄内容。

## D1 容量与费用

2026-10-17 核对 Cloudflare 官方文档：Free 账户 5 GB 总存储、单库 500 MB、10 个数据库、每日 500 万行读取与 10 万行写入。计费按扫描行数，索引很重要；Workers 调用另有额度。图片和全文快照不进入 D1，图片用静态资源/CDN，原始抓取保留离线或未来 R2。数据观测表使用 country/metric/year 索引，城市使用 region/cost 索引，公开页边缘缓存 5 分钟。不要为了「5 GB」从一开始分十个库。

来源：https://developers.cloudflare.com/d1/platform/limits/ 、https://developers.cloudflare.com/d1/platform/pricing/ 、https://developers.google.com/crawling/docs/faceted-navigation 。

## 排行版：数据与渲染职责

新增五张业务表，总计20张。`score_models` 固定公式版本、默认权重和最高分；`city_scores` 保存六项可空指标与原始分；`city_entry_conditions` 将大陆护照标签从分数中分离；`city_locations` 保存同国家匹配的坐标和时区；`city_climate_months` 保存指定历史区间的逐月温度与雨量。每个事实保留来源和资料状态，不把旧资料升级成实时核验。

这是348城的一次性排行投影。数据初始化可重跑，但 `INSERT OR REPLACE` 仅用于本地首批投影，不能直接接定时任务覆盖编辑结果。若后续采集新版本，仍要生成候选差异并审核。score_models 可承载新版本；本版 city_scores 是每城当前模型，不是假装已经实现完整历史版本仓库。

默认分原样使用原 Metric Score，六项完整的224城参与默认排名。自定义权重按加权均值×1.05保留0–10.5范围，任一正权重项缺失则暂不评分；零权重项可以为空。社区很强/有社区/小众安静分别映射10/4/0。大陆护照只筛选、不计分。气候环境是旧 Environment（含污染），与独立温度分开显示。

首页与 `/cities/` 服务端输出首批40行，canonical统一为根路径。浏览器一次取得允许字段，滑块、筛选和地图不再访问数据库。前后端共用排序与URL模块；逐月数据用紧凑数组传输，公开API仍用可读字段名。无效URL有边界，历史记录按完成一次操作写入。动态行复用节点，FLIP从当前呈现位置中断续接；焦点单独保留。搜索显示值不被trim覆盖，中文组合输入完成后才查询。

地图轮廓是本地 Natural Earth；位置来自 GeoNames 与同国家唯一匹配的补充地理查询。9个无法准确落点的目的地保留空值，包括复合目的地与岛屿，不冒充城市中心。历史气候取ERA5 2023–2025逐日重分析：温度按有效日平均，雨量按同月三年总量平均；这是短期历史窗口，不能称30年气候常态或未来预报。当前UTC按日聚合；当地日界线差异会带来小偏差。采集缓存原始响应，碰到429停止新增请求，不绕过限流。

手机首屏折叠通过CSS直接呈现，避免模块加载后布局跳动。地区、预算、签证各自可见；地图有44px城市选择器，密集点可以准确选择。比较按每项已知数值标注优势，持平、未知和签证不判赢家。城市详情提供六指标、逐月温度/雨量与来源；详细表格只在容器内滚动。

生产仍由 publication_status/status 白名单控制。348城目前全部draft。Notion不参与运行时、排序、筛选或状态管理，本轮没有修改Notion。


## 原生助手与早期对照

正式网站使用 DeepSeek Flash + Workers 原生工具 + SQLite Durable Objects；当前运行与会话边界见[部署说明](deployment.md)及[小狐设计](companion-design.md)。下面记录早期 DSH 对照的实现和限额，不能作为当前生产配置。消费来源的现状以 [cost-sources.md](cost-sources.md) 为准。

### 早期 DSH 与消费观察

原20张业务表新增cost_sync_runs、cost_observations和fx_rates，共23张。消费观察按来源、城市/全国范围、项目、单位、样本期、质量和内容散列保存，不覆盖原预算与MetricScore。详情页和Agent复用readCityCosts/readFxRate；全国单身家庭统计不冒充城市房租。

网页通过同站Worker网关发起DSH请求，会话绑定HttpOnly身份。Node服务以readOnly读取实际本地D1；部署可用受认证工具桥。17类领域工具加内部finish_plan提交草稿；模型自由解题，不再由固定报告模板改写正文。原生提交、引用归属、证据快照、派生预算与分离的反证核验共同检查事实边界；同DeepSeek模型核验仍有语义漏判，见实际评测。本地可选Codex事实编辑，修订作为新提案重新核验，部署默认不依赖本机CLI。

规划最多12次DSH模型请求、核验最多6次请求/独立CLI调用，工具20次，整体120秒。CLI内部请求重试不等同单次供应商请求，实际usage单列，不把两家用量合成DeepSeek用量。停止/断连/完成等待进程清理；准入前已断连不会启动后续任务。普通日志不记录问题、正文、核验主张或隐藏推理；有意运行的评测保留完整证据。可信本地评测每日450次；普通每身份12次/小时、40次/日，每来源网络24次/小时，全局50次/日，保持不变。

预算状态使用version=1的原始金额/周期快照，随同当前页面对话传入下一题。只改天数默认保留原住宿分配，不自动把余款重新分配。多情景工具输出条件可行域与未核实住宿方向；不是全城消费枚举或行情下限。消费结果单列旧参考是否存在、城市住房样本及非穷举范围，避免把默认未加载读作不存在。

消费月更已配置应用内本地月度任务，每月15日10:15运行已验证Node脚本。D1批量写入在首次29/重复23次SQL内；纯CSV解析31.8–52.3ms，无法宣称满足Free Worker 10ms CPU。默认Worker仅配置每日ECB触发，尚未部署；有充足CPU环境才可选配月度成本触发。数据脚本、实际来源与平台限制见cost-sources.md。

城市页使用独立city-page/city-ui模块呈现真实价格、可编辑预算、月份图表和按日期的会议时差。来源与政策原文按需展开。未审核数据仍为draft，预览noindex；这些实现均不表示已公开发布。
