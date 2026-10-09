#!/usr/bin/env node
/**
 * Print the batched X search queries for a scan run (JSON array of strings, each <= 1024 chars).
 * One query per batch of LIVE_X_HANDLES (official agency accounts + trusted reporters), all with the same immigration-wording filter:
 * a post without non-citizen / removal wording can never go live, so it is not worth an X call.
 *
 *   node scripts/x-queries.mjs            -> ["(from:ICEgov OR ...) (alien OR ...) -is:retweet", ...]
 */
import { fileURLToPath } from "node:url";
import { LIVE_X_HANDLES } from "./x-handles.mjs";

export const KEYWORDS = '(alien OR aliens OR national OR nationals OR reentry OR deported OR removed OR noncitizen OR "non-citizen" OR "citizen of" OR "illegally present") -is:retweet';
export const MAX_QUERY = 1024;

export function buildQueries(handles = LIVE_X_HANDLES, keywords = KEYWORDS, max = MAX_QUERY) {
  const out = [];
  let cur = [];
  const render = (hs) => `(${hs.map((h) => `from:${h}`).join(" OR ")}) ${keywords}`;
  for (const h of handles) {
    if (cur.length && render([...cur, h]).length > max) { out.push(render(cur)); cur = []; }
    cur.push(h);
  }
  if (cur.length) out.push(render(cur));
  return out;
}

/** X snowflake id -> creation time (ms since epoch). */
export function snowflakeTime(id) {
  return Number((BigInt(id) >> 22n) + 1288834974657n);
}

export const LOOKBACK_MIN = 75;

/**
 * Search window (Krennic rule 2026-10-09): cover at least the last 75 minutes, starting from whichever is EARLIER:
 * the post after lastSeenId, or now - 75 min. Returns { since_id } or { start_time } (ISO). Dedupe handles overlap.
 * With no lastSeenId, falls back to start_time = now - 75 min.
 */
export function searchWindow(lastSeenId, now = Date.now(), lookbackMin = LOOKBACK_MIN) {
  const floor = now - lookbackMin * 60_000;
  if (lastSeenId && snowflakeTime(lastSeenId) <= floor) return { since_id: String(lastSeenId) };
  return { start_time: new Date(floor).toISOString().replace(/\.\d{3}Z$/, "Z") };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--window") {
    const { readFileSync } = await import("node:fs");
    const state = JSON.parse(readFileSync(new URL("../data/x-scan-state.json", import.meta.url), "utf8"));
    console.log(JSON.stringify(searchWindow(state.lastSeenId)));
  } else console.log(JSON.stringify(buildQueries(), null, 1));
}
