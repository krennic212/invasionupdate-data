#!/usr/bin/env node
/**
 * X linked-release step (Krennic 2026-10-28: "capture with X post only if official").
 *
 *   node scripts/x-linked.mjs <run>/write.json [more scan outputs ...] [--write]
 *
 * Input: x-scan.mjs output (dry run or --write), which lists `linkedReleases`: official federal release URLs linked
 * from OFFICIAL_X_HANDLES agency posts whose own text names nobody (never trusted-reporter / reporter / news posts;
 * see x-scan.mjs linkedReleasesFor and rules.mjs officialReleaseLink). This script never calls X.
 *
 * Each release is read from the official site itself: justice.gov through the DOJ press-release API (the HTML is behind
 * Akamai), matched on the exact release URL (recent listing first, then a title search); other agency pages as HTML,
 * exactly like the hourly harvester. Rows come from harvest.mjs rowsFromRelease, i.e. the same parser and ALL the same
 * guards as the press-release harvester: the release must state non-citizen status, minors / people at large /
 * overstated stages are held, quoted officials are never names, and names (+ aka, + roundup short forms) already in
 * harvest.json or review.json are skipped. sourceUrl = the official release; via = the X post ("@Handle <postId>").
 * photo stays "": the daily photo job applies the single-person official-release rule; X post graphics never supply a
 * photo (x-photo.mjs refuses rows whose source is not an X post).
 *
 * Without --write it only prints what it would add. With --write: new rows are prepended to data/harvest.json
 * (approved, or pending with holdReason when a guard trips, same as the harvester with AUTO_APPROVE=true), then map
 * points, review prune, tags, severity and harvest-meta.json are refreshed like x-scan --write.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve as resolvePath } from "node:path";
import { htmlBlocks, decode } from "./parse.mjs";
import { nameKeysOf, officialReleaseLink, hostOf } from "./rules.mjs";
import { uniqueId as makeUniqueId, rowIdBase } from "./ids.mjs";
import { rowsFromRelease, fetchText, titleOf, dateOf, bodyOnly, recent, DOJ_API, IMMIGRATION } from "./harvest.mjs";

const isDoj = (url) => { const h = hostOf(url); return h === "justice.gov" || h.endsWith(".justice.gov"); };
const urlKey = (u) => String(u || "").trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
const DOJ_LIST_PAGES = Number(process.env.X_LINKED_DOJ_PAGES || 3);

/** DOJ API result -> harvest rel (same shape and date rule as harvest.mjs dojReleases). */
export function dojRel(r) {
  const url = String(r?.url || "").trim();
  const title = decode(String(r?.title || "")).replace(/\s+/g, " ").trim();
  const n = Number(r?.date);
  const ms = n < 1e12 ? n * 1000 : n;
  const date = Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : "";
  return { office: "TheJusticeDept", url, date, title, blocks: htmlBlocks(String(r?.body || "")) };
}

/** Title words to search the DOJ API with: the X card title, else the slug's first words (title search is a substring match). */
export function dojTitleQueries(link) {
  const out = [];
  if (link.title) out.push(link.title);
  const slug = String(link.url).split("/").pop() || "";
  const words = slug.split("-").filter(Boolean);
  if (words.length >= 2) out.push(words.slice(0, 2).join(" "));
  return [...new Set(out)];
}

/** Read one linked release as a harvest rel, or { error }. fetchJson / fetchHtml are injectable for tests. */
export async function readLinkedRelease(link, { fetchJson, fetchHtml } = {}) {
  const want = urlKey(link.url);
  if (isDoj(link.url)) {
    const getJson = fetchJson || (async (u) => JSON.parse(await fetchText(u, "application/json")));
    for (let page = 0; page < DOJ_LIST_PAGES; page++) {
      const hit = ((await getJson(`${DOJ_API}&page=${page}`))?.results || []).find((r) => urlKey(r.url) === want);
      if (hit) return dojRel(hit);
    }
    for (const q of dojTitleQueries(link)) {
      const res = await getJson(`https://www.justice.gov/api/v1/press_releases.json?pagesize=50&sort=created&direction=DESC&parameters%5Btitle%5D=${encodeURIComponent(q)}`);
      const hit = (res?.results || []).find((r) => urlKey(r.url) === want);
      if (hit) return dojRel(hit);
    }
    return { error: "not found in the DOJ press-release API" };
  }
  const html = await (fetchHtml || fetchText)(link.url);
  return { office: officeForHost(link.url), url: link.url, date: dateOf(link.url, html), title: titleOf(html), blocks: htmlBlocks(bodyOnly(html)) };
}

