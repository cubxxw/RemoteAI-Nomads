// Do not expose a response to writers until the whole payload is validated.
export async function fetchPlaceBatch(endpoints, query, {
  fetcher = fetch,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onError = () => {},
} = {}) {
  for (const endpoint of endpoints) {
    try {
      const response = await fetcher(endpoint, {method:'POST',body:new URLSearchParams({data:query}),headers:{'User-Agent':'RemoteAI-Nomads/1.0 (https://github.com/cubxxw/RemoteAI-Nomads)'},signal:AbortSignal.timeout(75000)});
      if ([429,406].includes(response.status)) await pause(30000);
      if (!response.ok) throw new Error('HTTP '+response.status);
      const candidate = await response.json();
      if (candidate?.remark || !Array.isArray(candidate?.elements)) throw new Error(candidate?.remark || 'Invalid OSM response');
      return {payload:candidate,endpoint};
    } catch (error) { onError(endpoint+': '+error.message); }
  }
  throw new Error('All OSM endpoints failed; keep the previous snapshot');
}
