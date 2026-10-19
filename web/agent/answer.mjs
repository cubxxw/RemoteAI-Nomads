import { parseState, stateParams } from "../public/modules/ranking.js";
import { toolLabels } from "../src/agent-tools.js";
export function parseAnswer(text, run) {
  const value = JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, ""),
  );
  if (
    typeof value.answer !== "string" ||
    !value.answer.trim() ||
    value.answer.length > 8000
  )
    throw Error("INVALID_ANSWER");
  value.answer=value.answer.replace(/[（(]\s*(E\d+)\s*[）)]/g,'[$1]');
  const ids = Array.isArray(value.evidence_ids) ? value.evidence_ids : [];
  if (ids.length > 20 || ids.some((id) => !run.evidence.has(id)))
    throw Error("UNREAD_EVIDENCE");
  if (run.calls > 0 && !ids.length) throw Error("MISSING_EVIDENCE");
  const slugs = Array.isArray(value.city_slugs) ? value.city_slugs : [];
  if (slugs.length > 5) throw Error("TOO_MANY_CITY_CARDS");
  if (slugs.some((s) => !run.cities.has(s))) throw Error("UNREAD_CITY");
  const selectedEvidence = ids.map((id) => run.evidence.get(id));
  const searches = selectedEvidence.filter((e) => e.tool === "search_cities");
  const primary =
    searches.at(-1) ||
    selectedEvidence.filter((e) => e.tool === "compare_cities").at(-1);
  const cities = [...new Set(slugs)].map(
    (s) =>
      searches
        .slice()
        .reverse()
        .flatMap((e) => e.result.cities || [])
        .find((c) => c.slug === s) ||
      primary?.result.cities?.find((c) => c.slug === s) ||
      selectedEvidence
        .flatMap((e) => e.result.cities || [])
        .find((c) => c.slug === s) ||
      run.cities.get(s),
  );
  const citationIds = [...value.answer.matchAll(/\[(E\d+)\]/g)].map((m) => m[1]);
  if (citationIds.some((id) => !ids.includes(id))) throw Error("UNREAD_CITATION");
  const evidence = ids.map((id) => {
    const e = run.evidence.get(id);
    return {
      id,
      tool: e.tool,
      label: toolLabels[e.tool],
      sources: e.result.sources || [],
      warnings: e.result.warnings || [],
    };
  });
  const filters = value.suggested_filters ?? {};
  let ranking_url = null;
  const valid = {
    q: (v) => typeof v === "string" && v.length <= 100,
    region: (v) => ["亚洲", "欧洲", "美洲", "非洲", "大洋洲"].includes(v),
    budget: (v) =>
      typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100000,
    month: (v) => Number.isInteger(v) && v >= 1 && v <= 12,
    visa: (v) =>
      [
        "visa_free",
        "evisa",
        "arrival",
        "visa_required",
        "domestic",
        "permit",
      ].includes(v),
    warm: (v) => typeof v === "boolean",
  };
  if (
    !filters ||
    typeof filters !== "object" ||
    Array.isArray(filters) ||
    Object.entries(filters).some(([k, v]) => !valid[k]?.(v)) ||
    (filters.warm && !filters.month)
  )
    throw Error("INVALID_FILTER");
  const lastSearch = searches.at(-1);
  if (Object.keys(filters).length && lastSearch) {
    // Only offer an apply action if the browser can express the complete query.
    const a = lastSearch.result.data?.filters || lastSearch.args,
      unsupported =
        ["min_safety", "min_internet", "min_temp", "max_temp"].some(
          (k) => a[k] !== undefined,
        ) ||
        (a.month && a.recommended_only !== true) ||
        !!a.country ||
        a.sort === "reference_cost" ||
        (a.preset && a.preset !== "default");
    if (!unsupported) {
      const exact = {
        q: a.query || (a.country ? lastSearch.result.data.country?.name_zh || a.country : ""),
        region: a.region || "",
        budget: a.max_budget || null,
        month: a.month || null,
        recommendedOnly:!!a.month&&a.recommended_only===true,
        visa: a.visa || "",
        warm: false,
      };
      const state = {
        ...parseState(new URL("http://local/")),
        ...exact,
        ...(lastSearch.result.data?.weights ? { weights: lastSearch.result.data.weights } : a.weights ? { weights:a.weights } : {}),
        incomplete: a.incomplete !== false,
      };
      ranking_url = "/?" + stateParams(state).toString();
    }
  }
  return {
    answer: value.answer,
    cities,
    evidence,
    ranking_url,
    followups: (Array.isArray(value.followups) ? value.followups : [])
      .filter((x) => typeof x === "string" && x.length <= 140)
      .slice(0, 2),
    trace_id: run.id,
    evidence_checked: ids.length > 0,
  };
}
