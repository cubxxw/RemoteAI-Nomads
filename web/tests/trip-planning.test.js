import test from 'node:test';
import assert from 'node:assert/strict';
import {parseState,stateParams,rankCities} from '../public/modules/ranking.js';
import {applyRankingFilter,toggleQuickFilter} from '../public/modules/rank-controls.js';
import {referenceBudgetIn,RANKING_FX} from '../public/modules/budget-currency.js';
import {budgetBalance} from '../public/modules/traveler-budget.js';

const city=(slug,budget,status='unknown')=>({slug,name:slug,nameEn:slug,country:'Thailand',countryCode:'TH',region:'亚洲',budget,visa:{code:'visa_free'},scores:{safety:8,life:7,internet:8,community:7},months:Array.from({length:12},(_,i)=>({month:i+1,status,meanC:24,highC:29,rainMm:100}))});
test('an exact CNY ceiling filters the dated USD baseline and survives a shared URL',()=>{
 const state=parseState(new URL('https://nomads.test/?budget=6000&budgetCurrency=CNY&month=11'));
 assert.equal(state.budgetCurrency,'CNY');assert.equal(state.budget,6000);
 assert.deepEqual(parseState(new URL('https://nomads.test/?'+stateParams(state))),state);
 assert.deepEqual(rankCities([city('below',890),city('above',900),city('unknown',null)],state).map(c=>c.slug),['below']);
 assert.equal(referenceBudgetIn(900,'CNY'),900*RANKING_FX.cnyPerUSD);
 assert.equal(parseState(new URL('https://nomads.test/?budget=1000')).budgetCurrency,'USD');
 assert.equal(parseState(new URL('https://nomads.test/?budget=1000&budgetCurrency=BAD')).budgetCurrency,'USD');
});
test('a departure month compares every available climate record; original recommendation tags are an explicit restriction',()=>{
 const state=parseState(new URL('https://nomads.test/?month=11'));
 const records=[city('recommended',800,'recommended'),city('unknown',800),city('caution',800,'caution')];
 assert.equal(rankCities(records,state).length,3);
 applyRankingFilter(state,'recommendedOnly',true);
 assert.deepEqual(rankCities(records,state).map(c=>c.slug),['recommended']);
 assert.equal(stateParams(state).get('recommendedOnly'),'1');
 toggleQuickFilter(state,'month',new Date('2026-11-01T00:00:00Z'));
 assert.equal(state.month,null);assert.equal(state.recommendedOnly,false);
 toggleQuickFilter(state,'month',new Date('2026-11-01T00:00:00Z'));
 assert.equal(state.month,11);assert.equal(state.recommendedOnly,true);
});
test('a dated editorial view still requires its original recommended month and exclusions',()=>{
 const state=parseState(new URL('https://nomads.test/?month=10&season=2026-10'));
 assert.equal(rankCities([city('recommended',800,'recommended'),city('caution',800,'caution'),{...city('japan',800,'recommended'),countryCode:'JP'}],state).length,1);
 applyRankingFilter(state,'recommendedOnly',false);
 assert.equal(state.season,'');
 assert.equal(rankCities([city('caution',800,'caution')],state).length,1);
});
test('headroom is explicitly a balance against known daily costs, with blank, zero and excess distinct',()=>{
 assert.deepEqual(budgetBalance(8000,7000),{remaining:1000,error:false});
 assert.deepEqual(budgetBalance(6000,7000),{remaining:-1000,error:false});
 assert.deepEqual(budgetBalance(0,7000),{remaining:-7000,error:false});
 assert.deepEqual(budgetBalance(null,7000),{remaining:null,error:false});
 assert.deepEqual(budgetBalance(8000,null),{remaining:null,error:false});
 assert.equal(budgetBalance(-1,7000).error,true);
});
