# 可复用的旅居数据

[返回主指南](../README.md) · [核读账本](../research/2026-10-14-source-ledger.md)

[destinations.json](destinations.json) 存城市选择、季节窗口、时区、适合的人、现实代价和费用个案。[sources-2026-10-14.json](sources-2026-10-14.json) 存对应公开来源的时间、读取范围和中文编辑摘要。

`source_ids` 对应来源文件中的 `id`。`price_observations` 是有条件的费用观察，每项保留币种、时间单位、来源日期和包含范围；办公会员、房租和共居套餐不能直接横比，也不能把起价相加当成保证可预订的生活预算。`source_date` 是原帖日期或最近核价日，含义由 `scope` 说明。

`monthly_total_budget: null` 表示缺少同人数、房型、租期和季节的完整可比月预算，绝不表示零成本。`0` 只用于官方项目明确免费且限定白天的工位。`seasonal_choice` 是带条件的编辑建议，不是天气预报或自动得分。

来源的 `used_with_limits` 表示按限制使用，`counterexample_only` 只用作反例，`discovery_only` 是筛选线索，`excluded` 不用于推荐。API返回完整发布文字不等于看过图片、视频或所有回复，每条以 `read_scope` 为准。旧一轮沿用的材料保留原核读日。

本库只发布元数据和短摘要，没有完整原文、媒体响应、身份材料或账户信息。更新价格时保留旧来源，加入新观察，不把旧帖日期改成今天。
