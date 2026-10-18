const string=(maxLength=6000)=>({type:'string',maxLength});
const list=(items,maxItems)=>({type:'array',items,maxItems,minItems:0});
const object=(properties,required)=>({type:'object',properties,required,additionalProperties:false});
export const finishPlanDefinition={
 name:'finish_plan',
 description:'提交面向用户的最终回答草稿供核对和展示。先查资料、计算，再提交；不是额外一次数据查询。简单问题一句答清，复杂规划再用短表。不追加无关判断。具体事实用本次[E1]引用，规划假设明确标注。',
 parameters:object({answer:string(),city_slugs:{...list(string(100),5),description:'卡片只放符合用户硬条件的城市；严格筛选零命中时留空，不把用于解释差异的超标城市充作结果。'},evidence_ids:list(string(10),20),suggested_filters:object({q:string(100),region:string(20),budget:{type:'number',minimum:1,maximum:100000},month:{type:'integer',minimum:1,maximum:12},visa:string(40),warm:{type:'boolean'}},[]),followups:list(string(140),2)},['answer','city_slugs','evidence_ids'])
};
export const submitCheckDefinition={
 name:'submit_check',description:'按给定claims逐项提交核对，每个claim_id恰好一次，核原句整体。evidence简述依据或具体反例；不需要重复原句。存在实质错误时supported=false，并在issues写明冲突。' ,
 parameters:object({checks:list(object({claim_id:string(10),evidence:string(2400),supported:{type:'boolean'}},['claim_id','evidence','supported']),50),supported:{type:'boolean'},issues:list(string(1600),30)},['checks','supported','issues'])
};
