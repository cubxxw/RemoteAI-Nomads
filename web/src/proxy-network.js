// Authenticate only network attribution across the Vercel -> Cloudflare hop.
// This proof never grants operator access or identifies an existing session.
export async function proxyNetwork(request,env,now=Date.now()){
 const ip=request.headers.get('x-nomads-network-ip'),stamp=request.headers.get('x-nomads-network-time'),signature=request.headers.get('x-nomads-network-signature');
 if(ip===null&&stamp===null&&signature===null)return {address:request.headers.get('CF-Connecting-IP')||'unknown',verified:false};
 if(!env.NOMADS_PROXY_SECRET||!ip||!/^[0-9a-f:.]{3,64}$/i.test(ip)||!/^\d{13}$/.test(stamp||'')||!Number.isSafeInteger(Number(stamp))||Math.abs(now-Number(stamp))>60000||!/^[a-f0-9]{64}$/.test(signature||''))return null;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.NOMADS_PROXY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.match(/../g),value=>parseInt(value,16));
 const verified=await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(stamp+'\n'+ip));
 return verified?{address:ip,verified:true}:null;
}
