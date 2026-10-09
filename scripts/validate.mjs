#!/usr/bin/env node
/**
 * Guardrail check run before anything is committed or published. Fails the job if:
 *  - data/harvest.json is not a non-empty array
 *  - any live row lacks a name, an official source link (official federal .gov page, or a
 *    https://x.com/<handle>/status/<id> post by an OFFICIAL_X_HANDLES agency account), or a date
 *  - any live row has a status other than "approved" / "pending"
 *  - any row carries a photo that is not allowed: a photo is allowed only on an approved,
 *    unheld, official row whose release produced exactly one row, with a single-person photo
 *    check on record, served from this repo's Pages site, and the file exists (<= 300 KB)
 *  - any row in the previous committed feed is missing now (the feed never shrinks silently)
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isLiveSourceRow, nameKey } from "./rules.mjs";
import { photoProblem, releaseCounts } from "./photo-rules.mjs";

const FILE = process.argv[2] || "data/harvest.json";
const rows = JSON.parse(readFileSync(FILE, "utf8"));
const problems = [];
const review = existsSync("data/review.json") ? JSON.parse(readFileSync("data/review.json", "utf8")) : [];
const checks = existsSync("data/photo-checks.json") ? JSON.parse(readFileSync("data/photo-checks.json", "utf8")) : {};
const counts = releaseCounts([...(Array.isArray(rows) ? rows : []), ...review]);
const fileBytes = (f) => (existsSync(`data/photos/${f}`) ? statSync(`data/photos/${f}`).size : null);
for (const r of review) if (r && r.photo) problems.push(`review row (${r.name}): photo must be empty (X / news rows never get photos)`);
if (!Array.isArray(rows) || rows.length === 0) problems.push("feed is empty or not an array");
for (const [i, r] of (Array.isArray(rows) ? rows : []).entries()) {
  const tag = `row ${i} (${r?.name ?? "?"})`;
  if (!r || typeof r !== "object") { problems.push(`${tag}: not an object`); continue; }
  if (typeof r.name !== "string" || !r.name.trim()) problems.push(`${tag}: no name`);
  if (!isLiveSourceRow(r)) problems.push(`${tag}: no official federal source link (.gov page or official agency X post)`);
  if (typeof r.when !== "string" || !r.when.trim()) problems.push(`${tag}: no date`);
  const pp = photoProblem(r, { counts, checks, fileBytes });
  if (pp) problems.push(`${tag}: ${pp}`);
  if (r.status === "approved" && r.holdReason) problems.push(`${tag}: approved but has holdReason (${r.holdReason}); approve it by id only after review, and clear holdReason`);
  if (r.status !== "approved" && r.status !== "pending") problems.push(`${tag}: status must be "approved" or "pending"`);
}
let prior = [];
try {
  prior = JSON.parse(execFileSync("git", ["show", `HEAD:${FILE}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch {
  prior = [];
}
if (Array.isArray(prior) && Array.isArray(rows)) {
  const now = new Set(rows.map((r) => nameKey(r?.name)));
  const lost = prior.filter((r) => !now.has(nameKey(r?.name))).map((r) => r?.name);
  if (lost.length) problems.push(`feed would drop ${lost.length} existing row(s): ${lost.slice(0, 5).join(", ")}`);
}
if (problems.length) {
  console.error(`FEED CHECK FAILED (${problems.length}):\n- ${problems.slice(0, 25).join("\n- ")}`);
  process.exit(1);
}
console.log(JSON.stringify({ file: FILE, rows: rows.length, ok: true }));
