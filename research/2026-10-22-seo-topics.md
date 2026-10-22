# 2026-10-22 SEO 专题四篇：来源、口径与复查账本

[返回首页](../README.md) · [实现计划](../docs/superpowers/plans/2026-10-22-seo-topics.md) · [50篇发布顺序](../docs/editorial/seo-50-article-plan.md)

本账本记录四篇专题（`november-nomad-destinations`、`monthly-budget-5000`、`beijing-time-remote-work`、`chinese-passport-long-stay`）的取材范围、来源ID、日期口径、配图复用与中文复查。**本轮没有新拍摄、新下载媒体，也没有把网页全文存入仓库。**

## 取回与复用的范围

| 类别 | 本轮取回（2026-10-22） | 复用既有核读 |
|---|---|---|
| 气候 | 无新取回 | 公开数据种子 `web/data/public-catalog.json.gz` 的 `city_climate_months` 11月行（2023–2025 ERA5 聚合，核读2026-10-17） |
| 运营方报价 | BAANNOI 月住页、RealSpace 价目页正文核读（2026-10-22），保留原币与适用限制 | 清迈指南内同两页的2026-10-19核读记录保留不改 |
| 官方政策 | 中国驻马使馆FAQ、泰国驻英使馆DTV页、MDEC项目页与Remote Worker清单（核读2026-10-22） | 清迈指南内TH-VISA/TH-DTV旧记录保留不改 |
| 时区 | 无新取回 | IANA Time Zone Database 正文核读（2026-10-22） |
| 气象预报入口 | 只登记越南、泰国、中国官方预报入口URL | 未读取任何具体预报正文，页面标注“待核链接” |

本轮已核读MDEC Remote Worker两页PDF、IANA说明页、BAANNOI、RealSpace、使馆及DTV页面。气候与既有预算保留原数据日期，编辑日期不替代观察日期。

## 来源ID与日期口径

- 11月气候（保留公开种子原始来源ID）：清迈 `6c1cdd135d1e334465bf`、河内 `ccbb456220faf7786bb6`、大理 `cfe39aed9296a46ce199`、槟城 `72e780f18780354acdc5`、岘港 `265eb5db3e082ea3f4bd`；均为 Open-Meteo archive API 的 ERA5 2023-01-01–2025-12-31 月度聚合（日均温、日最高温均值、月降水）。**三年聚合，不是气候常年值，不是预报。**
- 11月数值：清迈24.79/30.54/54.33、河内22.49/26.63/45.87、大理13.22/19.49/59.40、槟城27.54/30.95/505.70、岘港25.33/26.85/483.10（°C/°C/mm）。
- BAANNOI（核读2026-10-22，`https://www.baannoinornmuan.com/en/monthly-stay/`）：Garden/standard house约44㎡，3–10月12,500泰铢/月、11–2月15,000泰铢/月；水电、押金另计。15,000−12,500=2,500泰铢只代表同一间房的旺季差价。
- RealSpace（核读2026-10-22，`https://realspacecm.com/`）：日票300泰铢、共享月票4,000泰铢、每日09:00–24:00；无独立网速实测，税费与月票起算日未确认。11月反例：15,000+4,000=19,000泰铢，未含吃饭与水电。
- 中国驻马来西亚使馆FAQ（发布2025-08-01，核读2026-10-22）：普通护照有效期≥6个月、每次≤30天、180天内累计≤90天、居留/就业/留学/媒体不在协议范围。30天≠30晚。
- 泰国驻英使馆DTV页（更新2026-09-08，核读2026-10-22）：DTV1 Workcation，5年多次、每次180天、可延期一次最长180天（移民官裁量）。伦敦领区材料与费用不作中国内地清单；本批文章不列费用。
- MDEC项目页（核读2026-10-22）正文简略；Remote Worker清单PDF（核读2026-10-22）要求外国雇主、合同与收入证明、雇佣关系在申请前已开始至少3个月，并提供最近3个月的薪资单、护照14个月有效期与6页空白页。不复述收入门槛数字，不承诺审批。
- 城市预算沿用各指南既有口径（totalKind=planning-estimate），**保留各自核价日与汇率日，不按今日汇率重算**：博卡拉66,000 NPR（核价2026-10-20/汇率2026-10-20）、巴库1,030 AZN（2026-10-21/2026-10-21）、大理5,700 CNY（2026-10-20/2026-10-19）、清迈28,900 THB（2026-10-19/2026-10-16，住房参照仅3–10月）、河内26,000,000 VND（2026-10-21/2026-10-21）。
- 5000元示例账单（住房2000+餐饮1500+交通300+日用200+机动500=4500，留500）为编辑设定假设，正文已标明非城市报价。

## 时区换算与运行环境

