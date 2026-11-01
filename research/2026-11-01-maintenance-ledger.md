# 2026-11-01 半月维护来源账本

本轮准备十一月推荐，排名使用既有公开350城快照、推荐月份标签与相同排序逻辑；不新增城市、不改历史预算或六项评分。JSON编辑日与来源读取日分开。

## 签证项目发现

实际读取公开JSON：Nomad Terminal 55条、53个ISO代码；WhereNext 43条、43个代码。WhereNext介绍页仍写42国，实际API返回43条，以本次返回范围记录，不把页面覆盖数字当签证政策。

| 来源 | 本轮读取 | 来源版本 | 校验散列 SHA-256 |
|---|---|---|---|
| [nomad-terminal](https://nomadterminal.com/data/nomad-visa-tracker.json) | 2026-11-01 | 逐条checked，不统一刷新 | `3dfd38d07116c67a5cc1ad007d6146dc11f5f0bf000d0f712f20ced72dfc9db9` |
| [wherenext](https://getwherenext.com/api/data/digital-nomad-visas) | 2026-11-01 | 2026-09-06 | `c1133bed6e274d6d7e1f649094a449ac81f55b4f5ec1d410fc623716ee453f3e` |

按国家代码比较，Nomad Terminal独有：AG, AR, AW, BM, BS, CV, DE, GD, GE, KY, MD, PH；WhereNext独有：NA, VN。这只是覆盖差异；路线合并、替代通道、已关闭项目和无专用项目的记录口径不同，不推定缺失项目已经停办。两者仅用于发现，不把其金额和合法工作结论覆盖进现行城市数据。原响应只留本机忽略目录；归属分别为[Nomad Terminal](https://nomadterminal.com/visas/)与[WhereNext](https://getwherenext.com/data)，原创建字段按各自许可使用。

## 本轮官方依据

- 泰国：重读[驻泰使馆2026-09-02正文](https://th.china-embassy.gov.cn/zgqz/1w1/202609/t20260902_12014754.html)及[泰国驻华使馆说明](https://thaiembbeij.org/th/news/updateofvisaexemption/)，适用中国普通护照旅游、探亲等；单次30日、180日累计90日与工作签证分别判断。并非本月新出台政策。
- 泰国气象局：读取[2026年10–12月展望及附件前两页](https://www.tmd.go.th/forecast/threemonthcontentcountry/092026-112028)，发布日期2026-09-30；十一月北部与曼谷区域预测雨量减少，仍偏热。短期警报、山区与街区状况另查，不把区域预测写成清迈实测。
- 巴厘岛：读取[登巴萨市政府2026-09-28说明](https://kominfostatistik.denpasarkota.go.id/berita/musim-hujan-bali-2026-2027-diprediksi-dimulai-november)，11月15%分区、12月85%分区预计开始雨季，未取得乌布街区最新降雨或住房受淹结论。
- 尼泊尔：读取[驻华使馆签证正文](https://cn.nepalembassy.gov.np/pages/visa/)；中国公民旅游落地签和免签证费，不等同免签入境，旅游签禁止就业。读取[旅游局博卡拉秋季说明](https://ntb.gov.np/en/the-beauty-of-pokhara-in-autumn)，只证明9–11月季节窗口，不保证当天山路、航班和能见度。
- 菲律宾：读取[外交部签证政策中国公民段](https://evisa.gov.ph/page/policy)，14日旅游/商务免签不能延期或转换，入境仅限马尼拉及宿务指定机场；不把碧瑶历史月成本写作可免签住满一个月。
- 日本：读取[外交部2026-03-26提醒](https://www.mfa.gov.cn/wjbzwfwpt/kzx/aqtx/202603/t20260326_11881693.html)，本期继续排除。其余既有风险记录保留原核查日，未冒充完成全目录风险审查。

以上读取日均为2026-11-01。根目录新增快照`N1101-TH-CLIMATE`、`N1101-TH-ENTRY`与`N1101-BALI-RAIN`，对应清迈、曼谷、乌布；旧来源及费用日期保留。网站观察存于[十一月JSON](../web/data/seasonal-2026-11.json)，与[本期指南](../guides/seasonal-2026-11.md)对应。网站D1预算、分数和公开种子未改，不需远程写库。

## 读取边界与待核

本轮Notion MCP返回工具不可用；只读浏览器成功读取项目主页和Data维护说明及国内覆盖段，实际读取日2026-11-01。其现行方法以网站D1为准；旧Notion批次和公式作为迁移历史，后续十城是待调研范围。未逐城展开历史数据库，不复制私人原文或标识进入公开资料。

中文、英文及泰语检索用于发现官方材料；公开X定向检索未取得可确认正文，不新增X已读记录。没有重新读取小红书、Reddit正文、现价或工位现场体验。十月资料保持原日期；其他新入榜城市只用目录数值，不造体验短评。完整月预算继续未知或沿用历史口径。15日消费受控同步不在本次1日任务中提前重跑，未启用新Cron或付费服务。

本轮网站发布与PR合并分别验收；是否已上线以本地发布回执与真实域名读回为准，本账本本身不证明上线或搜索引擎收录。
