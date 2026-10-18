import test from 'node:test';
import assert from 'node:assert/strict';
import {countryAliases} from '../public/modules/country-search.js';
import {countryMatches} from '../public/modules/content-ui.js';
import {rankCities,parseState} from '../public/modules/ranking.js';
import {commandItems} from '../public/modules/rank-controls.js';
const fixtures=[['seoul','首尔','Seoul','KR','大韩民国'],['london','伦敦','London','GB','大不列颠及北爱尔兰联合王国'],['new-york','纽约','New York','US','美利坚合众国']].map(([slug,name,nameEn,countryCode,country])=>({slug,name,nameEn,countryCode,country,baseScore:8,scores:{safety:8,cost:8,climate:8,life:8,internet:8,community:8},months:[],visa:{code:'unknown'}}));
test('common Chinese country names find the same destinations in rankings and commands',()=>{
 for(const [query,slug] of [['韩国','seoul'],['英国','london'],['美国','new-york']]){
  const state=parseState(new URL('https://test/?q='+encodeURIComponent(query)));
  assert.deepEqual(rankCities(fixtures,state).map(city=>city.slug),[slug]);
  assert.deepEqual(commandItems(fixtures,query).filter(item=>item.kind==='city').map(item=>item.value),[slug]);
 }
});
test('directory country abbreviations complement official long names',()=>{
 for(const [query,code] of [['韩国','KR'],['南韩','KR'],['英国','GB'],['美国','US'],['阿联酋','AE'],['老挝','LA']])assert.ok(countryMatches({code,search:countryAliases(code),cities:1},query,false));
});
test('two-letter directory codes match exactly rather than inside unrelated country names',()=>{
 assert.ok(countryMatches({code:'US',search:'United States',cities:1},'us',false));
 assert.equal(countryMatches({code:'AU',search:'Australia',cities:1},'US',false),false);
 assert.equal(countryMatches({code:'',search:'Northern Cyprus',cities:1},'US',false),false);
 assert.equal(countryMatches({code:'KR',search:countryAliases('KR'),cities:0},'韩国',true),false);
});

test('travel English names and abbreviations avoid accidental country substring matches',()=>{
 for(const [query,code] of [['South Korea','KR'],['UK','GB'],['USA','US'],['UAE','AE'],['Vietnam','VN'],['Czech Republic','CZ']]) assert.ok(countryMatches({code,search:countryAliases(code),cities:1},query,false));
 assert.equal(countryMatches({code:'UA',search:'Ukraine',cities:1},'UK',false),false);
 const state=parseState(new URL('https://test/?q=UK'));
 assert.deepEqual(rankCities([...fixtures,{...fixtures[0],slug:'kyiv',country:'Ukraine',countryCode:'UA'}],state).map(city=>city.slug),['london']);
});