/** harvest.mjs / parse.mjs AGENCY office key for a non-DOJ agency page. */
function officeForHost(url) {
  const h = hostOf(url);
  if (h.endsWith("ice.gov")) return "ICEgov";
  if (h.endsWith("cbp.gov")) return "CBP";
  if (h.endsWith("dhs.gov") || h.endsWith("uscis.gov")) return "DHSgov";
  if (h.endsWith("state.gov")) return "StateDept";
  return "TheJusticeDept"; // fbi.gov, usmarshals.gov, dea.gov, atf.gov are DOJ components
}

/** Scan outputs -> unique official links (re-checked with officialReleaseLink; anything else is dropped). */
export function linksFrom(outputs) {
  const seen = new Set();
  const out = [];
  for (const o of outputs) for (const l of o?.linkedReleases || []) {
    const url = officialReleaseLink(l?.url);
    if (!url || seen.has(urlKey(url))) continue;
    seen.add(urlKey(url));
    out.push({ ...l, url });
  }
  return out;
}

/** Pure: rels (already read) + existing rows -> { rows, held, skipped }. via = the X post. */
export function linkedRows(items, existing, { isRecent = recent } = {}) {
  const have = new Set(existing.flatMap((r) => nameKeysOf(r)));
  const ids = new Set(existing.map((r) => r?.id).filter(Boolean));
  const uniqueId = (id, row = {}) => makeUniqueId(String(id || "").trim() || rowIdBase(row), ids);
  const gate = (row, reasons) => (reasons.length ? { ...row, status: "pending", holdReason: reasons.join("; ") } : { ...row, status: "approved" });
  const rows = [];
  const held = [];
  const skipped = [];
  for (const { link, rel } of items) {
    if (!rel || rel.error) { skipped.push(`${link.url} (${rel?.error || "not read"})`); continue; }
    if (urlKey(rel.url) !== urlKey(link.url)) { skipped.push(`${link.url} (read a different page: ${rel.url})`); continue; }
    if (!rel.date || !isRecent(rel.date)) { skipped.push(`${link.url} (no date or older than the harvest window)`); continue; }
    if (!IMMIGRATION.test(`${rel.title} ${rel.blocks.join(" ")}`)) { skipped.push(`${link.url} (no immigration wording)`); continue; }
    const res = rowsFromRelease({ ...rel, url: link.url }, { have, uniqueId, gate });
    for (const r of res.rows) rows.push({ ...r, via: `@${link.handle} ${link.postId}`, xPost: link.postUrl });
    held.push(...res.held);
    if (!res.rows.length) skipped.push(`${link.url} (no new named person: everyone the release names is already in feed/review, or nobody it names is stated to be a non-citizen)`);
  }
  return { rows, held, skipped };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const files = args.filter((a) => a !== "--write");
  const HARVEST = process.env.HARVEST_FILE || "data/harvest.json";
  const REVIEW = process.env.REVIEW_FILE || "data/review.json";
  const harvest = JSON.parse(readFileSync(HARVEST, "utf8"));
  const review = JSON.parse(readFileSync(REVIEW, "utf8"));
  const links = linksFrom(files.map((f) => JSON.parse(readFileSync(f, "utf8"))));
  const items = [];
  for (const link of links) {
    let rel;
    try { rel = await readLinkedRelease(link); } catch (e) { rel = { error: String(e?.message || e) }; }
    items.push({ link, rel });
  }
  const res = linkedRows(items, [...harvest, ...review]);
  let extra = null;
  if (write && res.rows.length) {
    writeFileSync(HARVEST, `${JSON.stringify([...res.rows, ...harvest], null, 2)}\n`);
    const { fillGeoFile } = await import("./geo.mjs");
    const { pruneReviewOfLive } = await import("./rules.mjs");
    const { applyTagsFiles } = await import("./tags.mjs");
    const { writeSeverityFiles } = await import("./severity.mjs");
    const { writeMetaFile } = await import("./write-meta.mjs");
    const geo = await fillGeoFile(HARVEST);
    const pruned = pruneReviewOfLive(JSON.parse(readFileSync(HARVEST, "utf8")), JSON.parse(readFileSync(REVIEW, "utf8")));
    if (pruned.removed.length) writeFileSync(REVIEW, `${JSON.stringify(pruned.review, null, 2)}\n`);
    applyTagsFiles({ harvest: HARVEST, review: REVIEW });
    writeSeverityFiles(HARVEST, HARVEST.replace(/[^/\\]*$/, "highlights.json"));
    if (HARVEST === "data/harvest.json" && existsSync("data/harvest-meta.json")) writeMetaFile();
    extra = { geoStillMissing: geo.stillMissing, reviewRemovedBecauseLive: pruned.removed };
  }
  console.log(JSON.stringify({ write, linksFollowed: links.map((l) => ({ url: l.url, post: l.postUrl })), added: res.rows.map((r) => ({ id: r.id, name: r.name, status: r.status, crime: r.crime, sourceUrl: r.sourceUrl, via: r.via })), held: res.held, skipped: res.skipped, ...(extra || {}) }, null, 2));
}
