# 助手筛选变更的安全回归证据

本次将工具的 `recommended_only` 显式映射到排行状态，并让“应用到排行”保留该限制。验证范围是工具参数和来源归属，以及个人金额进入页面、链接与模型请求的边界。

2026-10-19，在发布候选代码上运行以下检查，14项通过，0项失败：

```sh
node --test tests/agent-contract.test.js tests/agent-planning.test.js tests/agent-audit.test.js
```

检查覆盖任意SQL字段、未知参数、非有限金额及非法日期的拒绝；未读取的来源和城市不能进入答案；回答引用须归属本次证据，严格月份条件不能在应用链接中丢失。完整的286项检查另由[Web checks](https://github.com/cubxxw/RemoteAI-Nomads/actions/runs/39210234376)通过。

[PR #16 的检查页](https://github.com/cubxxw/RemoteAI-Nomads/pull/16/checks)中，GitGuardian Security Checks对首个候选提交 `e04a5bd53b1e51a71cd70d2e0257506c2a0eee56` 返回SUCCESS。CodeRabbit因包含生成页面的文件总量超过限制而跳过审查；代码审查采用独立复核，发现的问题与关闭证据见[连续角色走查](persona-e2e-2026-10-19.md)。文档提交后，合并仍需等待当前提交的检查通过。

独立调用链复核确认：报价保存在本机，分享地址只包含公共排行条件和月份；点击预算检查仅填入可见草稿，用户发送后才进入模型请求。打印媒体模式已确认个人区隐藏，原生PDF未导出验收。
