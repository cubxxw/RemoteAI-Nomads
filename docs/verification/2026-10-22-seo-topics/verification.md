# 四篇旅居专题验收（2026-10-22）

## 范围与结果

新增月份、5000元月预算、北京时间办公、中国普通护照停留与工作选择四篇专题，复用已公开数据和已授权真实照片；新增资料的原始来源及核读范围见 `research/2026-10-22-seo-topics.md`。50篇选题的发布顺序见 `docs/editorial/seo-50-article-plan.md`。

- Node 24.19.0：完整 `npm run check` 370/370 通过；`npm run build` Wrangler dry-run 通过。
- 最终搜索摘要一致性修正后，指南、目录和阅读菜单相关测试再次执行，21/21通过；批准源与资产指纹重新生成并校验。
- `seasonal:readme -- --check` 和 `git diff --check` 通过。
- 生成站点地图376个唯一正式URL；四篇 canonical 均为 `https://roamorrow.com/nomads/guides/<slug>/`。
- 独立审查未发现 P0/P1。P2 手机章节目录选择后不收起已修复；reviewer复跑 native/legacy 两个回归测试通过，全部批准指纹匹配。

## 实际浏览器验收

使用本机回环地址上的已生成公开静态产物，未调用真实模型或修改远程数据库。这证明产物的可读性与交互，不代表 Worker/D1 或生产发布完成。

- 390×844：四篇标题正确、无页面横向溢出；canonical正确；图片未发现已完成但失败的加载。
- 手机目录：选择“11月的天气记录”后收起，菜单高51.19px，章节顶部84.94px；Escape收起且焦点回到summary。
- 1440×1000：四篇无横向溢出；指南索引四个入口可见且实际点击可到达专题。
- 清迈章节实际点击后，两张延迟加载照片正常加载，原宽960与1280；本轮浏览器warn/error日志为空。
- 截图为固定视口，见同目录文件；数据读回见 `browser-mobile.json`。

## 尚未完成的发布步骤

本机缺少既有 `wrangler.production.jsonc`，Wrangler读回未认证；检查的本机配置位置及本仓库GitHub secrets未找到既有发布授权。不能据此重建账号、数据库或绑定。未执行生产发布、D1写入或GSC提交，也未宣称搜索引擎已收录。

合并后的上线仍需从既有生产工作区或有效Cloudflare授权恢复原配置，按 `web/docs/deployment.md` 发布，再读回release、healthz、四篇正文、图片、canonical及sitemap。本次专题本身无需数据库迁移或初始化。
