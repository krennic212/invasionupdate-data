#!/usr/bin/env node
/**
 * Print the batched X search queries for a scan run (JSON array of strings, each <= 1024 chars).
 * One query per batch of OFFICIAL_X_HANDLES, all with the same immigration-wording filter:
 * a post without non-citizen / removal wording can never go live, so it is not worth an X call.
 *
 *   node scripts/x-queries.mjs            -> ["(from:ICEgov OR ...) (alien OR ...) -is:retweet", ...]
 */
import { fileURLToPath } from "node:url";
import { OFFICIAL_X_HANDLES } from "./x-handles.mjs";

export const KEYWORDS = '(alien OR aliens OR national OR nationals OR reentry OR deported OR removed OR noncitizen OR "non-citizen" OR "citizen of" OR "illegally present") -is:retweet';
export const MAX_QUERY = 1024;

export function buildQueries(handles = OFFICIAL_X_HANDLES, keywords = KEYWORDS, max = MAX_QUERY) {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildQueries(), null, 1));
