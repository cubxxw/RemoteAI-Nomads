import {esc, icon} from './render.js';

export const MCP_URL = 'https://mcp.roamorrow.com/mcp';
const SKILL_URL = 'https://mcp.roamorrow.com/skills/roamorrow-nomad-planner.zip';
import {connectionPrompts as prompts} from '../public/modules/connection-examples.js';

function copyButton(id, label) {
  return `<button type="button" class="connect-copy" data-connect-copy="${id}" hidden>${icon('copy')}<span>${label}</span></button>`;
}
function codeField(id, value, label) {
  return `<div class="connect-code"><label class="connect-sr" for="${id}">${label}</label><textarea id="${id}" rows="${value.split('\n').length}" readonly spellcheck="false" autocomplete="off">${esc(value)}</textarea>${copyButton(id, '复制配置')}</div>`;
}

export function agentConnectPage() {
  return {
    title: 'Agent 接入：连接 Roamorrow MCP 与旅居规划 Skill',
    description: '无需 Roamorrow 账号或密钥，连接公开旅居资料。提供 Codex、Claude Code、Cursor 配置、Skill 下载与可复制的选城案例。',
    path: '/developers/', active: 'developers', indexable: true,
    body: `<link rel="stylesheet" href="/agent-connect.css">
<div class="connect-page container" id="agent-connect">
  <header class="connect-intro">
    <p class="connect-eyebrow">ROAMORROW <span aria-hidden="true">/</span> AGENT 接入</p>
    <h1>把旅居资料，<br>接到你常用的工具。</h1>
    <p class="connect-lead">连接城市、预算、气候与时差信息，<br class="connect-desktop-break">在你熟悉的对话里做出发准备。</p>
  </header>
  <div class="connect-workbench">
    <section class="connect-setup" aria-labelledby="connect-setup-title">
      <div class="connect-section-top"><span class="connect-number" aria-hidden="true">01</span><h2 id="connect-setup-title">连接资料</h2><span class="connect-note">MCP · 公开只读</span></div>
      <p class="connect-setup-intro">复制地址，添加到支持远程 MCP 的客户端。无需 Roamorrow 账号或密钥。</p>
      <label class="connect-label" for="connect-url">服务地址 <span>Streamable HTTP</span></label>
      <div class="connect-address"><input id="connect-url" type="text" value="${MCP_URL}" readonly spellcheck="false" autocomplete="off">${copyButton('connect-url', '复制地址')}</div>
      <div class="connect-client-choice" hidden><label for="connect-client">你使用的客户端</label><select id="connect-client" aria-controls="connect-instructions"><option value="generic">通用客户端</option><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="cursor">Cursor</option></select></div>
      <div id="connect-instructions">
        <div data-connect-client="generic"><ol class="connect-steps"><li>在客户端设置中，找到添加 MCP 服务的入口。</li><li>名称填 <code>roamorrow</code>，选择 HTTP，粘贴上方地址。</li><li>连接后确认能看到 <code>nomads_get_context</code> 等工具，再试一个问题。</li></ol><p class="connect-fine">客户端可能需要你确认工具使用权限；可用入口取决于客户端版本与套餐。</p></div>
        <div data-connect-client="codex" hidden><p>安装了 Codex CLI 后，在终端运行：</p>${codeField('connect-codex', `codex mcp add roamorrow --url ${MCP_URL}`, 'Codex 接入命令')}<p class="connect-fine">回到 Codex，检查 MCP 连接状态；若当前会话未刷新，重新打开会话。<a href="https://developers.openai.com/codex/mcp" target="_blank" rel="noopener noreferrer">官方说明 ↗</a></p></div>
        <div data-connect-client="claude" hidden><p>安装了 Claude Code 后，在项目目录运行：</p>${codeField('connect-claude', `claude mcp add --transport http roamorrow ${MCP_URL}`, 'Claude Code 接入命令')}<p class="connect-fine">在 Claude Code 中运行 <code>/mcp</code> 检查连接。默认只在当前项目可用。<a href="https://code.claude.com/docs/en/mcp" target="_blank" rel="noopener noreferrer">官方说明 ↗</a></p></div>
        <div data-connect-client="cursor" hidden><p>将以下服务合并到项目的 <code>.cursor/mcp.json</code>：</p>${codeField('connect-cursor', JSON.stringify({mcpServers: {roamorrow: {url: MCP_URL}}}, null, 2), 'Cursor MCP 配置')}<p class="connect-fine">保留已有服务，保存后重新打开 Cursor，在 MCP 设置中检查连接。<a href="https://cursor.com/docs/mcp" target="_blank" rel="noopener noreferrer">官方说明 ↗</a></p></div>
      </div>
    </section>
    <section class="connect-example" aria-labelledby="connect-example-title">
      <div class="connect-section-top"><span class="connect-number" aria-hidden="true">02</span><h2 id="connect-example-title">从一个问题开始</h2></div>
      <p>改一改月份、预算或工作时间，<br>发给刚刚接入的客户端。</p>
      <div class="connect-scenarios" role="group" aria-label="示例场景">${prompts.map((p, i) => `<button type="button" data-connect-example="${i}" aria-pressed="${i === 0}" hidden>${esc(p.name)}</button>`).join('')}</div>
      <label class="connect-sr" for="connect-prompt">可复制的示例问题</label>
      <textarea id="connect-prompt" class="connect-prompt" readonly rows="8">${esc(prompts[0].text)}</textarea>
      ${copyButton('connect-prompt', '复制问题')}
      <p class="connect-fine">先给候选与依据；遇到缺口，再补充必要条件。</p>
    </section>
  </div>
  <p id="connect-feedback" class="connect-feedback" role="status" aria-live="polite" aria-atomic="true">地址和示例均可直接选中复制。</p>
  <section class="connect-skill" aria-labelledby="connect-skill-title">
    <div><p class="connect-eyebrow">可选 · SKILL</p><h2 id="connect-skill-title">让资料按旅居问题组织起来。</h2><p>选城、比较、算预算、准备第一次试住。Skill 会复用你已提供的条件，<br class="connect-desktop-break">补齐背景，标出依据和缺口，减少来回问答。</p></div>
    <div class="connect-skill-action"><a class="button secondary" href="${SKILL_URL}">下载旅居规划 Skill ${icon('arrow-right')}</a><span>ZIP · 含说明与查询脚本</span></div>
    <details><summary>下载后怎么用？</summary><p>解压后，将完整的 <code>roamorrow-nomad-planner</code> 文件夹放进客户端支持的 Skills 目录，再开启新会话。具体目录以客户端说明为准；安装 Skill 不会自动配置 MCP。</p><p>可以与上方 MCP 搭配使用；支持本地 Node.js 22 或更新版本的工具，也可通过包内查询脚本访问同一份公开资料。<a href="https://github.com/cubxxw/RemoteAI-Nomads/tree/main/skills/roamorrow-nomad-planner" target="_blank" rel="noopener noreferrer">查看完整说明 ↗</a></p></details>
  </section>
  <section class="connect-more" aria-label="资料范围与连接帮助">
    <div><h2>连接后，可以查什么？</h2><p>按国家或月份筛选候选，比较城市消费样本、历史气候与工作条件，换算会议时间，按明确的费用项目核算预算。</p><a class="connect-text-link" href="/about/">了解数据与方法 ${icon('arrow-right')}</a></div>
    <div class="connect-faq"><details><summary>这些资料有多新？</summary><p>每次查询会返回资料来源、日期与缺口。气候资料是历史记录，费用来自不同日期的样本。出发前仍应核实实时天气、住宿报价和官方入境规定。</p></details><details><summary>连接不上，先检查什么？</summary><p>确认地址以 <code>/mcp</code> 结尾，传输方式为 HTTP，并检查客户端是否支持远程 MCP。浏览器直接打开服务地址并不能验证连接；可用<a href="https://mcp.roamorrow.com/healthz" target="_blank" rel="noopener noreferrer">服务健康检查 ↗</a>查看服务状态。遇到请求限流时，稍后再试。</p></details><details><summary>想直接在代码里查询？</summary><p>也可使用无需登录的 JSON API。参数、原始数据说明与调用示例见<a href="https://github.com/cubxxw/RemoteAI-Nomads/tree/main/mcp#readme" target="_blank" rel="noopener noreferrer">开发文档 ↗</a>。公开服务有请求频率与结果数量限制。</p></details></div>
  </section>
</div><script type="module" src="/modules/agent-connect.js"></script>`,
  };
}

