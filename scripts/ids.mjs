/**
 * Row ids: every row in data/harvest.json and data/review.json has a non-empty id that no other row
 * (in either file) uses. Style: <source>-<post id or YYYYMMDD>-<name-slug>, e.g.
 *   x-2108648490519945233-alejandro-rojas-garcia   (X post)
 *   doj-20261009-efrain-antonio-avalos             (press release)
 * A clash gets -2, -3, ... (same as the scan / harvest writers). Ids are stable: once written they
 * are never recomputed (photo file names that were based on an old id keep their file and URL).
 */
import { slug } from "./parse.mjs";

const MON = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** "9 Oct 2026" -> "20261009" ("" when unparseable). */
export function whenCompact(when) {
  const m = String(when || "").match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})\b/);
  if (!m || !MON[m[2].toLowerCase()]) return "";
  return `${m[3]}${MON[m[2].toLowerCase()]}${m[1].padStart(2, "0")}`;
}

/** Source prefix from the row's first link. */
export function sourcePrefix(row) {
  const host = String(row?.sourceUrl || "").match(/https?:\/\/(?:www\.)?([^/\s]+)/i)?.[1]?.toLowerCase() || "";
  if (/(^|\.)ice\.gov$/.test(host)) return "ice";
  if (/(^|\.)justice\.gov$/.test(host)) return "doj";
  if (/(^|\.)dhs\.gov$/.test(host)) return "dhs";
  if (/(^|\.)(x|twitter)\.com$/.test(host)) return "x";
  return host ? host.split(".").slice(-2, -1)[0] || "row" : "row";
}

/** Fresh id for a row in the existing style (a bare post-id row keeps its post id: x-<post id>-<slug>). */
export function rowIdBase(row) {
  const name = slug(row?.name) || "unnamed";
  const old = String(row?.id || "").trim();
  if (/^\d{10,}$/.test(old)) return `x-${old}-${name}`;
  const prefix = sourcePrefix(row);
  if (prefix === "x") {
    const post = String(row?.sourceUrl || "").match(/\/status\/(\d+)/)?.[1];
    if (post) return `x-${post}-${name}`;
  }
  return `${prefix}-${whenCompact(row?.when) || "undated"}-${name}`;
}

/** base, or base-2, base-3 ... not in taken; adds the result to taken. */
export function uniqueId(base, taken) {
  const b = String(base || "").trim() || "row";
  let id = b;
  for (let n = 2; taken.has(id); n++) id = `${b}-${n}`;
  taken.add(id);
  return id;
}

/** Problems: empty ids and ids used by more than one row (across all lists given). */
export function idProblems(lists) {
  const seen = new Map();
  const problems = [];
  for (const [file, rows] of Object.entries(lists)) {
    for (const [i, r] of (Array.isArray(rows) ? rows : []).entries()) {
      const id = typeof r?.id === "string" ? r.id.trim() : "";
      if (!id) { problems.push(`${file} row ${i} (${r?.name ?? "?"}): empty id`); continue; }
      if (seen.has(id)) problems.push(`${file} row ${i} (${r?.name ?? "?"}): duplicate id "${id}" (also ${seen.get(id)})`);
      else seen.set(id, `${file} row ${i} (${r?.name ?? "?"})`);
    }
  }
  return problems;
}

/**
 * Give every row whose id is empty or shared a unique id (all rows of a shared-id group are renamed,
 * since the shared id says nothing about which person it meant). Only `id` changes. Returns the renames.
 */
export function fixIds(lists) {
  const all = Object.entries(lists).flatMap(([file, rows]) => rows.map((r, i) => ({ file, i, r })));
  const count = new Map();
  for (const { r } of all) { const id = String(r?.id || "").trim(); if (id) count.set(id, (count.get(id) || 0) + 1); }
  const bad = all.filter(({ r }) => { const id = String(r?.id || "").trim(); return !id || count.get(id) > 1; });
  const taken = new Set(all.filter((x) => !bad.includes(x)).map(({ r }) => String(r.id).trim()));
  const renames = [];
  for (const x of bad) {
    const from = String(x.r.id ?? "");
    x.r.id = uniqueId(rowIdBase(x.r), taken);
    renames.push({ file: x.file, name: x.r.name, from, to: x.r.id });
  }
  return renames;
}
