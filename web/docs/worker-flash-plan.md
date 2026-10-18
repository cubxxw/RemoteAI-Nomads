# Flash 原生助手部署

用户已确认采用 Workers + D1 + DeepSeek API，并指定 Flash。城市数据、预算数学、引用与现有交互保留，替换需要子进程的 DSH 执行层，不将旧 DSH 测试结果算作新实现成绩。

执行顺序：

1. 用官方 `deepseek-flash` Chat Completions 接口执行已有的只读工具循环。保留 thinking 模式的 reasoning_content，仅在服务端回传，不展示或记录到公开追踪。
2. 用 Workers 免费版支持的 SQLite Durable Object 管理每个匿名会话。一个会话一个活动任务；停止请求到同一对象即时终止上游请求；D1 继续负责城市和跨会话额度。无容器，无新付费套餐。
3. 规划与反证核验均使用 Flash。保留格式、引用、算术校验和来源范围；气候工具明确月均温和非实时性质。
4. 先单元测试、真实 API 和本地 Worker，再以关闭公开入口的方式发布。核验真实 D1、完整问答、取消、会话隔离、模型名和免费账户兼容性后开放。
5. 重跑 30 个既有案例并增加月均温误读的回归案例。用真实结果记录失败和局限，不把模型自我核验通过称作独立正确性证明。

范围：本次改造和上线 AI 助手。消费全量月更仍需单独测量分批同步的运行额度，不因 AI 上线自动启用。

官方依据：

- https://api-docs.deepseek.com/guides/thinking_mode/
- https://api-docs.deepseek.com/guides/tool_calls/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/
