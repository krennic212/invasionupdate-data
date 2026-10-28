/**
 * Standing rule: before a new row or operation is written, open the source URL.
 * Hold it when the URL 404s, times out, or (for a page we could read) does not
 * name the person or operation. A 401/403/429 or an Akamai challenge is blocked,
 * not broken — do not hold those, and do not invent a replacement URL.
 * x.com / twitter.com answers anonymous clients with a login wall; a 404 is
 * broken, anything else is not.
 *
 *   node scripts/link-check.mjs     -> data/link-report.json (does not edit rows)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BLOCK = /access denied|attention required|just a moment|request blocked|pardon our interruption|enable javascript|akamai/i;
const SKIP_NAME = new Set(["operation", "operations", "arrest", "arrests", "arrested", "ice", "ero", "dhs", "doj", "member", "members", "gang", "the", "and", "from"]);

function firstUrl(raw) {
  return String(raw || "").split(/\s+/).find((s) => /^https:\/\//i.test(s)) || "";
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function isX(host) {
  return /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(host);
}

function nameTokens(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 2 && !SKIP_NAME.has(p));
}

function fold(s) {
  return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function namesIt(text, name) {
  const parts = nameTokens(name);
  if (!parts.length) return true;
  const hay = fold(text);
  const last = parts[parts.length - 1];
  const first = parts[0];
  return hay.includes(last) && (parts.length < 2 || hay.includes(first));
}

/** "" when the URL may be kept. Otherwise a hold reason. Never throws. */
export async function deadSourceReason(url, name, { timeout = 12000 } = {}) {
  const u = firstUrl(url);
  if (!u) return "source URL missing";
  const host = hostOf(u);
  if (!host) return "source URL is not a link";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(u, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "InvasionUpdateLinkCheck/1.0", accept: "text/html,application/xhtml+xml" },
    });
    if (res.status === 404 || res.status === 410) return `source ${res.status}`;
    if (res.status === 401 || res.status === 403 || res.status === 429) return "";
    if (!res.ok) return "";
    if (isX(host)) return "";
    const type = res.headers.get("content-type") || "";
    if (type && !/html|text|json|xml/i.test(type)) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.subarray(0, 400000).toString("utf8");
    if (BLOCK.test(text.slice(0, 4000))) return "";
    const finalHost = hostOf(res.url || u);
    if (/login|signin|accounts\./i.test(finalHost) && !namesIt(text, name)) return "source redirects to a login wall";
    if (text.length > 1800 && /<p[\s>]/i.test(text) && !namesIt(text, name)) return "source page does not name the person or operation";
    return "";
  } catch (e) {
    if (e?.name === "AbortError" || e?.name === "TimeoutError") return "source timed out";
    return "source did not load";
  } finally {
    clearTimeout(timer);
  }
}

function urlsOf(row) {
  const out = [];
  for (const raw of [row?.sourceUrl, row?.photo]) {
    for (const part of String(raw || "").split(/\s+/)) {
      if (/^https:\/\//i.test(part)) out.push(part);
    }
  }
  return out;
}

async function main() {
  const harvest = JSON.parse(readFileSync("data/harvest.json", "utf8"));
  const ops = existsSync("data/operations.json") ? JSON.parse(readFileSync("data/operations.json", "utf8")) : [];
  const jobs = new Map();
  const add = (url, name, where) => {
    const u = firstUrl(url);
    if (!u || jobs.has(u)) return;
    jobs.set(u, { url: u, name, where });
  };
  for (const r of harvest) for (const u of urlsOf(r)) add(u, r.name, r.id || r.name);
  for (const o of ops) add(o.sourceUrl, o.name, o.id || o.name);
  for (const [url, name, where] of [
    ["https://www.dhs.gov/wow", "DHS catalog", "About"],
    ["https://www.ice.gov/newsroom", "ICE newsroom", "About"],
    ["https://www.justice.gov/", "Justice", "About"],
    ["https://www.uscis.gov/", "USCIS", "About"],
    ["https://github.com/krennic212/invasionupdate-data/issues", "Report an error", "footer"],
    ["https://krennic212.github.io/invasionupdate-data/harvest.json", "live feed", "feed"],
    ["https://krennic212.github.io/invasionupdate-data/operations.json", "operations feed", "feed"],
  ]) add(url, name, where);

  const broken = [];
  const blocked = [];
  let ok = 0;
  const list = [...jobs.values()];
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const job = list[i++];
      const why = await deadSourceReason(job.url, job.name);
      if (!why) ok += 1;
      else broken.push({ ...job, status: why });
      if ((ok + broken.length) % 50 === 0) console.error(`checked ${ok + broken.length}/${list.length}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  const report = {
    checkedAt: new Date().toISOString(),
    checked: list.length,
    ok,
    broken: broken.length,
    blockedNote: "401, 403, 429, and Akamai challenge pages are not listed. They are blocked, not broken.",
    broken,
    blocked,
  };
  writeFileSync("data/link-report.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ checked: list.length, ok, broken: broken.length, sample: broken.slice(0, 30) }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("link-check.mjs")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
