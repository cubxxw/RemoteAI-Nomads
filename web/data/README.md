# 公开演示数据

`public-catalog.json.gz` 是正式网站已审核发布资料的可复现种子。新克隆通过 `npm run data:bootstrap` 生成本机 SQLite、发布报告和 D1 初始化 SQL，不需要私人 Notion 导出。

种子保存表结构、公开记录、来源、原币金额和检查散列。18 张公开表有资料，私人映射与运行表只有空结构；引导验证发布状态、外键、计数和隐私边界，并拒绝默默覆盖已有未标记数据。`npm run data:pages` 再重建与该数据库对应的公开页面。

这是一个有日期的快照，不是实时价格服务。资料原有的观测日、覆盖范围和不确定性继续保留；重建日期不会变成来源的新核读日。后续价格更新使用单独的采集与复核流程。

代码的 MIT 许可不覆盖外部数据。各条资料以 `sources` 记录的来源和许可为准；历史未统一口径的估算只用于提示，不能当最低成本或当日可订报价。城市照片另见 [署名记录](../CREDITS.md)。

维护者只有在公开库通过审阅后，才运行 `node scripts/export-public-seed.mjs` 更新种子；禁止从私人开发库或原始 Notion 导出生成公开种子。更新后要在空工作区引导、重建全部页面并运行测试。

## OpenStreetMap 场所快照

`osm-community.json`保存同一5公里半径的共享办公和咖啡馆计数，`public/places/`保留逐城地点、来源标识和采集日期。`osm-coverage.json`列出本批覆盖与缺口。2026-10-19已采集314城；28城请求失败，8城缺少坐标，未补为零。访问网站不会自动批量采集。

维护命令为`npm run places:sync`，已有快照默认跳过；可用`-- --slugs=xiamen --batch=1`仅补单城。上游错误保留原数据，429/406后至少等待30秒。地点数据来自[OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，适用ODbL；咖啡馆标注不证明允许办公，地图漏标也不等于当地没有。
