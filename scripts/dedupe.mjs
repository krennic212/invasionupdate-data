#!/usr/bin/env node
/**
 * Post-harvest cleanup for a rows file (data/harvest.json or data/review.json).
 * The ONLY things it changes:
 *  - cuts duplicate rows: same person + same case. "Same case" means the same
 *    source URL, or the same release slug at another official URL
 *    (justice.gov/usao-xx/pr/<slug> vs justice.gov/opa/pr/<slug>).
 *    The first row in the file is kept as is.
 *    Co-defendants (different names on one release) are never merged.
 *  - blanks any photo that is not a copy in this repo (data/photos via Pages), and every photo on
 *    review rows (X / news), so the data never hotlinks or carries an X / news image.
 * Writes only when something changed.
 *
 *   node scripts/dedupe.mjs data/harvest.json [data/review.json ...]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nameKey, urlsIn } from "./rules.mjs";
import { PHOTO_PREFIX } from "./photo-rules.mjs";

export function urlKey(url) {
  try {
    const u = new URL(String(url).trim());
    return `${u.hostname.replace(/^(www|legacy)\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}

export function releaseSlug(url) {
  try {
    const seg = new URL(String(url).trim()).pathname.replace(/\/+$/, "").split("/").pop() || "";
    return seg.length >= 16 && /-/.test(seg) ? seg.toLowerCase() : "";
  } catch {
    return "";
  }
}

export function dedupeRows(rows) {
  const out = [];
  const merged = [];
  const seen = new Map();
  for (const r of rows) {
    // Only photos copied into this repo by scripts/photos.mjs survive; anything else is blanked.
    const keep = r && typeof r === "object" && String(r.photo || "").startsWith(PHOTO_PREFIX) && !r.reviewReason;
    const row = r && typeof r === "object" && r.photo && !keep ? { ...r, photo: "" } : r;
    const n = nameKey(row?.name);
    if (!n) {
      out.push(row);
      continue;
    }
    const urls = urlsIn(row.sourceUrl);
    const keys = [];
    for (const u of urls.length ? urls : [String(row.sourceUrl || "")]) {
      keys.push(`u|${n}|${urlKey(u)}`);
      const s = releaseSlug(u);
      if (s) keys.push(`s|${n}|${s}`);
    }
    const hit = keys.map((k) => seen.get(k)).find(Boolean);
    if (hit) {
      merged.push({ name: row.name, kept: hit.sourceUrl, dropped: row.sourceUrl });
      continue;
    }
    keys.forEach((k) => seen.set(k, row));
    out.push(row);
  }
  return { rows: out, merged };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) files.push("data/harvest.json");
  for (const file of files) {
    if (!existsSync(file)) continue;
    const before = readFileSync(file, "utf8");
    const parsed = JSON.parse(before);
    const { rows, merged } = dedupeRows(Array.isArray(parsed) ? parsed : []);
    const after = `${JSON.stringify(rows, null, 2)}\n`;
    if (after !== before) writeFileSync(file, after);
    console.log(JSON.stringify({ file, rows: rows.length, merged, changed: after !== before }));
  }
}
