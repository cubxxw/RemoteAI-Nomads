# 查询与流程参考

需要参数细节或进入具体规划阶段时读取。工具可能带客户端自己的命名空间，按下列工具名后缀查找即可。

## 常用调用

`nomads_get_context` 接受 `place`（城市或国家名称、公开ID）、`country`（国家名称或代码）、`region`（亚洲/欧洲/美洲/非洲/大洋洲）、`months`（1–12的数组）、`currency`（展示币种，默认CNY）、`passport`（用户已明确的护照代码）和 `limit`（默认3，最多5）。

可选 `preset` 为 default、budget、internet、winter、safe。winter默认按1月的历史月均温18–28°C筛选，用户明确给月份则使用该月份。安静、空气质量、当前网络实测没有相应硬筛选指标。

会议参数可合并在第一次查询中：

```json
{
  "country": "TH",
  "months": [11],
  "currency": "CNY",
  "work_schedule": {
    "home_timezone": "Asia/Shanghai",
    "date": "2026-11-16",
    "times": ["09:00", "18:00"]
  }
}
```

日期只是参数格式示例，实际使用要根据用户提供的日期或本次明示的示例日期填写。

`nomads_compare_cities` 接受 `cities`（2–3个城市）、`months`、`currency` 和相同的 `work_schedule`。无需再为每座城市重复查询消费和工作背景。

`nomads_find_cities` 用于扩大候选或精确筛选，支持国家、大洲、历史月均温上下限和月降雨量上限。默认10条、最多20条，用 `offset` 继续。只有用户明确要按旧美元月参考严格筛选时才传 `legacy_budget_usd_max`。

`nomads_get_costs` 接受 `place`、`currency`、`scope`（city/regional/national/all）、`category`、`limit` 与 `offset`。常用消费类别是 housing、food、transportation、utilities；按返回的 `next_offset` 展开，不把首屏样本当成全部行情。

`nomads_calculate_budget` 的 `budget`、`currency` 和 `days` 必填。`people` 默认1；`budget_basis` 为 group 或 person。`reserve` 是整组一次性预留。费用项包含 label、category、amount、period（day/month/once）、basis（group/person）。预算分类的交通写 transport，消费观察分类写 transportation。每个月按30天分摊是规划公式，不能当作短租商家的实际结算规则。

需要补查具体政策时，用 `nomads_get_entry_rules` 并显式传 country 和 passport。没有对应护照资料时，返回的参考链接也不构成个人资格结论。

来源和覆盖已经随主查询返回；仅在需要展开时使用 `nomads_get_sources`、`nomads_get_catalog_info` 或专门的气候、工作、会议工具。

## 六种任务怎样走

| 任务 | 首次调用 | 需要继续时 |
| --- | --- | --- |
| 想去某个国家 | get_context传country和已知月份 | 只针对主要缺口查一座城市的明细 |
| 找当季目的地 | get_context传months、region与已知温度偏好 | 用户愿意扩大范围时再翻页 |
| 预算倒推 | 有用户报价就calculate_budget，否则get_context | 按明示住法算住宿上限，再找报价核对 |
| 两城决定 | compare_cities | 只核对会改变决定的差异 |
| 工作安排 | 把work_schedule并入get_context或compare_cities | 具体房间网络仍需实测 |
| 第一周落地 | 沿用已确认城市与相关指南 | 给试住、通话与预算检查行动，不重做一次完整选城 |

记录条件时，把用户明确给的值与临时假设分开。用户只改一个值，保留其他值；涉及人数时先保留每项按人或按组的单位。
