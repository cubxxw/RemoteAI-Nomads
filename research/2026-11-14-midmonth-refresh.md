# 十一月中旬复核账本

实际读取日：2026-11-14；对应11月15日半月复核，提前执行。十一月期号与历史排名保持原口径。[执行计划](../docs/superpowers/plans/2026-11-14-midmonth-refresh.md) · [验收与未完成项](../docs/verification/2026-11-14-midmonth-refresh.md)。

## 签证项目发现

本机成功读取两个公开JSON。Nomad Terminal共55条、53个不同国家代码，葡萄牙与泰国各有两个项目；WhereNext共43条、43个国家代码，共同代码41个。按国家代码比较只是发现范围，不表示项目同义，也不表示任一缺失项目已停办。

| 来源 | 本次读取与版本边界 |
| --- | --- |
| [Nomad Terminal JSON](https://nomadterminal.com/data/nomad-visa-tracker.json) | 55条；文件SHA256 `3dfd38d07116c67a5cc1ad007d6146dc11f5f0bf000d0f712f20ced72dfc9db9`；马来西亚条目仍依据9月28日核查的8月FAQ |
| [WhereNext JSON](https://getwherenext.com/api/data/digital-nomad-visas) | 43条；顶层更新日2026-09-06；文件SHA256 `3038779733985fe1dd262af94357a3e1a4c36d22ada94b18c2840f8abe97b2f0` |

Nomad Terminal单方包含AG、AR、AW、BM、BS、CV、DE、GD、GE、KY、MD、PH；WhereNext单方包含NA、VN。WhereNext的VN记录不能证明越南已经开放数字游民签证。两份聚合资料的马来西亚旧门槛与最长停留字段均不覆盖本次官方增强框架。

本轮用中文、英文、泰文搜索近期政策线索。新增马来西亚与越南线索已回到官方原文。两组定向X检索没有取得可用的新帖正文；不宣称读过社媒经历、图片、视频或评论，也不使用其补造现价。

## 新增政策与季节证据

| 来源ID与原文 | 实际读到的内容 | 对维护的影响 |
| --- | --- | --- |
| N1114-MY-TRANSITION：[MDEC公告](https://www.mdec.my/expats-announcements/enhanced-de-rantau-nomad-pass-framework-and-temporary-closure-of-new-application-submissions) | 2026-10-29正文；11月1–30日暂停新申请，计划12月1日恢复；符合条件首次续签仍处理 | 更新半岛长住候选与DE Rantau材料文章；不外推砂拉越独立项目 |
| N1114-MY-FRAMEWORK：[增强框架FAQ](https://www.mdec.my/api/media/file/Enhanced-DERantau-Pass%20Framework-FAQ-v1_%20NM.pdf) | 正文Q1–27；第1、3、5页另核渲染。12月起科技类新申请及续签年收入36,000美元，非科技类60,000美元；逐次获批最多合计4年。Q23限定过渡期首次续签 | 标明实施日与非自动批准；12月1日需重新读回平台恢复状态。未重读全部旧材料或重新判定沙巴地域条件 |
| N1114-VN-DRAFT：[越南政府报道](https://baochinhphu.vn/chinh-phu-trinh-quoc-hoi-co-che-chinh-sach-dac-thu-ve-phat-trien-du-lich-viet-nam-102261107090821648.htm) | 2026-11-07越文正文，政府向国会介绍草案；第11条包含远程工作受控试点 | 河内、岘港、会安补充草案限制；不新增可申请签证类别、费用或资格 |
| N1114-TH-SEASON：[泰国气象局11月至次年1月展望](https://www.tmd.go.th/media/climate/3-months/newsndj_2026_english.pdf) | 10月21日发布，第1页正文与渲染：北部转凉少雨，南部尤其东岸仍多雨 | 更新清迈与曼谷季节观察，兰塔不套用东岸具体条件；历史气候不改 |
| N1114-TH-WEEK：[七日预报](https://www.tmd.go.th/en/forecast/sevenday) | 11月13日发布的13–19日一期，读取正文、地区段落及Caution | 只作本次短期参考，11月20日后须重查，不写成长期稳定城市属性 |

菲律宾外交部[中国公民签证政策正文](https://evisa.gov.ph/page/policy)本次可读，14日指定机场通道及不可延期条件与11月1日记录一致，未改旧快照日期。尼泊尔使馆先返回页面框架，后续正文读取超时；本轮没有重新证明其落地签与就业细节，保留11月1日来源与日期。

## 住房、工位与营业季

| 来源ID与原文 | 11月14日公开条件 | 读取边界 |
| --- | --- | --- |
| N1114-BAANNOI：[清迈月租](https://www.baannoinornmuan.com/en/monthly-stay/) | 11–2月标准房15,000泰铢/月、较大房18,000泰铢/月；适合1–2人；水200泰铢/人/月、电8泰铢/度，清洁洗衣早餐另计，押金一月房租 | 与11月2日记录一致；不采用页面醒目的淡季12,500泰铢作为十一月价，未查日期库存或房间网络 |
| N1114-ENOSTA：[岘港工位](https://enostaspace.com/co-working/) | 日票110,000越南盾起、月票2,300,000越南盾起；平日8:00–18:30，周六8:00–17:00 | 与上轮报价一致；门店、税费及通话间另核，不承诺24小时 |
| N1114-GREEN：[岘港Villa](https://greenresidence.vn/villa/) | 单卧公寓最多2人，至少一月，约15,000,000越南盾/月起；网络与周清洁含，水电另付；入住付首月及一月押金 | 与上轮报价一致；最终价依入住日，未查房态、未实测 |
| N1114-KOHUB：[运营方首页](https://kohub.org/) | 显示开放，营业季每年11月1日至次年4月30日；列有通话间 | 只证明公开状态；未重读价格页，旧工位价格仍保留原日期，不声称有指定工位余位 |

根目录新增9条独立来源快照与3条有条件报价观察，旧来源不覆盖；城市完整月预算继续保留空值。网站的当季观察属于文字证据补充，不覆盖D1历史预算、评分或入境标签。

## 当前执行边界

本轮维护已有11月2日数据及上线记录，因此没有重新初始化公开库。主机运维暂停标记仍在，不新增全库消费采集、OSM重采、发布打包或浏览器测试进程。没有发现匹配Nomads/Cost/FX的本机LaunchAgent文件，不能据此断言不存在其他同步任务；消费试运行及增量审阅保留待执行，不声称11月15日月更已完成。云端全量月更和每日FX保持原状态。

Notion MCP返回不可用。浏览器成功读到关联数据页的“当前维护方式”“国内覆盖核查与采集顺序”及可见历史说明，后续未展开的公式或子数据库未读；主页仍只显示加载状态，不标为已分析。私人资料不复制进公开种子。

官网release与health初次普通HTTP读取返回403，网页工具也未取得内容；随后复用真实浏览器成功读取，两者均为200：release_id为`nomads-067c22e3eac1632b`，version_id为`21fa2efc-1d65-4b80-96b0-0a2956d58cdc`，health返回350城。这是本轮发布前的旧版本基线，不是新内容已上线的证据。当前工作目录及已有十一月工作目录均无生产配置，发布凭据与目标仍须恢复验证。构建、CI、合并、D1、网站、GSC各阶段以验收记录为准。
