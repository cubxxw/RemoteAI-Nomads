# RemoteAI Nomads

帮中文远程工作者选城市。[打开排行 →](https://nomads.cubxxw.com/)

<!-- seasonal:table:start -->
## 2026年10月，去哪住一阵

<table tabindex="0" aria-label="2026年10月十城推荐，可横向滚动">
<thead><tr><th scope="col" nowrap>城市</th><th scope="col" nowrap>月花费 / USD</th><th scope="col" nowrap>10月均温</th><th scope="col" nowrap>大陆护照</th><th scope="col" nowrap>为什么这个月去</th></tr></thead>
<tbody>
<tr><td nowrap>1. <a href="https://nomads.cubxxw.com/cities/ubud/">乌布</a> 🇮🇩</td><td nowrap align="right">≈$800</td><td nowrap align="right">26°C</td><td nowrap>落地签</td><td nowrap>Outpost有通话间，巴厘岛也能安排会议</td></tr>
<tr><td nowrap>2. <a href="https://nomads.cubxxw.com/cities/fethiye/">费特希耶</a> 🇹🇷</td><td nowrap align="right">≈$1,240</td><td nowrap align="right">22°C</td><td nowrap>免签</td><td nowrap>厄吕代尼兹的蓝色海湾，十月还能续夏天</td></tr>
<tr><td nowrap>3. <a href="https://nomads.cubxxw.com/cities/hangzhou/">杭州</a> 🇨🇳</td><td nowrap align="right">≈$950</td><td nowrap align="right">21°C</td><td nowrap>境内</td><td nowrap>西湖边约21°C，下班还能绕湖走一段</td></tr>
<tr><td nowrap>4. <a href="https://nomads.cubxxw.com/cities/shenzhen/">深圳</a> 🇨🇳</td><td nowrap align="right">≈$1,080</td><td nowrap align="right">26°C</td><td nowrap>境内</td><td nowrap>华强北一站配齐元器件，适合做硬件原型</td></tr>
<tr><td nowrap>5. <a href="https://nomads.cubxxw.com/cities/antalya/">安塔利亚</a> 🇹🇷</td><td nowrap align="right">≈$1,140</td><td nowrap align="right">22°C</td><td nowrap>免签</td><td nowrap>十月逛卡莱伊奇老城，比盛夏走得舒服</td></tr>
<tr><td nowrap>6. <a href="https://nomads.cubxxw.com/cities/lisbon/">里斯本</a> 🇵🇹</td><td nowrap align="right">≈$2,050</td><td nowrap align="right">19°C</td><td nowrap>需签证</td><td nowrap>里斯本坡道19°C，欧洲作息更好配合</td></tr>
<tr><td nowrap>7. <a href="https://nomads.cubxxw.com/cities/malaga/">马拉加</a> 🇪🇸</td><td nowrap align="right">≈$1,900</td><td nowrap align="right">21°C</td><td nowrap>需签证</td><td nowrap>马拉加21°C，把午休留给地中海</td></tr>
<tr><td nowrap>8. <a href="https://nomads.cubxxw.com/cities/pokhara/">博卡拉</a> 🇳🇵</td><td nowrap align="right">≈$450</td><td nowrap align="right">21°C</td><td nowrap>落地签</td><td nowrap>秋天去费瓦湖，等鱼尾峰映进湖面</td></tr>
<tr><td nowrap>9. <a href="https://nomads.cubxxw.com/cities/chengdu/">成都</a> 🇨🇳</td><td nowrap align="right">≈$730</td><td nowrap align="right">19°C</td><td nowrap>境内</td><td nowrap>国庆后回到成都街区，约19°C过秋天</td></tr>
<tr><td nowrap>10. <a href="https://nomads.cubxxw.com/cities/las-palmas/">拉斯帕尔马斯</a> 🇪🇸</td><td nowrap align="right">≈$1,600</td><td nowrap align="right">24°C</td><td nowrap>需签证</td><td nowrap>拉斯坎特拉斯海滩，秋天也能沿海过日子</td></tr>
</tbody>
</table>
<!-- seasonal:table:end -->

[省钱优先 →](https://nomads.cubxxw.com/?preset=budget) · [签证免签 →](https://nomads.cubxxw.com/?preset=visa) · [冬天避寒 →](https://nomads.cubxxw.com/?preset=winter)

<!-- seasonal:changes:start -->
## 本期变化

- 本月推荐合并为10城单表，每座城市只出现一次。
- 省钱、网速、安全的主权重从80%降到50%。
- 7座有明确暂勿前往提醒的城市退出推荐，城市资料保留。
- 新增亚洲、国内、国外标签，可叠加本月推荐。
<!-- seasonal:changes:end -->

数据为参考值，出发前请核实。[数据与方法](web/docs/data-and-methods.md)。

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
