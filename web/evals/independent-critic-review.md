# 本地独立核验三题复核

**本轮独立核验确实拒绝了此前漏判的错误，但三题均未交付用户答案。** 01/24为UNSUPPORTED_ANSWER，07超时；这证明拒错能力有实际变化，不能证明旅行规划任务已完成。后续独立编辑分支不属于本轮，不合并计数。

只评[2026-10-18T03-00-55-489Z](../.data/secretary-evals/2026-10-18T03-00-55-489Z/manifest.json)，runtime指纹`264edc4ba70d89a908659af419b36c91ebb0c7a4997cb5790a9ee882a7188588`，manifest checker_provider为codex-local；三份实际grounding.model均为codex-local-default，各有两次independent_usage，不再是DeepSeek自审。本轮没有记录确切Codex模型版本，不能将default当作一个已确定型号。

| 题号 | 独立结论 | 实际核验与用户结果 |
| --- | --- | --- |
| [01](../.data/secretary-evals/2026-10-18T03-00-55-489Z/01.json) | 不可用 | 114.6秒UNSUPPORTED_ANSWER。修订草稿已不再将单个整租报价当最低门槛，5天/30天条件金额可追；最终仍声称“300元/晚在多数城市通常能找到住宿”，无多数城市/日期/短住报价，被C13正确拒绝，没有用户答案。 |
| [07](../.data/secretary-evals/2026-10-18T03-00-55-489Z/07.json) | 不可用 | 120.1秒TIME_LIMIT。7天/30天两种假设的住宿1265/50及不否定全部长住方案的限定正确；但推荐泉州时称治安/网速评分较好，实际两项均null，C8正确拒绝。最终仍未交付。 |
| [24](../.data/secretary-evals/2026-10-18T03-00-55-489Z/24.json) | 不可用 | 67.6秒UNSUPPORTED_ANSWER。修订已保留24k临界待确认、境内旅游身份等原限定；却从“必须DE Rantau”改成“并非所有远程工作者唯一/必须通道”，仍没有其他路径或豁免证据，C4正确拒绝。应表达“本次资料不足以判断唯一性”，而非断言相反结论。 |

三题实际runtime_reaped=true，无presentation_errors。原始截图题仍未完成。pilot记录[旧12的独立核验](../.data/independent-critic-pilot.json)也具体拒绝ERA5实测、气候推取暖支出/性价比、跨城报价验证等，与此前人工复核一致；这个旧答案反例不能算新题成功交付。

## 适配器隐私与生命周期

静态核读的是[本轮codex-audit.mjs归档](../.data/secretary-evals/2026-10-18T03-00-55-489Z/runtime/agent/codex-audit.mjs)及服务端接入。CLI以独立临时目录、ephemeral、read-only运行，忽略用户config与exec规则，禁shell/apps/plugins/browser/memory/多代理等，项目文档读取上限0；环境采用白名单，没有将数据库、DeepSeek或bridge服务密钥传入。HOME/CODEX_HOME保留供既有CLI认证使用，没有复制认证文件。已核读本机CLI帮助：ignore-user-config不加载config.toml但认证仍使用CODEX_HOME，ephemeral不持久化会话文件。

服务端只有localD1存在时才允许该分支，默认部署仍为DeepSeek。本地指CLI适配器运行位置，不代表离线推理；问题、答案、证据和声明仍交给该Codex账号对应的模型服务。禁用功能是主要能力边界，事后事件扫描只能发现列出的工具事件，不能撤销已经执行的动作。pilot的tool_calls=0来自适配器所列事件扫描后的元数据，本轮未归档完整CLI JSONL，不能独立重数未知工具事件类型。

我用不联网、不读取认证的替身codex子进程，实际验证两条清理路径：替身故意忽略SIGTERM，用户取消后约704ms结束；2秒超时测试约2416ms返回INDEPENDENT_CHECKER_TIMEOUT。两次均确认子进程已不存在、该审查临时目录已删除，覆盖了400ms后SIGKILL的升级路径。这是适配器生命周期测试，不冒充真实Codex网络请求中途取消。最初过短启动等待的替身尝试未确认启动，未计为成功验证。

**剩余防护缺口：stdout限制不是硬缓冲上限。** 代码先output+=chunk，再检查200000字符并关闭；终止宽限期中后续chunk仍继续累积，异常高输出时可超过该上限。应达到阈值即停止累积/截断，同时保留终止与回收。本轮没有观察到相应泄露或内存故障，父线程已说明后续修复，此报告对应冻结版本。

旧三题结束后的OS检查撞上后续新编辑实验，现场存在两组审查CLI与两个临时目录，不能将它们归为旧轮残留，也不能宣称当时全机零审查进程。本轮清理结论限于逐题reaped记录和上述已确认启动的替身进程/目录实测；未操作共享浏览器或修改runtime。
