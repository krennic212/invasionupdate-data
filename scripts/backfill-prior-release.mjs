#!/usr/bin/env node
/**
 * One-off / re-runnable backfill (Krennic 2026-11-26 via Bill): prior counts read from the WHOLE official release
 * (justice.gov, ice.gov, dhs.gov) for live rows whose counts were first read from the shorter stored excerpt.
 *
 *   node scripts/backfill-prior-release.mjs <cacheDir> [--write]
 *
 * Pages are fetched beforehand into <cacheDir>/<sha1(url)>.html (no fetching here, no X calls).
 * Rules: rows with an approvalNote are skipped; a field is filled ONLY when it is null now and the release states a count
 * for this person (priorFromRelease, strict mode); a filled field is never overwritten. Nothing else on a row changes.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { htmlBlocks } from "./parse.mjs";
import { priorFromRelease, siblingNames } from "./prior-arrests.mjs";

export const OFFICIAL = /^https:\/\/www\.(?:justice|ice|dhs)\.gov\//;

const bodyOnly = (html) => (String(html).match(/<main\b[\s\S]*?<\/main>/i) || [html])[0];

/** Merge release counts into a row: only null fields are filled. Returns the list of filled field names. */
export function fillNulls(row, p) {
  const filled = [];
  if (row.priorArrests == null && p.priorArrests != null) {
    row.priorArrests = p.priorArrests;
    row.priorArrestsPlus = !!p.priorArrestsPlus;
    row.priorArrestsQuote = p.priorArrestsQuote;
    filled.push("priorArrests");
  }
  for (const k of ["priorReleases", "priorConvictions", "priorRemovals"]) {
    if (row[k] == null && p[k] != null) { row[k] = p[k]; filled.push(k); }
  }
  return filled;
}

export function backfill(rows, pool, pageText) {
  const sibs = siblingNames(rows, pool);
  const report = { checked: 0, noPage: 0, filled: [] };
  for (const r of rows) {
    if (!r || r.approvalNote) continue;
    const urls = [r.sourceUrl, r.via].filter(Boolean).map((u) => String(u).split(/[\s,]+/)[0]).filter((u) => OFFICIAL.test(u));
    if (!urls.length) continue;
    if (["priorArrests", "priorReleases", "priorConvictions", "priorRemovals"].every((k) => r[k] != null)) continue;
    report.checked++;
    let any = false;
    for (const u of urls) {
      const text = pageText(u);
      if (text == null) continue;
      any = true;
      const f = fillNulls(r, priorFromRelease(text, r.name, sibs(r)));
      if (f.length) report.filled.push({ id: r.id, name: r.name, url: u, fields: f });
    }
    if (!any) report.noPage++;
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  const write = process.argv.includes("--write");
  const H = "data/harvest.json";
  const h = JSON.parse(readFileSync(H, "utf8"));
  let v = [];
  try { v = JSON.parse(readFileSync("data/review.json", "utf8")); } catch {}
  const pageText = (u) => {
    const f = `${dir}/${createHash("sha1").update(u).digest("hex")}.html`;
    return existsSync(f) ? htmlBlocks(bodyOnly(readFileSync(f, "utf8"))) : null;
  };
  const rep = backfill(h, [...h, ...v], pageText);
  if (write && rep.filled.length) writeFileSync(H, `${JSON.stringify(h, null, 2)}\n`);
  console.log(JSON.stringify(rep, null, 1));
}
