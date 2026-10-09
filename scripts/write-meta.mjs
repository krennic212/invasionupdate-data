#!/usr/bin/env node
/**
 * Writes data/harvest-meta.json. Run only when data/harvest.json changed (new pending
 * rows or an approval both count), so `updatedAt` is the time the feed last changed.
 *   node scripts/write-meta.mjs [ISO time]
 *
 * `lastAddedAt` / `lastAdded` / `lastAddedCount` record the last run that actually added
 * named people (from data/harvest-status.json `added`). A run that only re-approves rows,
 * cuts duplicates or adds photos keeps the previous values, so the site's
 * "N added at <time>" badge never resets to 0 and never goes stale.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const readJson = (p, fallback) => {
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};

const isoSeconds = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");

export function buildMeta({ rows, review, status, prev, now }) {
  const list = Array.isArray(rows) ? rows : [];
  const added = Array.isArray(status?.added)
    ? status.added.filter((n) => typeof n === "string" && n.trim())
    : [];
  const statusAt = status?.checkedAtIso || (Number.isFinite(status?.checkedAt) ? new Date(status.checkedAt).toISOString() : null);
  let last = {
    lastAddedAt: prev?.lastAddedAt ?? null,
    lastAddedCount: prev?.lastAddedCount ?? 0,
    lastAdded: Array.isArray(prev?.lastAdded) ? prev.lastAdded : [],
  };
  if (added.length && statusAt && !Number.isNaN(Date.parse(statusAt))) {
    const at = isoSeconds(statusAt);
    if (!last.lastAddedAt || Date.parse(at) >= Date.parse(last.lastAddedAt)) {
      last = { lastAddedAt: at, lastAddedCount: added.length, lastAdded: added };
    }
  }
  return {
    updatedAt: now,
    rows: list.length,
    approved: list.filter((r) => r?.status === "approved").length,
    pending: list.filter((r) => r?.status === "pending").length,
    photos: list.filter((r) => r?.photo).length,
    reviewRows: Array.isArray(review) ? review.length : 0,
    ...last,
    source: "https://github.com/krennic212/invasionupdate-data",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const meta = buildMeta({
    rows: readJson("data/harvest.json", []),
    review: readJson("data/review.json", []),
    status: readJson("data/harvest-status.json", null),
    prev: readJson("data/harvest-meta.json", null),
    now: process.argv[2] || isoSeconds(Date.now()),
  });
  writeFileSync("data/harvest-meta.json", `${JSON.stringify(meta, null, 2)}\n`);
  console.log(JSON.stringify(meta));
}
