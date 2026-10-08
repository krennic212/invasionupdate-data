#!/usr/bin/env node
/**
 * Writes data/harvest-meta.json. Run only when data/harvest.json changed (new pending
 * rows or an approval both count), so `updatedAt` is the time the feed last changed.
 *   node scripts/write-meta.mjs [ISO time]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const rows = JSON.parse(readFileSync("data/harvest.json", "utf8"));
const review = existsSync("data/review.json") ? JSON.parse(readFileSync("data/review.json", "utf8")) : [];
const list = Array.isArray(rows) ? rows : [];
const meta = {
  updatedAt: process.argv[2] || new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  rows: list.length,
  approved: list.filter((r) => r?.status === "approved").length,
  pending: list.filter((r) => r?.status === "pending").length,
  reviewRows: Array.isArray(review) ? review.length : 0,
  source: "https://github.com/krennic212/invasionupdate-data",
};
writeFileSync("data/harvest-meta.json", `${JSON.stringify(meta, null, 2)}\n`);
console.log(JSON.stringify(meta));
