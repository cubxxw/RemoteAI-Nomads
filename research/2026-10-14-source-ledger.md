# 2026-10-14 社交来源与核读账本

> 2026-10-23 整合说明：本账本保留原采集与编辑记录；其中“首页／README”的城市卡现位于[目的地笔记](../guides/destination-notes.md)。项目首页已承接网站入口与生成的季节推荐，本次路径迁移不刷新来源日期。

[旅居指南](../guides/destination-notes.md) · [项目首页](../README.md) · [结构化来源](../data/sources-2026-10-14.json) · [城市数据](../data/destinations.json)

本轮取回 47 篇 Reddit 详情（46 篇含正文，Sarajevo 一篇主帖为空），38 条 X 发布文字，40 条 Threads 记录（含一条登录态补读），12 条 Instagram Reel 发布文案。**数量是采集覆盖，不能理解为同样多的真实体验或全部评论精读。**

Reddit 核读与问题有关的正文；清迈长报告选读住房、工位、街区和季节。其他提问可用于发现需求，不能作为已入住证明。X 与 Threads 先筛选，再精读入选原帖。Instagram 只读发布文字与一帖可见评论，没有完整口播转录。未读部分逐条保留。

旧一轮的评论证据保留 2026-10-07 日期，本轮批量取回主帖不等于重新看过评论。当前网页搜索得到的回复仅按实际可见部分使用。浏览器登录后重点读了曼谷社交、清迈晚间办公和搬家日常三条；晚间办公贴读到置顶及可见关键回复，未展开所有34条。

## 本次改变推荐的证据

- 泰北当前预报与洪水周报：清迈建议先试住和核房，不承诺10月已全面进入晴朗凉季。岘港10月洪水与山茶半岛暂停观光报道：本月海滨默认推荐降级。
- KoHub的11月1日开门公告：兰塔岛从11月起推荐，10月不宣传现成办公社区。
- 清迈预算帖15项合计USD1985，作者总额写USD2185；只作算术反例。
- X回复确认Ubud USD300为熟客优惠的一居bungalow，不能作为公开市场房价。
- Threads晚间工位与曼谷社群讨论：办公权限、同伴的实际连接方式放回首页。
- Instagram低价文案缺租期或只是预算情景，2023长住视频的文字没有2026现价；均不进入预算基准。

## TikHub 调用与费用

先读取当日OpenAPI、账号状态及端点价目，复用本地受限鉴权助手。本轮10次付费请求：2次Reddit大批量详情、2次Reddit评论、2次X搜索、1次X回复、2次Threads搜索、1次Instagram Reels搜索。大批量详情每次USD0.025，X/Reddit评论每次USD0.001，Threads与Instagram此次搜索每次USD0.002。合计USD0.061，账号余额下降USD0.061相符。没有翻页、充值或购买套餐。

来源JSON只存干净原帖URL、公开作者、时间、中文摘要与读取边界；完整API响应、媒体链接、鉴权与账号信息留在本地，不上传。公开资料的保存不等于可全文转载，本库只给短摘要与原文入口。

## Reddit

