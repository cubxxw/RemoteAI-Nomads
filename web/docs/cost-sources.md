# 消费数据接入

城市消费现在保留为有来源、有日期、有单位的单项样本；现有城市预算与 Metric Score 保持独立。它们不能混成一个完整月预算。

国内目的地的覆盖盘点、官方食品价格与统计年鉴，以及只读采集原型，见[国内数据源调研与接入设计](china-data-sources-2026-10-18.md)。该调研之后的发布加入北京、广州，并导入大理州8项历史食品监测和大理市2项居民年度统计；地域与单位独立保存，原月预算和评分未变。

## 当前已实际导入的范围

2026-10-18 本地 D1 实际读取结果：CostCompass 的 250 座来源城市中，156 座与本地城市及国家唯一匹配，153 座有有效样本，共 4,587 条单项。另有日本全国单身家庭的 15 条月均支出类别，以及 ECB 的 29 个币种参考汇率。来源没有覆盖的城市和类别保留缺失。

原始响应、响应摘要和导入结果写在忽略版本控制的 `.data/costs/`。`last-sync.json` 包含来源 URL、文件散列、匹配与未匹配清单、实际新增行数，以及原有城市预算和评分的前后核对结果。这是本地导入证据；不表示已发布到线上。

同日再次真实访问来源并同步，三路新增均为 0；原预算与评分逐项未变，数据库完整性及外键检查通过。独立本地 Worker 也完成了公开 e-Stat 下载、解压和解析，返回 15 项、年平均表集计户数 646、消费月均 173,042 日元。12 项回归检查覆盖城市身份、单位、重复导入、更正历史、汇率日期、家庭范围、Excel 解析、来源故障、完整数据规模的数据库调用预算，以及住房与统计层级口径。

## CostCompass

