export async function reservePublicAnswer(env, owner, network, now = Date.now()) {
  const networkHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(env.AGENT_BRIDGE_SECRET + ':' + network)))].map(n => n.toString(16).padStart(2, '0')).join('');
  const day = now - 86400000, hour = now - 3600000;
  const globalLimit = Number(env.AGENT_DAILY_LIMIT || 20);
  const result = await env.DB.prepare(`INSERT INTO agent_admissions(id,owner_hash,network_hash,created_at)
    SELECT ?1,?2,?3,?4 WHERE
    (SELECT count(*) FROM agent_admissions WHERE created_at>?5)<?7 AND
    (SELECT count(*) FROM agent_admissions WHERE owner_hash=?2 AND created_at>?5)<10 AND
    (SELECT count(*) FROM agent_admissions WHERE network_hash=?3 AND created_at>?6)<8 AND
    (SELECT count(*) FROM agent_admissions WHERE owner_hash=?2 AND created_at>?6)<4`)
    .bind(crypto.randomUUID(), owner, networkHash, now, day, hour, globalLimit).run();
  return result.meta?.changes === 1;
}
