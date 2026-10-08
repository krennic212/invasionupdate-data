#!/usr/bin/env node
/**
 * Hourly official-source harvest for the Invasion Update feed.
 *
 * Reads ONLY official federal pages (dhs.gov, ice.gov, cbp.gov, justice.gov),
 * finds people the release itself names AND describes as an alien / national /
 * citizen of another country, and appends one row per person to data/harvest.json.
 *
 *  - The charge label is the release's own sentence, word for word.
 *  - Immigration status is never invented; origin is only what the sentence says.
 *  - Every row carries its source link and the release date.
 *  - photo is always "".
 *  - A name already in the feed or the review list is not added again (the site's
 *    existing uniqueByName rule). Co-defendants are separate rows.
 *  - Approval gate: new rows get status "pending" (or "approved" when AUTO_APPROVE=true).
 *    Only "approved" rows are shown by the site. Existing rows keep their status.
 *  - data/pending.json (optional, hand- or agent-dropped rows) is routed:
 *    official source -> harvest.json, anything else (X, reporters, news) -> review.json.
 *
 * Writes data/harvest.json, data/review.json, data/harvest-status.json.
 * The workflow commits only when harvest.json or review.json actually changed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extractPeople, htmlBlocks, decode, toRow } from "./parse.mjs";
import { nameKey, routeRows, isOfficialUrl } from "./rules.mjs";
import { holdReasons, holdReasonsForRow } from "./guards.mjs";

const HARVEST = process.env.HARVEST_FILE || "data/harvest.json";
const REVIEW = process.env.REVIEW_FILE || "data/review.json";
const PENDING = process.env.PENDING_FILE || "data/pending.json";
const STATUS = process.env.STATUS_FILE || "data/harvest-status.json";
const UA = "InvasionUpdateHarvest/2.0 (+https://github.com/krennic212/invasionupdate-data)";
const MAX_LINKS = Number(process.env.MAX_LINKS || 15);
/** Approval gate. "false" (default): new rows go in as status "pending" and the site hides them
 *  until scripts/approve.mjs marks them "approved". "true": new official rows go live at once,
 *  EXCEPT rows that trip a hard guard (scripts/guards.mjs), which always stay "pending". */
const AUTO_APPROVE = String(process.env.AUTO_APPROVE || "false").toLowerCase() === "true";
const NEW_STATUS = AUTO_APPROVE ? "approved" : "pending";
function gate(row, reasons) {
  if (reasons.length) return { ...row, status: "pending", holdReason: reasons.join("; ") };
  return { ...row, status: NEW_STATUS };
}
const MAX_AGE_DAYS = Number(process.env.MAX_AGE_DAYS || 30);

const DOJ_API = "https://www.justice.gov/api/v1/press_releases.json?pagesize=40&sort=created&direction=DESC";
const DOJ_PAGES = Number(process.env.DOJ_PAGES || 4);
const IMMIGRATION = /illegal(ly)?\s+(alien|present|reent|re-ent|immigrant)|\balien\b|\baliens\b|reentry|re-entry|unlawfully present|citizen of|national of|\bnationals?\b|deport|removal|removed from the united states|noncitizen|non-citizen/i;

