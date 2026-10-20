#!/usr/bin/env node
/**
 * Writes data/harvest-meta.json. Runs on every job run; `updatedAt` is the time data/harvest.json last changed
 * (kept while its sha256, stored as harvestSha256, is unchanged; new pending rows or an approval both count).
 *   node scripts/write-meta.mjs [ISO time]
 *
 * `lastAddedAt` / `lastAdded` / `lastAddedCount` record the last run that actually added
 * named people (from data/harvest-status.json `added`). A run that only re-approves rows,
 * cuts duplicates or adds photos keeps the previous values, so the site's
 * "N added at <time>" badge never resets to 0 and never goes stale.
 * lastAdded only ever lists people whose row is currently approved (held rows drop out).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const nameKey = (n) => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

const readJson = (p, fallback) => {
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};

const isoSeconds = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");

export function buildMeta({ rows, review, status, prev, now, text }) {
  const list = Array.isArray(rows) ? rows : [];
  // text = harvest.json as published: its sha256 is stored, and updatedAt is kept while the file is unchanged.
  const hash = typeof text === "string" ? sha256(text) : null;
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
  // lastAdded lists only people whose row is approved right now (a row held later, e.g. a place name read
  // as a person, drops out); lastAddedCount follows the list.
  const approvedNames = new Set(list.filter((r) => r?.status === "approved" && !r?.holdReason).map((r) => nameKey(r?.name)));
  const keep = last.lastAdded.filter((n) => approvedNames.has(nameKey(n)));
  if (keep.length !== last.lastAdded.length) last = { ...last, lastAdded: keep, lastAddedCount: keep.length };
  return {
    updatedAt: hash && prev?.harvestSha256 === hash && prev?.updatedAt ? prev.updatedAt : now,
    rows: list.length,
    approved: list.filter((r) => r?.status === "approved").length,
    pending: list.filter((r) => r?.status === "pending").length,
    photos: list.filter((r) => r?.photo).length,
    reviewRows: Array.isArray(review) ? review.length : 0,
    ...last,
    ...(hash ? { harvestSha256: hash } : {}),
    source: "https://github.com/krennic212/invasionupdate-data",
  };
}

/** When harvest.json last changed: now for an uncommitted change (a harvest run), else its last commit's time. */
function changedAt(file) {
  try {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", file], { stdio: "ignore" });
    const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", file], { encoding: "utf8" }).trim();
    if (iso) return isoSeconds(iso);
  } catch {
    // uncommitted change or no git
  }
  return isoSeconds(Date.now());
}

// Safe to run on every job run: with harvest.json unchanged (same sha256) updatedAt stays; a pushed harvest.json edit
// that was never stamped gets its commit time; a change made by this run gets now.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = existsSync("data/harvest.json") ? readFileSync("data/harvest.json", "utf8") : "[]";
  const meta = buildMeta({
    rows: JSON.parse(text),
    review: readJson("data/review.json", []),
    status: readJson("data/harvest-status.json", null),
    prev: readJson("data/harvest-meta.json", null),
    now: process.argv[2] || changedAt("data/harvest.json"),
    text,
  });
  const out = `${JSON.stringify(meta, null, 2)}\n`;
  if (!existsSync("data/harvest-meta.json") || readFileSync("data/harvest-meta.json", "utf8") !== out) writeFileSync("data/harvest-meta.json", out);
  console.log(JSON.stringify(meta));
}