- 计算方式：`web/public/modules/city-ui.js` 的 `meetingTime`（Intl.DateTimeFormat + IANA 区名，按具体日期推算），固定日期2026-11-16与2027-07-15，北京09:00与18:00两个端点。
- 运行时：Node v24.19.0（IANA tz 2026b、ICU 78.3）。
- 公开数据种子地点时区ID（`city_locations.timezone`）：大理Asia/Shanghai、槟城Asia/Kuala_Lumpur、吉隆坡Asia/Kuala_Lumpur、乌布Asia/Makassar、清迈Asia/Bangkok、河内Asia/Bangkok、博卡拉Asia/Kathmandu、巴库Asia/Baku、里斯本Europe/Lisbon、马德里Europe/Madrid。**河内在种子中存为Asia/Bangkok（与Asia/Ho_Chi_Minh同为UTC+7，换算结果一致）；文章表格用Asia/Ho_Chi_Minh标注并在此记录差异。**
- 结果：UTC+8四城09:00–18:00（两日同）；清迈/河内08:00–17:00（两日同）；博卡拉06:45–15:45（两日同）；巴库05:00–14:00（两日同）；里斯本11月01:00–10:00、7月02:00–11:00；马德里11月02:00–11:00、7月03:00–12:00。换算只是钟表换算，不是工作许可，也不是实测工位体验。

## 配图复用与指纹

四篇均复用已发布城市指南中已授权的真实照片，未新拍摄、未新下载：

| 专题 | 照片 | 作者 / 许可 | 社交卡（字节副本） |
|---|---|---|---|
| november-nomad-destinations | 还剑湖与湖岸街道（2008） | Vyacheslav Argenberg，CC BY 4.0，Commons原图与授权页 | `og-topic-november.webp`，sha256 481c1f51…33e3c1（= hanoi-hoan-kiem.webp） |
| monthly-budget-5000 | 大理古城北门（2019） | David Stanley，CC BY 2.0，Commons原图与授权页 | `og-topic-budget-5000.webp`，sha256 25fe8ad2…4f17a5（= dali-north-gate.webp） |
| beijing-time-remote-work | 里斯本28路电车（2012） | Ввласенко，CC BY-SA 4.0，Commons原图与授权页 | `og-topic-beijing-time.webp`，sha256 e745c2aa…6684ed（= lisbon-tram.webp） |
| chinese-passport-long-stay | 吉隆坡单轨Imbi–Hang Tuah（2014） | CEphoto / Uwe Aranas，CC BY-SA 3.0，Commons原图与授权页 | `og-topic-passport.webp`，sha256 04266521…23447b2（= kuala-lumpur-kl-monorail-imbi-hang-tuah.webp） |

社交卡为原图字节副本（sha256与原图一致），只改文件名，未加任何预算文字图形；复用非新采，原图版权与许可继续适用。清迈宁曼街景（Setawut，CC BY 4.0）在11月篇内文使用。完整文件指纹见 `web/content/city-guides/publication.json`。

## 中文去AI味与体例复查

- 按CONTRIBUTING要求做最小检查：事实、限定词、引用保留；每条数字旁给口径或限制，无“必去/绝美/开启旅程”式套话。
- 无第一人称虚构入住经历；示例账单、编辑预留与假设均显式标注。
- 不引用或模仿在世作者的独特文风；结构借鉴普通解释型生活服务稿（先说适合谁→一张账或一次换算→有条件的建议→停）。
- 不做排名、不给法律/税务意见、不承诺审批、不给费用表；不确定项保留“待询/待核/未实测”。

## 构建口径变化

- `web/scripts/build-city-guides.mjs`：`config.kind='topic'` 的专题源要求 `checkedOn` 与来源表，允许缺少 `fx`（报告 `fxDate:null`）；预算指南仍要求 `fx.date`。
- `web/data/article-catalog.json`：新增可选布尔 `topic` 校验；指南索引单列“旅居专题”分区。
- `web/src/rank-pages.js`：首页排行新增紧凑选题入口，数据库与公开快照同渲染。
- `web/content/city-guides/preview.css`：追加原生 `<details>` 章节导航样式（无JavaScript时目录仍可用），publication.json 同步更新该资产指纹。

## 范围与后续验收

未写生产D1、未重新生成公开数据种子、未改README与月度季节数据、未新增依赖、未下载媒体、未提交或发布。天气预报入口未读正文，页面保留“待核链接”标注。

## 定稿修正与阅读检查

- 修正BAANNOI“未公布水电/押金”的错误表述：原页列有历史水费200泰铢/人/月、电费8泰铢/单位及标准房押金12,500泰铢；当前合同仍需重新确认。
- 修正5000元判定：住房、餐饮、工位、交通、日用与机动预留全部计入；大理默认工位费用为0，不再建议从这里省700元。
- 四篇表格整理为两列，日期和限定条件紧挨数值；删去正文中的实现标识与重复免责声明，保留JSON中的原始数据。
- 写法参考[大理办公观察](https://sspai.com/post/72208)与[旅居开发记录](https://sspai.com/post/100284)的具体工作日细节和叙事结构（本轮已读）；不引用其旧报价、场所状态或第一人称经历作为当前事实。