| ID / 来源 | 发布或核读日期 | 实际范围 | 采用与边界 |
|---|---|---|---|
| [R-1vkj3jw](https://www.reddit.com/r/digitalnomad/comments/1vkj3jw/asia_spot_for_octobernovember/) | 2026-08-10T12:12:21.377000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | 秋季选址提问；自身没有入住报告。 |
| [R-1wioyrv](https://www.reddit.com/r/digitalnomad/comments/1wioyrv/where_to_stay_in_october_in_south_east_asia/) | 2026-09-17T09:16:52.840000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；TOP首页有文字评论已读，未翻页 | 初次旅居者比较曼谷、清迈和岘港；TOP首页7条有文字评论用于季节与政策反证。 |
| [R-1n2gg8j](https://www.reddit.com/r/digitalnomad/comments/1n2gg8j/want_to_spend_octoberapril_over_in_asia_any_way/) | 2025-08-28T16:08:37.620000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 阳光与雨季的需求提问，不能作为价格或网络证明。 |
| [R-1vqmfmf](https://www.reddit.com/r/DaNang/comments/1vqmfmf/question_for_rainy_season/) | 2026-08-17T08:27:01.095000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | 雨季换城提问，公开搜索可见部分亲历回复；不采用签证跑关建议。 |
| [R-1wextdr](https://www.reddit.com/r/digitalnomad/comments/1wextdr/visiting_chiang_mai_early_october/) | 2026-09-13T04:30:41.425000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | 初秋清迈住宿提问；搜索可见老城/Nimman偏好分歧。 |
| [R-1w5m3dn](https://www.reddit.com/r/DaNang/comments/1w5m3dn/is_early_october_a_no_go_in_da_nang/) | 2026-09-02T20:26:17.776000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | 岘港10月天气提问；公开搜索可见雨季体验，与当月报道交叉核。 |
| [R-1g5lgqk](https://www.reddit.com/r/digitalnomad/comments/1g5lgqk/winter_escape_da_nang_chiang_mai_or_bali_need/) | 2024-10-17T07:35:36.249000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | 冬季长住比较；公开搜索可见焚烧季与阴雨反例。 |
| [R-1wdanv3](https://www.reddit.com/r/digitalnomad/comments/1wdanv3/i_got_fed_up_and_compiled_a_calendar_index_to/) | 2026-09-11T08:51:50.062000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 作者推广自制季节评分；未取得可验证数据，不采用83/100等分数。 |
| [R-1knefot](https://www.reddit.com/r/digitalnomad/comments/1knefot/what_i_actually_spend_living_in_chiang_mai_as_a/) | 2025-05-15T17:43:25.234000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；TOP首页有文字评论已读，未翻页 | 预算声称USD2185，所列15项合计USD1985；品牌提及与租金争议，排除成本基准。 |
| [R-1w597j6](https://www.reddit.com/r/digitalnomad/comments/1w597j6/chiang_mai_alternatives/) | 2026-09-02T12:40:33.327000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 老城酒店USD14/晚、住两个月；单一咖啡馆形成稳定社交。 |
| [R-1peh2dn](https://www.reddit.com/r/digitalnomad/comments/1peh2dn/where_are_you_at_and_what_are_the_prices/) | 2025-12-05T00:44:03.210000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 2025年12月清迈Nimman与Buenos Aires一居室均报USD1050/月；不是当前报价。 |
| [R-1ua0o04](https://www.reddit.com/r/chiangmai/comments/1ua0o04/where_to_stay_in_thailand_as_digital_nomad/) | 2026-06-19T12:27:34.574000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | 夜间工作需求；公开搜索可见Yellow会员24h使用个案，非全城网络保证。 |
| [R-1ie9ooc](https://www.reddit.com/r/digitalnomad/comments/1ie9ooc/trip_report_chiang_mai_2025_update_still_a_lot_to/) | 2025-01-31T07:39:46.072000+0000 | 长文选读住房、街区、办公和季节；未通读全部餐饮与游玩条目；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | 长文选读住房、街区、工位与季节；Nimman航线噪音、旺季满员与空气质量分歧。 |
| [R-1pn871t](https://www.reddit.com/r/digitalnomad/comments/1pn871t/chiang_mai_overhyped/) | 2025-12-15T14:06:31.137000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 提问或一般线索，未用于城市成本和稳定性结论。 |
| [R-1w8qyql](https://www.reddit.com/r/digitalnomad/comments/1w8qyql/why_so_many_nomads_go_to_bali/) | 2026-09-06T08:59:05.386000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | Bali价值讨论；社区需求与拥堵/价格争议并存。 |
| [R-1ttwqwj](https://www.reddit.com/r/digitalnomad/comments/1ttwqwj/remote_job_offer_of_44850_a_year_thinking_of/) | 2026-06-01T16:03:16.733000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 提问或一般线索，未用于城市成本和稳定性结论。 |
| [R-1scfepj](https://www.reddit.com/r/digitalnomad/comments/1scfepj/how_are_the_costs_currently_in_bali/) | 2026-04-04T17:35:51.614000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | Bali租金评论混用房型且有人追问币种；不生成统一预算。 |
| [R-1tzl36f](https://www.reddit.com/r/digitalnomad/comments/1tzl36f/whats_really_attractive_about_tbilisis_in_georgia/) | 2026-06-07T19:11:12.777000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | Tbilisi生活吸引力提问；其他护照的一年免签不能用于中国护照。 |
| [R-1vrukq5](https://www.reddit.com/r/digitalnomad/comments/1vrukq5/looking_for_my_first_digital_nomad_base/) | 2026-08-18T16:41:59.096000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 提问或一般线索，未用于城市成本和稳定性结论。 |
| [R-1q0w7nx](https://www.reddit.com/r/digitalnomad/comments/1q0w7nx/digital_nomads_monthly_megathread_january_2026/) | 2026-01-01T05:01:20.449000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 提问或一般线索，未用于城市成本和稳定性结论。 |
| [R-1kic8aj](https://www.reddit.com/r/digitalnomad/comments/1kic8aj/trip_report_10_weeks_in_da_nang_vietnam/) | 2025-05-09T06:55:17.955000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 十周Mỹ An一居室USD800/月，网络好但找房、霉味与噪音问题，作者不愿再旅居。 |
| [R-1q31zyd](https://www.reddit.com/r/DaNang/comments/1q31zyd/is_constructionnoise_exclusively_a_da_nang/) | 2026-01-03T18:26:23.425000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | 不同建筑和街区的噪音差异；公开搜索可见评论，非全城结论。 |
| [R-1dierjg](https://www.reddit.com/r/digitalnomad/comments/1dierjg/whats_the_ideal_annual_digital_nomad_travel/) | 2024-06-18T01:30:30.258000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | 年度季节路线提问；天气与空气质量需要分开判断。 |
| [R-1elrifb](https://www.reddit.com/r/digitalnomad/comments/1elrifb/which_cities_in_vietnam_are_best_to_live_in_for/) | 2024-08-06T19:58:25.624000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；公开网页或搜索返回的部分关键评论已读，未展开全部回复 | 越南秋季城市选择问题；搜索可见河内11月居住体验。 |
| [R-194zq72](https://www.reddit.com/r/digitalnomad/comments/194zq72/how_is_life_in_malaysia_for_a_digital_nomad/) | 2024-01-12T16:53:51.389000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 提问或一般线索，未用于城市成本和稳定性结论。 |
| [R-1ukc4ud](https://www.reddit.com/r/digitalnomad/comments/1ukc4ud/digital_nomads_monthly_megathread_july_2026/) | 2026-07-01T05:00:25.084000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 提问或一般线索，未用于城市成本和稳定性结论。 |
| [R-1dt0y7a](https://www.reddit.com/r/digitalnomad/comments/1dt0y7a/3_months_in_malaysiasea_with_family/) | 2024-07-01T18:57:41.981000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | 家庭选址需求；海滩与市区日常不应混用，评论细节沿用10月7日账本。 |
| [R-1qg6doj](https://www.reddit.com/r/digitalnomad/comments/1qg6doj/working_remotely_from_thailand_for_a_few_weeks/) | 2026-01-18T11:34:12.562000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 作者更新实际工作行程，KoHub体验较好，曼谷酒店Wi-Fi依赖手机备线，频繁转场太赶。 |
| [R-1vsjrbk](https://www.reddit.com/r/digitalnomad/comments/1vsjrbk/whats_your_experience_with_working_in_laos/) | 2026-08-19T11:30:16.906000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | 远程桌面延迟需求；正文中的避税推断不采用；评论经验沿用旧账本。 |
| [R-1n0yygi](https://www.reddit.com/r/digitalnomad/comments/1n0yygi/travel_and_working_in_laos_and_sri_lanka/) | 2025-08-26T21:47:36.346000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | 老挝/Sri Lanka工作提问；停电和酒店网络评论沿用旧账本。 |
| [R-1uo51f9](https://www.reddit.com/r/dumaguete/comments/1uo51f9/work_from_home_friendly_po_ba_sa_dumaguete/) | 2026-07-05T15:28:38.178000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | 本地人询问停电与发电机；评论设施建议沿用旧账本。 |
| [R-1vhwax8](https://www.reddit.com/r/SiargaoPH/comments/1vhwax8/anyone_here_working_remotely_from_siargao/) | 2026-08-07T09:57:09.043000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | 8小时工作与会议需求；长期居民/短住住客分歧见10月7日已读评论。 |
| [R-yeru57](https://www.reddit.com/gallery/yeru57) | 2022-10-27T13:21:33.468000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 2022年一个月旅居报告，湖景生活、工位通勤、吸烟及咖啡馆低速；旧租金不作现价。 |
| [R-wgvde0](https://www.reddit.com/gallery/wgvde0) | 2022-08-05T13:22:01.251000+0000 | API详情成功，但主帖正文为空；本轮未重新读取作者评论长文；评论判断沿用2026-10-07来源账本，本轮不称已重读 | 本次主帖正文为空；原作者长文在评论，不能把批量详情成功当作重新精读。 |
| [R-1ubnvpi](https://www.reddit.com/r/digitalnomad/comments/1ubnvpi/anyone_currently_in_albania_looking_for_community/) | 2026-06-21T11:38:50.590000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | Tirana住一周仍没找到工作同伴，社交不自动发生；评论反例沿用旧账本。 |
| [R-1s1vdmq](https://www.reddit.com/r/digitalnomad/comments/1s1vdmq/albania_cost_of_living/) | 2026-03-23T22:12:02.444000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | 居住成本提问，旧账本评论有不同租期口径，不能给统一总预算。 |
| [R-1pactei](https://www.reddit.com/r/digitalnomad/comments/1pactei/las_palmas_gran_canaria_social_scene/) | 2025-11-30T08:00:49.616000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | Las Palmas社交提问；既有长住回复见10月7日账本。 |
| [R-1qnfn6a](https://www.reddit.com/r/digitalnomad/comments/1qnfn6a/where_are_all_the_nomads_in_madeira/) | 2026-01-26T13:12:13.236000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | Madeira两周感到社区冷清的自报；不同体验与后续回复见旧账本。 |
| [R-1s6urwm](https://www.reddit.com/r/digitalnomad/comments/1s6urwm/taghazout_for_a_month/) | 2026-03-29T13:14:07.574000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | Taghazout长住办公提问；咖啡馆限制来自旧账本已读评论。 |
| [R-123owjv](https://www.reddit.com/r/digitalnomad/comments/123owjv/report_dning_in_morocco/) | 2023-03-27T14:42:39.892000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 2023年摩洛哥跨城市长文，SunDesk社区、Noqta高峰问题；不使用旧SIM价格或安全泛化。 |
| [R-1e5t3ss](https://www.reddit.com/r/digitalnomad/comments/1e5t3ss/brazil_and_sa_cities_i_stayed_in/) | 2024-07-17T20:55:13.685000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | 2024年南美城市旅居报告，主帖不含可比旅行活动开销；旧价格与主观评分不作现价。 |
| [R-1i04jfi](https://www.reddit.com/r/digitalnomad/comments/1i04jfi/looking_for_a_new_destination/) | 2025-01-13T03:08:15.830000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 2025年1月Floripa满意月租低于EUR1000难找的旺季反例。 |
| [R-1j2qb0y](https://www.reddit.com/r/digitalnomad/comments/1j2qb0y/best_place_to_digital_nomad_apriljune/) | 2025-03-03T18:57:10.041000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 提问或一般线索，未用于城市成本和稳定性结论。 |
| [R-1hy0xwf](https://www.reddit.com/r/digitalnomad/comments/1hy0xwf/cusco_and_arequipa_wifi/) | 2025-01-10T09:46:07.414000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | 高频会议者询Cusco/Arequipa网络；旧账本明确回复仅指Cusco，不能移植。 |
| [R-1uiyzsn](https://www.reddit.com/r/digitalnomad/comments/1uiyzsn/is_cuenca_ecuador_a_good_place_to_lock_in/) | 2026-06-29T17:27:18.501000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | Cuenca专注生活问题；居民体验、噪音和高原分歧见旧账本。 |
| [R-1gdhzzk](https://www.reddit.com/r/digitalnomad/comments/1gdhzzk/looking_for_a_month_get_a_way_with_great_internet/) | 2024-10-27T18:42:31.638000+0000 | API取回正文，核读旅居相关段落；未看图片或视频 | 2024年厄瓜多尔停电亲历、发电机柴油担忧；不推为2026供电现状。 |
| [R-1iehgml](https://www.reddit.com/r/digitalnomad/comments/1iehgml/thinking_of_moving_to_buenos_aires_as_a_digital/) | 2025-01-31T15:35:49.751000+0000 | API取回正文，核读旅居相关段落；未看图片或视频；评论判断沿用2026-10-07来源账本，本轮不称已重读 | 2025年Buenos Aires餐费与短租上涨自报；币种与长期居民反例分别保留。 |

## X

| ID / 来源 | 发布或核读日期 | 实际范围 | 采用与边界 |
|---|---|---|---|
| [X-2102054171465981996](https://x.com/RVAClassic/status/2102054171465981996) | Mon Sep 21 15:15:43 +0000 2026 | 发布文字已读；图片/视频未核 | 城市费用分项，餐食人数为两人、总额口径未完整；与其他比较帖文字相似，不当独立交叉验证。 |
| [X-2021855942179270762](https://x.com/razvanmuntian/status/2021855942179270762) | Thu Feb 12 07:56:35 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2045371021587616229](https://x.com/bkkdude/status/2045371021587616229) | Sat Apr 18 05:17:07 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2017205056857395496](https://x.com/sobedominik/status/2017205056857395496) | Fri Jan 30 11:55:38 +0000 2026 | 发布文字已读；图片/视频未核 | 岘港三天初到经历：找房、霉味、噪音与骑行困难；不能视为长期入住评测。 |
| [X-2025865952232079484](https://x.com/anulagarwal/status/2025865952232079484) | Mon Feb 23 09:30:56 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2082099017765528057](https://x.com/ivan_nomadz/status/2082099017765528057) | Tue Jul 28 13:41:04 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2064980889726329002](https://x.com/thevirtualsteph/status/2064980889726329002) | Thu Jun 11 07:59:44 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2065001746691453028](https://x.com/bangkoklad/status/2065001746691453028) | Thu Jun 11 09:22:36 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2089240538059096163](https://x.com/sanyayyyy/status/2089240538059096163) | Mon Aug 17 06:38:55 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2041917479727841638](https://x.com/luisgmey/status/2041917479727841638) | Wed Apr 08 16:33:58 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2051682170172006547](https://x.com/hispanicnomad/status/2051682170172006547) | Tue May 05 15:15:22 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2098429100125991030](https://x.com/nomadscom/status/2098429100125991030) | Fri Sep 11 15:10:59 +0000 2026 | 发布文字已读；图片/视频未核 | 平台增长榜缺口径与绝对基数，不当城市质量或旅居人数排名。 |
| [X-2105232075087646826](https://x.com/thealepalombo/status/2105232075087646826) | Wed Sep 30 09:43:34 +0000 2026 | 发布文字已读；图片/视频未核 | 越南许可/税务说法涉及商业服务且未逐项核法，不采用其税率、资本门槛或跑关建议。 |
| [X-2022728836744646793](https://x.com/0xlelouch_/status/2022728836744646793) | Sat Feb 14 17:45:09 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2102945979469341043](https://x.com/nicolerecyn/status/2102945979469341043) | Thu Sep 24 02:19:27 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2028336288945037591](https://x.com/DtravelDAO/status/2028336288945037591) | Mon Mar 02 05:07:10 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2011673199617196184](https://x.com/KhaosodEnglish/status/2011673199617196184) | Thu Jan 15 05:34:00 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2104246882344284409](https://x.com/kalashvasaniya/status/2104246882344284409) | Sun Sep 27 16:28:46 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2098737830793285763](https://x.com/avarinjung/status/2098737830793285763) | Sat Sep 12 11:37:46 +0000 2026 | 发布文字已读；图片/视频未核 | 4Seas在2026-09-18的开发者/创始人活动实例；活动已结束，只作社区检索入口。 |
| [X-2025976163735060905](https://x.com/TheEnergyNomad/status/2025976163735060905) | Mon Feb 23 16:48:52 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2069021965416104424](https://x.com/victorinpublic/status/2069021965416104424) | Mon Jun 22 11:37:31 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2042955705234378884](https://x.com/Dadivan_sol/status/2042955705234378884) | Sat Apr 11 13:19:31 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2068987314634682466](https://x.com/PascalLindenau/status/2068987314634682466) | Mon Jun 22 09:19:50 +0000 2026 | 发布文字已读；图片/视频未核 | 作者自报两个月Bali支出，但合计与每月/两人表述不清，不用于统一预算。 |
| [X-2028077851052798293](https://x.com/luxury_tra18820/status/2028077851052798293) | Sun Mar 01 12:00:14 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2104334805496197269](https://x.com/thekevinjon/status/2104334805496197269) | Sun Sep 27 22:18:08 +0000 2026 | 发布文字已读；图片/视频未核 | 旅居后转向固定基地的作者反例，强调深度本地网络；不采纳夸张商业判断。 |
| [X-2044340639425314997](https://x.com/7NewsBrisbane/status/2044340639425314997) | Wed Apr 15 09:02:45 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2008811053145068013](https://x.com/Its_jxtSammy/status/2008811053145068013) | Wed Jan 07 08:00:51 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2101566345322078215](https://x.com/validotxyz/status/2101566345322078215) | Sun Sep 20 06:57:16 +0000 2026 | 发布文字已读；图片/视频未核；首屏返回回复已读，未翻页 | 三地生活支出自报；读取回复确认Ubud USD300为熟客优惠、带厨房一居bungalow，Vietnam指岘港。 |
| [X-2110273453773189236](https://x.com/ricardogorski/status/2110273453773189236) | Wed Oct 14 07:36:13 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2024484860975624535](https://x.com/hiidevang/status/2024484860975624535) | Thu Feb 19 14:02:58 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2040892794982830394](https://x.com/quotesdaily100/status/2040892794982830394) | Sun Apr 05 20:42:14 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2023412436553085154](https://x.com/biptapofficial/status/2023412436553085154) | Mon Feb 16 15:01:32 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2080903038219309226](https://x.com/MarkOSullivan94/status/2080903038219309226) | Sat Jul 25 06:28:40 +0000 2026 | 发布文字已读；图片/视频未核 | 长期旅居者讲住宿不符照片及回到接单的经历，带自营房源产品，未作独立住宿验证。 |
| [X-2095096908264132776](https://x.com/KickClipsLive/status/2095096908264132776) | Wed Sep 02 10:30:02 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2053535589077795173](https://x.com/hxxntrr/status/2053535589077795173) | Sun May 10 18:00:11 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2101303441444450607](https://x.com/eliana_jordan/status/2101303441444450607) | Sat Sep 19 13:32:35 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2043923548658643390](https://x.com/nikolak47/status/2043923548658643390) | Tue Apr 14 05:25:22 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |
| [X-2088636339256529110](https://x.com/twilightslig/status/2088636339256529110) | Sat Aug 15 14:38:02 +0000 2026 | 返回发布文字；筛选阅读，未取得视频/图片内容 | 搜索筛选线索；营销、泛化排名或缺少住宿条件的内容未进入推荐。 |

## Threads

| ID / 来源 | 发布或核读日期 | 实际范围 | 采用与边界 |
|---|---|---|---|
| [T-DW_ssfalDmX](https://www.threads.com/@songj60882023/post/DW_ssfalDmX) | 2026-04-11T14:48:04+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DL439pcTA7C](https://www.threads.com/@tree.meta/post/DL439pcTA7C) | 2025-07-09T13:26:31+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DeeKh1OG--l](https://www.threads.com/@keshigreen/post/DeeKh1OG--l) | 2026-10-14T10:25:44+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DYCOShfoP7u](https://www.threads.com/@miracleto1/post/DYCOShfoP7u) | 2026-05-07T10:51:30+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DXHt5Pqjx-7](https://www.threads.com/@yf0105ss/post/DXHt5Pqjx-7) | 2026-04-14T17:32:28+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DUfzueJFBpd](https://www.threads.com/@orange_remote/post/DUfzueJFBpd) | 2026-02-08T12:31:01+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DR4FbvaEUsx](https://www.threads.com/@pancxx/post/DR4FbvaEUsx) | 2025-12-05T09:13:21+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-Ddnr3RbG4Dy](https://www.threads.com/@phoenumberis_11/post/Ddnr3RbG4Dy) | 2026-09-23T06:38:47+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DbuEMvjE05Z](https://www.threads.com/@wubiao1209/post/DbuEMvjE05Z) | 2026-08-07T01:04:06+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DZk651kEtZu](https://www.threads.com/@diaryofmeeeeau/post/DZk651kEtZu) | 2026-06-14T18:46:55+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 岗位路线帖混入数字游民起源等错误/无依据判断，未采用。 |
| [T-DedzXlOoDbI](https://www.threads.com/@valentinf112/post/DedzXlOoDbI) | 2026-10-14T07:03:21+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-Da_Cw3EDr1I](https://www.threads.com/@newton79kjlk/post/Da_Cw3EDr1I) | 2026-07-19T18:47:15+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DeTvcABjx_H](https://www.threads.com/@zzkrys_/post/DeTvcABjx_H) | 2026-10-10T09:16:36+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DbGlDUWgV_w](https://www.threads.com/@7k7k425/post/DbGlDUWgV_w) | 2026-07-22T17:01:33+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DRzVD4-lBaF](https://www.threads.com/@keshigreen/post/DRzVD4-lBaF) | 2025-12-03T12:53:42+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DcNaT8cjukl](https://www.threads.com/@xianxiande56/post/DcNaT8cjukl) | 2026-08-19T05:13:46+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DeZXk1PgSLC](https://www.threads.com/@cozybear2.0/post/DeZXk1PgSLC) | 2026-10-12T13:44:02+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DNUdYxfx0wL](https://www.threads.com/@iamliber07/post/DNUdYxfx0wL) | 2025-08-14T03:04:25+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DZr9Rk_DlnF](https://www.threads.com/@ledwardsama/post/DZr9Rk_DlnF) | 2026-06-17T12:22:19+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 工具配置的泛化宣传，不证明账户适用、工作收入或实际旅居成本。 |
| [T-DWD7N6-kRhr](https://www.threads.com/@sachinontrip/post/DWD7N6-kRhr) | 2026-03-19T09:40:32+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 寻找清迈EST工位/同伴的真实需求；未读回复，不当地点验证。 |
| [T-Debqo3biE5y](https://www.threads.com/@soohyunkoo/post/Debqo3biE5y) | 2026-10-13T11:08:36+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DMIAPuZoDH2](https://www.threads.com/@fourlostsoles/post/DMIAPuZoDH2) | 2025-07-15T10:27:30+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DEfeI2LtYVC](https://www.threads.com/@andrewcodesmith/post/DEfeI2LtYVC) | 2025-01-06T17:00:06+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DEflg1YzVs7](https://www.threads.com/@thomasbrillion/post/DEflg1YzVs7) | 2025-01-06T18:04:31+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DZzlOQ_lFYl](https://www.threads.com/@wenxuanleeee/post/DZzlOQ_lFYl) | 2026-06-20T11:26:04+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DeZQm6jjWsk](https://www.threads.com/@skiesandetc/post/DeZQm6jjWsk) | 2026-10-12T12:42:39+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DVFeEs0Ex1v](https://www.threads.com/@soohyunkoo/post/DVFeEs0Ex1v) | 2026-02-23T03:32:58+00:00 | 发布文字＋登录态浏览器可见置顶、7组关键回复；未展开全部34条 | 美国时间工作者遇到咖啡馆17点关门，浏览器读置顶与其他关键回复；推荐名单不作最新营业保证。 |
| [T-DVDe1nkjjgh](https://www.threads.com/@theworldinitineraries/post/DVDe1nkjjgh) | 2026-02-22T09:01:09+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DctJp10oKkT](https://www.threads.com/@nerdontour/post/DctJp10oKkT) | 2026-08-31T13:04:00+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DUxHbV5EQ1C](https://www.threads.com/@pac.trips/post/DUxHbV5EQ1C) | 2026-02-15T05:50:16+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DWpAZsvEzw7](https://www.threads.com/@soohyunkoo/post/DWpAZsvEzw7) | 2026-04-02T19:17:44+00:00 | 主帖发布文字；未完整读取1/2续帖及全部评论 | 从清迈到岘港两周仍重建吃饭/办公日常；读主帖文字，不声称完整续帖与所有评论。 |
| [T-DQ4fP-AjlBw](https://www.threads.com/@thehackernomad/post/DQ4fP-AjlBw) | 2025-11-10T16:27:32+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DN8-aFHky5-](https://www.threads.com/@kaibiganai/post/DN8-aFHky5-) | 2025-08-29T20:42:35+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DeMUmnnk8vV](https://www.threads.com/@itscamillejoyce/post/DeMUmnnk8vV) | 2026-10-07T12:07:26+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DdmntOSk5mQ](https://www.threads.com/@julianworksanywhere/post/DdmntOSk5mQ) | 2026-09-22T20:43:22+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 上传测速建议，未采用15Mbps必定像素化等无充分条件的技术阈值。 |
| [T-DV5A38aj6nw](https://www.threads.com/@_iansct/post/DV5A38aj6nw) | 2026-03-15T03:58:19+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DV5Bl6DEXP_](https://www.threads.com/@hellothisiskyle/post/DV5Bl6DEXP_) | 2026-03-15T04:04:36+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DedcTEVmmV_](https://www.threads.com/@fu.wari/post/DedcTEVmmV_) | 2026-10-14T03:41:46+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DbdLxhOgTe9](https://www.threads.com/@pussadeethongthawee/post/DbdLxhOgTe9) | 2026-07-31T11:43:12+00:00 | API发布文字返回并筛选；未读评论/图片/视频 | 返回发布文字，作为筛选线索；未用于住房、政策或全城网络结论。 |
| [T-DSwurnVFCpb](https://www.threads.com/@nathalieasuncion/post/DSwurnVFCpb) | 2025-12-27 | 登录态主帖＋首屏可见关键回复；未展开全部52条 | 曼谷创业社群不好找的自报；7个月居民、作者和其他回复者有相同难点，不泛化全城。 |

## Instagram

| ID / 来源 | 发布或核读日期 | 实际范围 | 采用与边界 |
|---|---|---|---|
| [I-DdUA8SKiVXU](https://www.instagram.com/p/DdUA8SKiVXU/) | 2026-09-18T14:46:27+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | GBP685是工资情景预算，未证明亲历、租期或现实住房库存，不作月成本基准。 |
| [I-DHnguYEqwQc](https://www.instagram.com/p/DHnguYEqwQc/) | 2025-03-25T09:31:13+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | 宣传或一般攻略线索，未用为实际入住、当前价格或合法工作证明。 |
| [I-CnXDrXOKvdA](https://www.instagram.com/p/CnXDrXOKvdA/) | 2023-01-13T15:25:59+00:00 | API发布文案＋登录态可见评论，币种追问及展开回复；未转录口播/视频内账单 | 旧年长住体验，月份待核；作者说住房多付；旧年内容不作2026价格，币种追问未充分解决。 |
| [I-DUxWXCJjuvu](https://www.instagram.com/p/DUxWXCJjuvu/) | 2026-02-15T08:01:12+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | THB3000廉租宣传未说明租期/房型使用条件，不作当前可预订月租。 |
| [I-DblY_zrSKNV](https://www.instagram.com/p/DblY_zrSKNV/) | 2026-08-03T16:14:10+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | 税务/许可推广未核法，混入居留与签证税率推断，排除。 |
| [I-DFbA_CGyFBI](https://www.instagram.com/p/DFbA_CGyFBI/) | 2025-01-29T20:02:41+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | 宣传或一般攻略线索，未用为实际入住、当前价格或合法工作证明。 |
| [I-DUSbnxME8Nq](https://www.instagram.com/p/DUSbnxME8Nq/) | 2026-02-03T07:50:38+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | 宣传或一般攻略线索，未用为实际入住、当前价格或合法工作证明。 |
| [I-CsVb41qv1a7](https://www.instagram.com/p/CsVb41qv1a7/) | 2023-05-17T06:55:14+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | 宣传或一般攻略线索，未用为实际入住、当前价格或合法工作证明。 |
| [I-DVqjP7oEa6_](https://www.instagram.com/p/DVqjP7oEa6_/) | 2026-03-09T13:10:00+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | 宣传或一般攻略线索，未用为实际入住、当前价格或合法工作证明。 |
| [I-Ddr6APIxcwC](https://www.instagram.com/p/Ddr6APIxcwC/) | 2026-09-24T22:01:41+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | 宣传或一般攻略线索，未用为实际入住、当前价格或合法工作证明。 |
| [I-Da10LY5RvE6](https://www.instagram.com/p/Da10LY5RvE6/) | 2026-07-16T04:47:53+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | 宣传或一般攻略线索，未用为实际入住、当前价格或合法工作证明。 |
| [I-DddPpnVgGLi](https://www.instagram.com/p/DddPpnVgGLi/) | 2026-09-19T05:20:18+00:00 | API完整发布文案，未转录Reel口播、未完整观看视频，未读评论 | 宣传或一般攻略线索，未用为实际入住、当前价格或合法工作证明。 |

## web

| ID / 来源 | 发布或核读日期 | 实际范围 | 采用与边界 |
|---|---|---|---|
| [O01](https://www.tmd.go.th/en/weather/region/northern) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 泰北10月14日预报与10月5–6日洪水周报；不采用同页2022年月度段 |
| [O02](https://e.vnexpress.net/news/travel/places/da-nang-stops-sightseeing-in-son-tra-peninsula-as-monsoon-begin-5130445.html) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 10月9日山茶半岛暂停观光报道，新闻正文关键段 |
| [O03](https://apnews.com/article/4f3b1d5014e90f0177fea1aec98c6070) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 10月9日越南中部洪水报道，关键段 |
| [O04](https://vietnam.travel/things-to-do/weather-and-climate-vietnam) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 河内/会安/大叻的长期季节资料；非实时天气 |
| [O05](https://kohub.org/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 2026–27季节公告，11月1日–4月30日；不采用商户精选评论为独立验证 |
| [O06](https://kohub.org/join_us) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | THB6900/月、400/日、24h权限、每日通话间最长3h与高峰期日票限制 |
| [O07](https://settlements.work/coworking/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | RM320共享/RM400固定、日票RM30、月会员24h/日票工作日9–17 |
| [O08](https://www.soppadeazul.com/es/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | EUR150共享/175固定、专用通话价、税费说明和权限 |
| [O09](https://sun-desk.com/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | Budget满月29.50欧/日起、Standard37.50欧/日起；夜间口径须问，不复制商户精选评价 |
| [O10](https://digitalnomads.startupmadeira.eu/pontadosol/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 免费工位09–18、项目活动入口；非房租或人数保证 |
| [O11](https://catandmouse.bg/coworking) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | EUR96开放/EUR162固定，含VAT，固定24h |
| [O12](https://floripa.impacthub.net/coworking/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | R$400 flex/R$725 unlimited，运营方价，未现场验证 |
| [O13](https://www.gubixi.com/pages/home-en) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | MXN250/日与2500/月，服务页，不代表住所网络 |
| [O14](https://cocospace.io/coco-v4/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | PHP500/日与7500/月，备电和备线为运营方自报 |
| [O15](https://toong.asia/location/toong-phan-boi-chau/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 51 Phan Boi Chau共享工位VND1900000/月起，夜间与通话另核 |
| [O16](https://www.punspace.com/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | Wiang Kaew/Tha Phae Gate接待9–18，会员24h；日票夜间资格另询 |
| [O17](https://th.china-embassy.gov.cn/zgqz/1w1/202609/t20260902_12014754.html) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 2026年9月2日官方提醒，中国护照30日/次、90日/180日 |
| [O18](https://my.china-embassy.gov.cn/fwzc/lsyw/lszj/fhqz2024/cjwdvisa/202508/t20250801_11681383.htm) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 中马普通护照30日/次、90日/180日；不把赴华计算说明外推马方算法 |
| [O19](https://ge.china-embassy.gov.cn/chn/xwdt/202405/t20240527_11312564.htm) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 中格中国普通护照30日/次、90日/180日，工作/超期需相应手续 |
| [O20](https://ma.china-embassy.gov.cn/lsfw/zytz/202507/t20250716_11671271.htm) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 中国公民免签最长90日，超期问题 |
| [O21](https://www.thailand.go.th/issue-focus-detail/3---destination-thailand-visa-dtv?hl=en) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | DTV5年、THB500000财务证明，领区可追加要求 |
| [O22](https://evisa.immigration.gov.vn/en_US/web/guest/khai-thi-thuc-dien-tu/cap-thi-thuc-dien-tu) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 官方费用USD25单次/USD50多次；不保证页面写的处理时间 |
| [O23](https://www.mofa.go.jp/ca/fna/pagewe_000001_00046.html) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 日本DNV6个月不延长与国籍资格入口；完整资格PDF本轮未读 |
| [O24](https://www.boca.gov.tw/cp-158-7718-c0382-2.html) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 台湾DNV资格限免签国籍，页面2026-08-07更新 |
| [O25](https://home-affairs.ec.europa.eu/policies/schengen/border-crossing/short-stay-calculator_en) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 申根短停90/180及计算入口 |
| [O26](https://linq-up.com.my/kuching-pricing/) | 核读 2026-10-07 | 见摘要；官方/运营方/新闻分别使用 | RM20日/RM350月、工作日8:30–17:30；本轮取得页面，价目细节沿用10月7日已读记录 |
| [O27](https://coolab.al/) | 核读 2026-10-07 | 见摘要；官方/运营方/新闻分别使用 | EUR150共享/180固定24h；本轮页面提取不稳定，报价沿用10月7日已读记录 |
| [O28](https://concordia.itamaraty.gov.br/ApiConcordia/Acordo/integra-acordo-html/13219) | 核读 2026-10-07 | 见摘要；官方/运营方/新闻分别使用 | 巴西协议全文在10月7日核读，30日不可延长、措施至2026年底；未于本轮重新读取 |
| [Q01](https://www.reddit.com/r/hanoi/comments/1v7tpxl/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 搜索返回完整主帖与部分关键回复；直接网页超时，非完整评论精读 |
| [Q02](https://www.reddit.com/r/digitalnomad/comments/1tx0qw1/) | 核读 2026-10-14 | 见摘要；官方/运营方/新闻分别使用 | 公开网页主帖与秋冬路线/机场风况/房租口径关键评论 |

## 没有补齐的条件

城市月预算尚未统一到相同人数、房型和租期；河内、Las Palmas等仍需实际旅行日期的房源报价。没有现场验证商户设施。若干城市的工作许可只提供入口，未完成申请领区核验。Bansko、大叻和国内基地保留下一轮线索。

README把季节、住房、工作、价格口径和代价放到首页，详细来源留在本页。90%重要信息覆盖是编辑目标，没有读者任务测试，不能作为实测比例。
