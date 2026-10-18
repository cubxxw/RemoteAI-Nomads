import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
export function createQuota(filename) {
  let queue = Promise.resolve();
  return async function reserve({ owner, network, evaluation = false }) {
    const operation = queue
      .catch(() => {})
      .then(async () => {
        const now = Date.now(),
          day = 86400000,
          hour = 3600000;
        let events = [];
        try {
          events = JSON.parse(await readFile(filename, "utf8"));
        } catch (e) {
          if (e.code !== "ENOENT") throw Error("QUOTA_UNAVAILABLE");
        }
        events = events.filter((e) => now - e.at < day);
        if (evaluation) {
          if (events.filter((e) => e.evaluation).length >= 450)
            throw Error("EVAL_DAILY_LIMIT");
        } else {
          const ordinary = events.filter((e) => !e.evaluation);
          if (
            ordinary.length >= 50 ||
            ordinary.filter((e) => e.owner === owner).length >= 40 ||
            ordinary.filter((e) => e.network === network && now - e.at < hour)
              .length >= 24 ||
            ordinary.filter((e) => e.owner === owner && now - e.at < hour)
              .length >= 12
          )
            throw Error("DAILY_OR_HOURLY_LIMIT");
        }
        events.push({ at: now, owner, network, evaluation });
        await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
        const pending = filename + ".pending";
        await writeFile(pending, JSON.stringify(events), { mode: 0o600 });
        await rename(pending, filename);
      });
    queue = operation;
    return operation;
  };
}