const LISTS = [
  { office: "DHSgov", url: "https://www.dhs.gov/news-releases/press-releases", link: /^\/news\/20\d{2}\/\d{2}\/\d{2}\/[^"'#?]+$/ },
  { office: "ICEgov", url: "https://www.ice.gov/newsroom", link: /^\/news\/releases\/[^"'#?]+$/ },
  { office: "CBP", url: "https://www.cbp.gov/newsroom/media-releases/all", link: /^\/newsroom\/(national|local)-media-release\/[^"'#?]+$/ },
];

const readJson = (f, dflt) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : dflt);
const writeJson = (f, v) => writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);

async function fetchText(url, accept = "text/html,*/*") {
  const res = await fetch(url, { headers: { "user-agent": UA, accept }, redirect: "follow", signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function titleOf(html) {
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return decode((og?.[1] || h1?.[1] || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Release date (YYYY-MM-DD) from the URL path or the page's own published-time metadata. */
function dateOf(url, html) {
  const p = url.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//);
  if (p) return `${p[1]}-${p[2]}-${p[3]}`;
  const meta = html.match(/article:published_time"\s+content="(\d{4}-\d{2}-\d{2})/i) || html.match(/<time[^>]+datetime="(\d{4}-\d{2}-\d{2})/i);
  return meta ? meta[1] : "";
}

function recent(iso) {
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(t) && Date.now() - t < MAX_AGE_DAYS * 86400000;
}

function bodyOnly(html) {
  // Prefer the main content region when the page marks one.
  const main = html.match(/<main\b[\s\S]*?<\/main>/i);
  return main ? main[0] : html;
}

async function releasesFromList(src, errors) {
  let html;
  try {
    html = await fetchText(src.url);
  } catch (e) {
    errors.push(String(e.message || e));
    return [];
  }
  const links = [...new Set([...html.matchAll(/href="([^"]+)"/gi)].map((m) => m[1].replace(/^https:\/\/www\.[a-z]+\.gov/i, "")).filter((h) => src.link.test(h)))];
  const base = new URL(src.url).origin;
  return links.slice(0, MAX_LINKS).map((h) => ({ office: src.office, url: `${base}${h}` }));
}

async function readRelease(rel, errors) {
  try {
    const html = await fetchText(rel.url);
    const date = dateOf(rel.url, html);
    if (!date || !recent(date)) return null;
    return { ...rel, date, title: titleOf(html), blocks: htmlBlocks(bodyOnly(html)) };
  } catch (e) {
    errors.push(String(e.message || e));
    return null;
  }
}

async function dojReleases(errors) {
  const out = [];
  let seen = 0;
  for (let page = 0; page < DOJ_PAGES; page++) {
    let payload;
    try {
      payload = JSON.parse(await fetchText(`${DOJ_API}&page=${page}`, "application/json"));
    } catch (e) {
      errors.push(`DOJ API: ${String(e.message || e)}`);
      break;
    }
    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (!results.length) break;
    for (const r of results) {
      seen += 1;
      const url = String(r.url || "").trim();
      if (!isOfficialUrl(url)) continue;
      const title = decode(String(r.title || "")).replace(/\s+/g, " ").trim();
      const body = String(r.body || "");
      if (!IMMIGRATION.test(`${title} ${body}`)) continue;
      const n = Number(r.date);
      const ms = n < 1e12 ? n * 1000 : n;
      const date = Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : "";
      if (!date || !recent(date)) continue;
      out.push({ office: "TheJusticeDept", url, date, title, blocks: htmlBlocks(body) });
    }
  }
  console.error(`DOJ API: ${seen} releases read, ${out.length} with immigration wording in the window`);
  return out;
}

async function main() {
  const harvest = readJson(HARVEST, []);
  const review = readJson(REVIEW, []);
  if (!Array.isArray(harvest) || !Array.isArray(review)) throw new Error("data files must be JSON arrays");
  const have = new Set([...harvest, ...review].map((r) => nameKey(r?.name)).filter(Boolean));
  const ids = new Set(harvest.map((r) => r?.id).filter(Boolean));
  const uniqueId = (id) => {
    let out = id;
    for (let n = 2; ids.has(out); n++) out = `${id}-${n}`;
    ids.add(out);
    return out;
  };
  const added = [];
  const toReview = [];
  const held = [];
  const errors = [];
  let scanned = 0;

  // 1) Pending intake (optional): route, never auto-publish non-official rows.
  const pending = readJson(PENDING, []);
  if (Array.isArray(pending) && pending.length) {
    const { live, review: rv } = routeRows(pending);
    for (const r0 of live) {
      if (have.has(nameKey(r0.name))) continue;
      const r = gate({ ...r0, id: uniqueId(r0.id || `pending-${nameKey(r0.name).replace(/ /g, "-")}`) }, holdReasonsForRow(r0));
      harvest.unshift(r);
      have.add(nameKey(r.name));
      added.push(r.name);
    }
    for (const r of rv) {
      if (have.has(nameKey(r.name))) continue;
      review.unshift(r);
      have.add(nameKey(r.name));
      toReview.push(r.name);
    }
    writeJson(PENDING, []);
  }

  // 2) Official press releases.
  const rels = [];
  for (const src of LISTS) {
    for (const rel of await releasesFromList(src, errors)) {
      const full = await readRelease(rel, errors);
      if (full) rels.push(full);
    }
  }
  rels.push(...(await dojReleases(errors)));

  const fresh = [];
  for (const rel of rels) {
    scanned += 1;
    for (const hit of extractPeople(rel.blocks)) {
      const k = nameKey(hit.name);
      if (!k || have.has(k)) continue;
      have.add(k);
      const row = toRow(hit, rel);
      const label = row.crime.slice(0, row.crime.indexOf(":"));
      const reasons = holdReasons({ name: hit.name, sentence: hit.sentence, title: rel.title, releaseText: rel.blocks.join(" "), label });
      const gated = gate({ ...row, id: uniqueId(row.id) }, reasons);
      if (gated.status === "pending") held.push(`${hit.name} (${gated.holdReason || "approval gate"})`);
      fresh.push(gated);
      added.push(hit.name);
    }
  }
  // Newest first, ahead of existing rows.
  harvest.unshift(...fresh);

  writeJson(HARVEST, harvest);
  writeJson(REVIEW, review);
  writeJson(STATUS, {
    checkedAt: Date.now(),
    checkedAtIso: new Date().toISOString(),
    added,
    addedStatus: NEW_STATUS,
    heldPending: held,
    autoApprove: AUTO_APPROVE,
    sentToReview: toReview,
    scannedReleases: scanned,
    error: errors.length ? errors.slice(0, 6).join(" | ") : null,
    note: added.length ? `Added ${added.length} as ${NEW_STATUS}: ${added.join(", ")}` : "No new named people in official releases this run.",
    sources: ["dhs.gov/news-releases/press-releases", "ice.gov/newsroom", "cbp.gov/newsroom", "justice.gov press-release API"],
    writer: "scripts/harvest.mjs (GitHub Actions, krennic212/invasionupdate-data)",
  });
  console.log(JSON.stringify({ added: added.length, names: added, heldPending: held, sentToReview: toReview, scannedReleases: scanned, errors }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
