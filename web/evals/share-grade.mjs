export const SHARE_DIMENSIONS=['coverage','accuracy','privacy','usability','reading','visual','platform','resilience'];
export function gradeShareRelease(review={}){
 const dimensions={},reasons=[];
 for(const key of SHARE_DIMENSIONS){const row=review.dimensions?.[key],score=row?.score;dimensions[key]=typeof score==='number'&&Number.isFinite(score)&&score>=0&&score<=100?score:null;
  if(dimensions[key]===null){reasons.push(key+': 未测');continue;}if(score<97)reasons.push(key+': 未超过96');
  const required=['reading','visual'].includes(key)?'target-user':key==='platform'?'platform-receipt':null;
  if(!row.evidence?.some(item=>item.artifact&&item.kind&&(!required||item.kind===required)))reasons.push(key+': 缺少对应证据');
 }
 if(review.criticalFailures?.length)reasons.push('存在关键失败：'+review.criticalFailures.join('；'));
 return {passed:reasons.length===0,dimensions,reasons};
}