使用 [官方开放数据说明](https://costcompass.net/data) 提供的 [城市清单](https://costcompass.net/data/cities.json) 与 [单项价格 CSV](https://costcompass.net/data/prices.csv)，每次同步共两个来源请求。开放数据许可为 CC BY 4.0，回答或展示数据时应署名 CostCompass，并链接对应城市页。每条观察通过原 `sources` 表提供这个链接。

开放文件只收录其认定符合条件的实时采集价格，未收录的价格包括静态表格、部分外卖报价和没有合格来源的项目。**网站月总价包含未开放的价格，因此本实现不导入月总价或价格指数**。例如只得到鞋价和汽油价，不能把两者相加称为一个月生活费。

匹配必须同时符合国家 ISO2，以及城市 slug 或英文名；只规范拼写、重音和少数同城别名。巴厘岛不会替代乌布，某国首都不会替代该国其他城市，同名城市必须同国且唯一。

单项保留金额、美元币种、原单位、样本数量、最早和最新观察日期、价格范围、原采集机构名、数据文件地址、城市页和许可。单个报价会显示 `single_observation`；租金明确是挂牌价、入住人数未知、未验证短租。异常租金保留 `review` 标记。缺失食品或水电样本不会用其他城市补齐，也不会把商品单价推算为月支出。

## 日本 e-Stat

从 [e-Stat 家计调查单身家庭年表](https://www.e-stat.go.jp/stat-search/files?cycle=7&layout=dataset&page=1&tclass1=000000330001&tclass2=000000330022&tclass3=000000330023&tclass4val=0&toukei=00200561&tstat=000000330001) 查找上一年公开的第1表，下载官方 Excel；若该年未发布，查前一年。严格核对年份、单身家庭、每户每月收支表题、日元单位和单身家庭实数列后才写入。工作簿解析只读取字符串与首张数据表，限制响应及解压大小，不执行公式或宏。

本次实际下载的是 [2025 年第1表](https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040409815&fileKind=0)，年平均表单身家庭列的「集計世帯数」为 646，消费月均 173,042 日元，食料 44,659 日元，住房 21,667 日元。646 是该表的集计户数，不是日本单身家庭总数，也不能解释为全年只有 646 个不同家庭受访。观察范围始终是 `national`，`city_id` 为空，`household_size=1`。食料包含外食，交通通信包含交通与通信；子项有明确标记，不能重复相加。

这是日本全国居民家庭的实际支出，含自有住房家庭；**房租项只计实际支付的租房、租间家租，不计自有住房的归属家租**。这是统计局 [Q&A F-5、H-2(2)](https://www.stat.go.jp/data/kakei/qa-1.html) 明确区分家计调查与国民经济核算的口径。因此住房均值既不是租客平均房租，也不是东京或大阪的市场报价，不能用作短住游民预算。[官方定义](https://www.stat.go.jp/data/kakei/kaisetsu.html) 还说明税金、社会保险费属于非消费支出，不能假定已包含在消费总额内。

`readCityCosts().methodology` 保存实际支付口径、集计户数含义、总额与分类层级及方法来源 ID。读回时为每个全国观察补充 `aggregation_role` 和 `parent_field`，不改原始观察、金额、观察日期或散列。15 项中只有 10 个上层分类可用于分类合计；外食、家租地租、交通和通信 4 项各自已含在父项内，不能再加一次，总消费也不能再与分类相加。实际发布总额为 173,042 日元，10 个分类原值合计为 173,043 日元，保留这 1 日元差额，不改原值强行调平。总消费减住房得到的 151,375 日元仅是全国非住房消费对照，不是最低生活预算。

方法来源以 `estat:methodology:` 开头，与原始表格来源一起通过 `sources` 返回。方法页面核读日固定为 2026-10-18，后续价格同步不刷新这一核读日期。方法补充只新增来源记录；城市页的费用口径及来源区会展示相同说明与官方链接。

2026-10-18 这次方法补充的实际增量是 2 条官方来源，三路价格观察新增均为 0。东京实际页面响应已包含实际支付、不计归属家租及两个方法链接；完整读回记录在 `.data/costs/methodology-proof.json`。原有预算、评分、4,587 条城市观察及15条全国观察保持不变。

[e-Stat 注册 API](https://www.e-stat.go.jp/api/) 需要用户注册和 appId。本实现已使用无需账号的官方公开文件完成导入，无需填入凭据；不会声称使用了尚未配置的注册 API。

## 汇率

`syncFx(env)` 直接获取 [ECB 官方 XML](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml)，保留原始欧元锚点、发布时间和来源。人民币、美元、日元等交叉换算只能使用同一个 ECB 发布日的数据。例如人民币换美元为 `EURUSD / EURCNY`。实际导入的发布日是 2026-10-16。

`readFxRate(env, base, quote)` 只读取本地已导入数据，返回 `rate`、`date`、`source_id`、`age_days` 和 `stale`。超过 7 天会标记过期；缺失币种或没有共同日期时返回 `null`，不会使用固定汇率。ECB 是参考价，具体支付仍可能包含手续费与汇差。[ECB 发布口径](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)

上层可接入两个计划：每月15日调用 `syncCosts(env)`，每日调用 `syncFx(env)`。**全量月更不能据此认定可在免费 Worker 上运行**，下面列出了查询和 CPU 两个独立边界。受控 Node 定时器可调用本地导入命令；Worker 路径还需要合适的执行额度、来源连通性、实际部署及触发器验收。本模块不会创建应用提醒。

## Cloudflare 执行边界

[D1 免费额度](https://developers.cloudflare.com/d1/platform/limits/) 每个 Worker 调用最多 50 条数据库查询，`batch` 中每条 SQL 也计算在内。来源现在按 URL 批量预载和注册；观察以字典压缩的 JSON 元组分块，通过 `json_each` 的单条 `INSERT SELECT` 还原并写入，保留原内容散列。每个 JSON 绑定最多 90,000 个 UTF-8 字节，每行仍受该上限约束；SQL 只有约 1.9 KB，远低于 100 KB SQL 限制，绑定数也低于 100。

对实际保存的来源响应和完整城市目录计数，首次全量成本、e-Stat、ECB 加同步记录共 **29 条 SQL**，重复为 **23 条**。改造前同样负载分别为 5,102 和 4,792 条。首次仍写入 4,587 条城市报价、15 条日本全国参考、29 条汇率，重复新增均为 0。计数包括批量操作中的语句；来源注册没有逐城查询。记录见 `.data/costs/query-budget-before.json` 和 `query-budget-after.json`。

[Workers 免费 CPU 限制](https://developers.cloudflare.com/workers/platform/limits/#cpu-time) 对 HTTP 和 Cron 都是 10 ms。独立本地 workerd 的两次 V8 采样中，纯同步 CSV 解析本身约 31.8–52.3 ms；这是本地采样估计，**不是线上计费 CPU**，也不能据本地运行成功证明免费 Cron 可用。全量抓取、校验、散列与编码应由受控 Node 定时器或有足够 CPU 的执行环境承担。

本地 workerd 与真实 D1 绑定已经完成两路公开成本源的全量导入。该环境直接请求 ECB 时出现内部网络错误，Node 实际来源同步正常；这一连通性差异仍需在目标执行环境验证。失败会写入来源状态，保留旧观察，不会伪造新汇率或刷新观察日期。

为单独验证全部批量 SQL 在 D1 绑定中的兼容性，还运行了 CC/e-Stat 现场抓取、ECB 官方已保存响应回放的组合：首次共 29 条 SQL，实际写入 4,587 + 15 + 29 条，每个 JSON 参数最大 89,985 字节。该结果证明本地 D1 写入兼容性，未证明 ECB 在目标 Worker 中实时可达。响应及采样摘要分别在 `.data/costs/workerd-full-fixture-result.json` 和 `workerd-full-fixture-profile-summary.json`。

## 本地运行与读取

```sh
# 真实访问来源，在内存副本中验证导入，真实 D1 不写入
node scripts/sync-costs.mjs

# 迁移并导入本地 D1；不操作远端数据库
node scripts/sync-costs.mjs --apply

# 仅更新本地汇率
node scripts/sync-costs.mjs --apply --fx-only

# 回归验证
node --test tests/cost-data.test.js
```

`readCityCosts(env, cityId, { currency: 'CNY' })` 返回 `observations`、兼容原 `sources` 表的 `sources`、原币到目标币的 `fx`、实际覆盖 `coverage`、最新来源同步状态 `sync_status` 和口径说明。每条观察同时保留原金额和可用的 `conversion`；`reference_total` 固定为 `null`。找不到城市时返回 `null`。

所有观察使用内容散列去重，重复读取相同源数据不会新增观察，价格更正会另存新行。读取时按来源、城市和项目挑最新观察。每个来源分别记录同步状态；来源失败时保留旧观察，并通过最新同步记录暴露失败。不会修改原 `cities.budget_*`、`city_scores`、签证资料或运营方工位报价。

来源标题使用“公开单项报价样本”，不暗示本站实测。既有 CostCompass URL 只批量修正发布者、标题、许可这三个来源元数据字段；既有来源 ID、首次访问日期、观察金额、观察日期和内容散列保留。
