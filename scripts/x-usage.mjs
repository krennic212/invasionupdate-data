#!/usr/bin/env node
/**
 * Daily X read counter (hard cap 999 calls per CT day, across every run and every agent on the box).
 * Call `reserve` BEFORE every X MCP call (search_posts_all, get_users_posts, user lookups, ...).
 * If the reservation would pass the cap it exits 1 and writes nothing: stop the run.
 *
 *   node scripts/x-usage.mjs reserve [n=1] [note]   # +n, exit 1 if total would be > 999
 *   node scripts/x-usage.mjs status                 # print today's count
 *
 * File: $XSCAN_USAGE_DIR/usage-YYYY-MM-DD.json (default /workspace/invasionupdate-xscan, CT date).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DAILY_CAP = 999;
export const USAGE_DIR = process.env.XSCAN_USAGE_DIR || "/workspace/invasionupdate-xscan";

export function ctDate(d = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function usageFile(dir = USAGE_DIR, d = new Date()) {
  return `${dir}/usage-${ctDate(d)}.json`;
}

export function readUsage(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { date: file.match(/usage-(.*)\.json$/)?.[1] || "", calls: 0, log: [] };
}

/** Pure: would n more calls stay within the cap? Returns the new usage or null. */
export function reserveCalls(usage, n = 1, note = "", cap = DAILY_CAP) {
  if (!Number.isInteger(n) || n < 1) throw new Error("n must be a positive integer");
  if (usage.calls + n > cap) return null;
  return { ...usage, calls: usage.calls + n, log: [...(usage.log || []), { at: new Date().toISOString(), n, note }].slice(-2000) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd = "status", nArg = "1", ...rest] = process.argv.slice(2);
  mkdirSync(USAGE_DIR, { recursive: true });
  const file = usageFile();
  const usage = readUsage(file);
  if (cmd === "status") {
    console.log(JSON.stringify({ file, calls: usage.calls, cap: DAILY_CAP, left: DAILY_CAP - usage.calls }));
  } else if (cmd === "reserve") {
    const next = reserveCalls(usage, Number(nArg), rest.join(" "));
    if (!next) {
      console.error(`X DAILY CAP: ${usage.calls} used today (${file}); ${nArg} more would pass ${DAILY_CAP}. Stop the run.`);
      process.exit(1);
    }
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    console.log(JSON.stringify({ file, calls: next.calls, left: DAILY_CAP - next.calls }));
  } else {
    console.error("usage: x-usage.mjs reserve [n] [note] | status");
    process.exit(2);
  }
}
