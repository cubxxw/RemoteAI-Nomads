// Reserve the ID before any I/O: parallel reads may finish in any order.
export async function readWithEvidence(run, { name, args, label }, read, emit) {
  const number = ++run.calls;
  if (number > 20) {run.limit_hit='TOOL_BUDGET';throw Error("TOOL_BUDGET");}
  const id = "E" + number,
    started = Date.now();
  emit("tool_start", { call_id: id, tool: name, label });
  try {
    const result = await read();
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 64000)
      throw Error("TOOL_RESULT_LIMIT");
    run.evidence.set(id, { tool: name, args, result });
    for (const city of result.cities || []) run.cities.set(city.slug, city);
    for (const source of result.sources || []) run.sourceIds.add(source.id);
    emit("tool_end", {
      call_id: id,
      tool: name,
      label:
        label +
        (result.cities?.length === 1 ? " · " + result.cities[0].name : ""),
      ok: !result.error,
      duration_ms: Date.now() - started,
      count: result.data?.matched ?? result.cities?.length ?? 0,
    });
    return { ...result, _evidence_id: id };
  } catch (error) {
    emit("tool_end", {
      call_id: id,
      tool: name,
      label,
      ok: false,
      duration_ms: Date.now() - started,
    });
    throw error;
  }
}
