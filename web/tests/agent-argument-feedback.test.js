import test from 'node:test';import assert from 'node:assert/strict';
import {validateArgs,argumentProblems} from '../src/agent-tools.js';
import {submitCheckDefinition} from '../agent/presentation.mjs';
test('invalid native audit fields receive schema feedback without reflecting submitted values',()=>{
 const submitted={checks:[{claim_id:'C1',claim:'private claim',supported:false}],supported:false,issues:[]};
 assert.equal(validateArgs(submitted,submitCheckDefinition.parameters),false);
 const feedback=argumentProblems(submitted,submitCheckDefinition.parameters);
 assert.ok(feedback.some(p=>p.includes('checks[0]: unexpected property')));
 assert.ok(feedback.some(p=>p.includes('checks[0].evidence: required')));
 assert.ok(!JSON.stringify(feedback).includes('private claim'));
 const valid={checks:[{claim_id:'C1',evidence:'Evidence does not establish a market minimum.',supported:false}],supported:false,issues:['Conditional cap is not necessary for every scenario.']};
 assert.equal(validateArgs(valid,submitCheckDefinition.parameters),true);assert.deepEqual(argumentProblems(valid,submitCheckDefinition.parameters),[]);
});
