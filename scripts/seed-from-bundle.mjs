#!/usr/bin/env node
/**
 * One-time seed: split the app's bundled public/harvest.json into
 *   data/harvest.json  (rows with an official federal source link; goes live)
 *   data/review.json   (X posts, reporters, news; NOT live, kept for review)
 * Live rows start as status "approved" (they are already on the site).
 * Photos are blanked in both. No row is dropped: every input row lands in one file.
 *   node scripts/seed-from-bundle.mjs /path/to/public/harvest.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { routeRows } from "./rules.mjs";

const src = process.argv[2];
if (!src) throw new Error("usage: seed-from-bundle.mjs <bundled harvest.json>");
const rows = JSON.parse(readFileSync(src, "utf8"));
const { live, review } = routeRows(rows);
if (live.length + review.length !== rows.length) throw new Error("seed lost rows");
writeFileSync("data/harvest.json", `${JSON.stringify(live.map((r) => ({ ...r, status: "approved" })), null, 2)}\n`);
writeFileSync("data/review.json", `${JSON.stringify(review, null, 2)}\n`);
console.log(JSON.stringify({ input: rows.length, live: live.length, review: review.length }));
