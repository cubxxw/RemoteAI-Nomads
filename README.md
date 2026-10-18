# RemoteAI Nomads

帮中文远程工作者选一座能好好生活、也能安心工作的城市。

**[打开城市排行 →](https://nomads.cubxxw.com/)** · [两座城市怎么选](https://nomads.cubxxw.com/compare/) · [出发前先读](https://nomads.cubxxw.com/guides/)

## 先缩小到几个选择

以下是 2026 年 10–12 月的出发起点，适合先试住一周，再决定是否住一个月。季节是历史规律，出发当天仍要核对天气和街区现状。

| 你想解决的问题 | 可以先看 | 决定前确认一件事 |
| --- | --- | --- |
| 按中国时间上班，少改作息 | [吉隆坡](https://nomads.cubxxw.com/cities/kuala-lumpur/) | 与中国同一时区；从房门到工位的通勤是否舒服。 |
| 秋天住在有烟火气的城市 | [河内](https://nomads.cubxxw.com/cities/hanoi/) | 10–11 月可先比较；房间噪音要在工作时段确认。 |
| 找固定工位，慢慢认识同伴 | [清迈](https://nomads.cubxxw.com/cities/chiang-mai/) | 11–12 月优先；先问住处和工位现状，长住前查空气质量。 |
| 英语环境，吃饭和日常方便 | [槟城](https://nomads.cubxxw.com/cities/penang/) | 看清住处到工位的步行路线，下雨时也能走。 |
| 接近欧洲团队的工作时间 | [拉斯帕尔马斯](https://nomads.cubxxw.com/cities/las-palmas/) | 先落实适用签证和住房，再决定停留时间。 |

[更完整的目的地笔记](guides/destination-notes.md)保留街区、工位报价和出处。想去兰塔岛，注意 [KoHub 的运营季从 11 月 1 日开始](https://kohub.org/)；越南中部秋冬出行先看[官方气候说明](https://vietnam.travel/things-to-do/weather-and-climate-vietnam)，雨季与河内不同。

## 按自己的条件看排行

[省钱优先](https://nomads.cubxxw.com/?w=20,55,10,10,5,5) · [冬天避寒](https://nomads.cubxxw.com/?month=1&warm=1&w=20,20,40,10,10,5) · [先看亚洲](https://nomads.cubxxw.com/?region=%E4%BA%9A%E6%B4%B2) · [清迈与槟城逐项比较](https://nomads.cubxxw.com/compare/chiang-mai-vs-penang/)

网站打开就是排行。可以调权重，按月份看历史气候，点地图找到城市；筛选保存在链接里，直接发给同行的人。

花费先拆成住房、吃饭、交通和工位，再加往返机票与应急金。城市页支持自己填单价、换币种和算天数。**页面上的旧月消费是参考，不是最低生活成本，也不是今天能订到的报价。**

右下角的「小狐旅伴」可以帮你继续追问。比如：“一月去中国境内，2000 元含住宿，住 15 天，能怎么安排？”把天数和是否包含往返交通说清，更容易算出有用的方案。对话保存在当前浏览器，可继续、导出或删除；发送后问题会交给 DeepSeek Flash 处理，试用受当日额度限制。

## 订整月之前，先过一个真实工作日

1. 首周选可取消的住宿，确认房间安静、上传稳定，手机热点能备用。
2. 在计划开会的时段试工位，问清通话间、夜间权限和停电安排。
3. 按自己的护照与工作方式查入境条件；**免签入境不等于允许远程工作。**

[怎么选第一个基地](guides/choose-a-base.md) · [入境与远程工作](guides/entry-and-work.md) · [国内社区](guides/china-communities.md)

## 这些资料能说明什么

目前收录 **348 座城市、258 个国家与地区条目**，其中 224 城有完整的六项历史评分。目录覆盖不等于每个地方都已研究透彻，缺失数据会留空。城市照片为真实照片，许可与作者见[署名记录](web/CREDITS.md)。

旧评分与历史气候分开保存，第三方消费样本和人工经验也分别记录。CostCompass 单项报价与日本 e-Stat 家庭统计保留各自范围，不能直接当作某城市的游客房租。全量消费的云端月更尚未启用。

[数据与方法](https://nomads.cubxxw.com/about/) · [消费来源说明](web/docs/cost-sources.md) · [来源账本](research/2026-10-14-source-ledger.md) · [可复用的编辑资料](data/README.md)

## 想改进它，或自己运行

发现价格失效、城市信息有误，欢迎[提一个问题](https://github.com/cubxxw/RemoteAI-Nomads/issues/new)；请带上日期和公开来源。[如何补充经验](CONTRIBUTING.md)。

网站使用 Cloudflare Workers + D1；助手调用 DeepSeek Flash，不需要云容器。网页与数据库可在[免费额度](https://developers.cloudflare.com/d1/platform/pricing/)内运行，模型调用按量收费。Notion 只留给人写描述和编辑手记。

```sh
cd web
npm ci
npm run demo
```

需要 Node.js 24 或更新的兼容版本。演示使用随仓库提供的公开数据，不需要 Notion 账号或模型密钥；AI 接入另行配置。打开 [本地网站](http://127.0.0.1:8787)。

[开发与本地运行](web/README.md) · [设计约定](web/design.md) · [部署与回退](web/docs/deployment.md) · [测试与已知边界](web/docs/verification.md)

代码采用 [MIT 许可](LICENSE)。照片与外部数据遵循各自许可，代码许可不覆盖它们。
