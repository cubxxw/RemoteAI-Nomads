import test from 'node:test';import assert from 'node:assert/strict';
import {auditArguments,auditDisabledFeatures}from'../agent/codex-audit.mjs';
test('optional local critic ignores workspace configuration and disables action tools',()=>{
 const args=auditArguments('/tmp/nomads-audit-test');
 for(const flag of ['--ephemeral','--ignore-user-config','--ignore-rules','read-only','mcp_servers={}','web_search="disabled"','project_doc_max_bytes=0'])assert.ok(args.includes(flag));
 for(const feature of ['shell_tool','apps','plugins','multi_agent','memories','browser_use'])assert.ok(auditDisabledFeatures.includes(feature));
 assert.equal(args.at(-1),'-');assert.ok(!args.some(a=>/API_KEY|BRIDGE_SECRET/.test(a)));
});
