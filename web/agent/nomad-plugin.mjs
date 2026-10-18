export const inject = ["tools", "llm"];
export function apply(ctx, config) {
  const allowed = new Set(config.definitions.map((d) => d.name));
  const request = async (route, payload) => {
    if (Date.now() > config.expiresAt) throw Error("Run expired");
    const r = await fetch(config.bridgeUrl + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Math.max(1, config.expiresAt - Date.now())),
    });
    if (!r.ok) throw Error("Agent operation unavailable");
    return r.json();
  };
  ctx.tools.guard((exec) => {
    if (!allowed.has(exec.name))
      return "This decision assistant has no filesystem, shell, mutation or arbitrary SQL capabilities.";
    if (Date.now() > config.expiresAt) return "Run expired";
  });
  ctx.on("llm/stream", async function* (options, next) {
    await request("/reserve", { maxTokens: options.maxTokens || 3072 });
    for await (const chunk of next()) {
      if (Date.now() > config.expiresAt) throw Error("Run expired");
      if (chunk.type === "usage")
        await request("/usage", { usage: chunk.usage });
      yield chunk;
    }
  });
  for (const d of config.definitions)
    ctx.tools.register({
      ...d,
      output: {
        schema: { type: "object" },
        render: (_, value) => [{ type: "text", text: JSON.stringify(value) }],
      },
      execute: (args) => request("/tool", { name: d.name, args }),
    });
}
