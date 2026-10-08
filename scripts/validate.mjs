#!/usr/bin/env node
/**
 * Guardrail check run before anything is committed or published. Fails the job if:
 *  - data/harvest.json is not a non-empty array
 *  - any live row lacks a name, an official federal source link, or a date
 *  - any live row carries a photo, or has a status other than "approved" / "pending"
 *  - any row in the previous committed feed is missing now (the feed never shrinks silently)
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isOfficialRow, nameKey } from "./rules.mjs";

const FILE = process.argv[2] || "data/harvest.json";
const rows = JSON.parse(readFileSync(FILE, "utf8"));
const problems = [];
if (!Array.isArray(rows) || rows.length === 0) problems.push("feed is empty or not an array");
for (const [i, r] of (Array.isArray(rows) ? rows : []).entries()) {
  const tag = `row ${i} (${r?.name ?? "?"})`;
  if (!r || typeof r !== "object") { problems.push(`${tag}: not an object`); continue; }
  if (typeof r.name !== "string" || !r.name.trim()) problems.push(`${tag}: no name`);
  if (!isOfficialRow(r)) problems.push(`${tag}: no official federal source link`);
  if (typeof r.when !== "string" || !r.when.trim()) problems.push(`${tag}: no date`);
  if (r.photo) problems.push(`${tag}: photo must be empty`);
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
