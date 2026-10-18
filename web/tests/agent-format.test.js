import test from 'node:test';import assert from 'node:assert/strict';
import {formatAgentAnswer} from '../public/modules/agent-format.js';
test('planning tables and citations are usable without allowing model HTML or external links',()=>{
 const html=formatAgentAnswer('### 2000元怎么安排\n\n| 项目 | 规划上限 |\n| --- | ---: |\n| 住宿 | 800元 [E1] |\n\n<img src=x onerror=alert(1)> [E9]',['E1']);
 assert.ok(html.includes('<table>'));assert.ok(html.includes('data-evidence-id="E1"'));assert.ok(!html.includes('data-evidence-id="E9"'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('<h3>'));assert.ok(html.includes('role="group"'));
});
test('short action lists retain readable semantic lists',()=>{const html=formatAgentAnswer('1. 先确认房租\n2. 再验算餐食\n\n- 交通另算');assert.ok(html.includes('<ol>'));assert.ok(html.includes('<ul>'));});

test('decimal amounts at the start of a paragraph never lose their integer part',()=>{
 const html=formatAgentAnswer('36.7 元/晚是住宿目标，不是报价。\n\n173042 日元是全国月均。\n\n1、先确认住法');
 assert.ok(html.includes('<p>36.7 元/晚'));assert.ok(html.includes('173042 日元'));assert.ok(html.includes('<ol><li>先确认住法'));
});
