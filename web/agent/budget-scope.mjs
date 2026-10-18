// A narrow guard for observed Chinese budget-scope failures, not a general
// natural-language truth checker. Unknown scope stays pending; it is not zero.
const exclusion=/(?:不含|不包含|不包括|未包含)[^。；，,\n|]{0,40}|(?:机票|航班|火车票|动车票|高铁票|大交通|往返交通)(?:费用)?(?:另算|单独计算)/g;
const flights=/机票|航班|flight/i;
const rail=/动车|高铁|火车|rail|train/i;
const broad=/大交通|往返交通|往返路费|到达目的地的交通/;
const uncertain=/是否|[？?吗]|能否|不能|不要|并非|不应|未说|没说|假设|如果|若|假如|不确定/;
const assumed=/(?:若|如果|假如|假设|假定)[^，,。；\n]{0,18}$/;
const caution=/(?:不能|不可|不应)(?:默认|断言|说|认为|写成|理解为|当成|算作)[^，,。；\n]{0,12}$/;
function subjects(text){return {all:broad.test(text),flight:flights.test(text),train:rail.test(text)};}
export function auditBudgetScope(answer,input){
  const allowed={all:false,flight:false,train:false};
  const users=[...(input.history||[]).filter(m=>m.role==='user').map(m=>m.content),input.question];
  for(const user of users){
    for(const clause of user.match(/[^。；，,\n？?]+[。；，,\n？?]?/g)||[]){
      // A newer explicit inclusion revokes an earlier exclusion. Do not read a
      // question or a negated exclusion as permission to enlarge the budget.
      const clean=clause.replace(exclusion,'');
      if(/包含|包括|计入|算进|纳入|交通都算|不能不含/.test(clean)||/不能不含/.test(clause)){
        const scope=subjects(clause);
        if(scope.all){allowed.all=false;allowed.flight=false;allowed.train=false;}
        else {if(scope.flight){allowed.flight=false;allowed.all=false;}if(scope.train){allowed.train=false;allowed.all=false;}}
      }
      if(uncertain.test(clause))continue;
      for(const match of clause.matchAll(exclusion)){
        const scope=subjects(match[0]);
        if(scope.all){allowed.all=true;allowed.flight=true;allowed.train=true;}
        else{if(scope.flight)allowed.flight=true;if(scope.train)allowed.train=true;}
      }
    }
  }
  for(const line of answer.split(/[。；\n]/)){
    for(const match of line.matchAll(exclusion)){
      const prefix=line.slice(0,match.index);
      if(assumed.test(prefix)||caution.test(prefix))continue;
      const scope=subjects(match[0]);
      if((scope.all&&!allowed.all)||(scope.flight&&!allowed.flight)||(scope.train&&!allowed.train))throw Error('UNCONFIRMED_TRANSPORT_EXCLUSION');
    }
  }
}
