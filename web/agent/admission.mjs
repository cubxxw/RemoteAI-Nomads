// A disconnected request must never start a model after a slow quota write.
export async function reserveConnected(req, res, reserve) {
  const controller = new AbortController();
  const closed = () => req.aborted || res.destroyed || controller.signal.aborted;
  const disconnect = () => controller.abort();
  const release = () => res.off('close', disconnect);
  res.once('close', disconnect);
  if (closed()) { release(); return null; }
  try { await reserve(); }
  catch (error) { release(); if (closed()) return null; throw error; }
  if (closed()) { release(); return null; }
  return {controller, release};
}
