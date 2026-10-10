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
 *  - shared feed rules for every writer (release harvest, X scan, hand edits):
 *      victim names in row text are replaced with a neutral description (scripts/victims.mjs);
 *      a row with photoHold never carries a photo.
 * Writes only when something changed.
 *
 * Also reports likely cross-row duplicates (never auto-merged): when one normalized
 * name is the other plus extra leading given names, the surname tokens match, and
 * the country (origin) matches.
 *
 *   node scripts/dedupe.mjs data/harvest.json [data/review.json ...]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nameKey, urlsIn } from "./rules.mjs";
import { PHOTO_PREFIX } from "./photo-rules.mjs";
import { scrubVictimNames } from "./victims.mjs";

/** Shared normalize step applied to every row in every rows file. */
export function normalizeRow(r) {
  if (!r || typeof r !== "object") return r;
  let row = scrubVictimNames(r).row;
  if (row.photoHold && row.photo) {
    row = { ...row, photo: "" };
    delete row.photoSourceUrl;
  }
  return row;
}

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

export function nameTokens(name) {
  return nameKey(name).split(" ").filter(Boolean);
}

/**
 * True when one normalized name is the other plus one or more extra leading given
 * names (longer = leading token(s) + shorter), and the surname tokens match.
 * Surname tokens = the last two tokens of the shorter name when it has 3+ tokens,
 * otherwise its last token (one given + one surname).
 */
export function leadingGivenNameVariant(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length < 2 || tb.length < 2 || ta.length === tb.length) return false;
  const [long, short] = ta.length > tb.length ? [ta, tb] : [tb, ta];
  if (long.slice(-short.length).join(" ") !== short.join(" ")) return false;
  const surnameCount = short.length >= 3 ? 2 : 1;
  return long.slice(-surnameCount).join(" ") === short.slice(-surnameCount).join(" ");
}

export function countryKey(row) {
  const o = nameKey(row?.origin);
  if (!o || o === "not stated" || o === "unknown") return "";
  return o;
}

/**
 * Flag pairs that look like the same person under a longer / shorter given-name
 * form with the same country. Never merges; report only.
 * rowsByFile: [{ file, rows }]
 */
export function findLikelyDuplicates(rowsByFile) {
  const flat = [];
  for (const { file, rows } of rowsByFile || []) {
    for (const r of rows || []) {
      if (!r || typeof r !== "object") continue;
      const n = nameKey(r.name);
      const c = countryKey(r);
      if (!n || !c) continue;
      flat.push({ file, row: r, name: n, country: c });
    }
  }
  const out = [];
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i];
      const b = flat[j];
      if (a.country !== b.country) continue;
      if (a.name === b.name) continue;
      if (!leadingGivenNameVariant(a.row.name, b.row.name)) continue;
      out.push({
        a: { id: a.row.id || "", name: a.row.name, origin: a.row.origin || "", file: a.file },
        b: { id: b.row.id || "", name: b.row.name, origin: b.row.origin || "", file: b.file },
        reason: "leading given-name variant; surname tokens match; same country",
      });
    }
  }
  return out;
}

export function dedupeRows(rows) {
  const out = [];
  const merged = [];
  const seen = new Map();
  for (const r0 of rows) {
    const r = normalizeRow(r0);
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
  const rowsByFile = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const before = readFileSync(file, "utf8");
    const parsed = JSON.parse(before);
    const { rows, merged } = dedupeRows(Array.isArray(parsed) ? parsed : []);
    const after = `${JSON.stringify(rows, null, 2)}\n`;
    if (after !== before) writeFileSync(file, after);
    rowsByFile.push({ file, rows });
    console.log(JSON.stringify({ file, rows: rows.length, merged, changed: after !== before }));
  }
  const likelyDuplicates = findLikelyDuplicates(rowsByFile);
  if (likelyDuplicates.length) {
    console.log(JSON.stringify({ likelyDuplicates }));
  }
}
