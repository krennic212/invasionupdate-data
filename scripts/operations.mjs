/**
 * Unnamed group arrest counts from official releases ("ICE Boston arrested 82
 * illegal aliens during a 3-day operation"). These become heads rows so the
 * site counts the unnamed remainder without inventing names.
 *
 * A release is an operation only when it states a total of at least 10 arrests
 * of aliens / individuals and more than one person is left unnamed after the
 * people the release itself names are subtracted. Named rows keep their own
 * count. A heads row already on the feed for the same release is not added again.
 *
 * The row carries heads = total - named, so the ticker does not count anyone twice.
 */
import { urlsIn } from "./rules.mjs";
import { latLonFor, slug } from "./parse.mjs";

const MIN_TOTAL = 10;
const MIN_UNNAMED = 2;

const COUNT_PATTERNS = [
  // "arrested 82 illegal aliens" / "arrested 13 noncitizens" / "arrested 131 gang-affiliated individuals"
  /(?:arrested|arrests)\s+(\d{2,4})\s+(?:(?:criminal\s+)?illegal\s+aliens?|gang[- ]affiliated\s+individuals?|non-?citizens?|individuals?|aliens?)/i,
  // "82 illegal aliens were arrested" / "13 individuals have been arrested"
  /(\d{2,4})\s+(?:(?:criminal\s+)?illegal\s+aliens?|gang[- ]affiliated\s+individuals?|non-?citizens?|individuals?|aliens?)\s+(?:have\s+been\s+|were\s+|was\s+)?arrested/i,
];

const NAMED_OP = /\bOperation\s+([A-Z][A-Za-z0-9'’-]{2,}(?:\s+[A-Z][A-Za-z0-9'’-]{2,}){0,4})/;

const PLACE = /\b(?:in|around|across)\s+([A-Z][A-Za-z .'-]{2,40}?)(?=,|\.| during| the week| on\b)/;

function urlKey(url) {
  return String(url || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/[),.;]+$/, "").toLowerCase();
}

function rowUrls(row) {
  return urlsIn(row?.sourceUrl).map(urlKey);
}

/** Largest stated arrest total in the release text, with the sentence that states it. */
export function extractOperation(text) {
  const src = String(text || "").replace(/\s+/g, " ");
  let best = null;
  for (const re of COUNT_PATTERNS) {
    re.lastIndex = 0;
    let m;
    const flags = re.flags.includes("g") ? re : new RegExp(re.source, `${re.flags}g`);
    while ((m = flags.exec(src))) {
      const total = Number(m[1]);
      if (!Number.isFinite(total) || total < MIN_TOTAL) continue;
      const at = m.index;
      const start = Math.max(0, src.lastIndexOf(".", at - 1) + 1);
      const end = src.indexOf(".", at + m[0].length);
      const sentence = src.slice(start, end === -1 ? src.length : end + 1).trim();
      if (!best || total > best.total) best = { total, sentence, namedOnly: false };
    }
  }
  const named = src.match(NAMED_OP);
  if (best) {
    best.name = named ? `Operation ${named[1]}` : "";
    return best;
  }
  if (named) {
    const at = named.index;
    const start = Math.max(0, src.lastIndexOf(".", at - 1) + 1);
    const end = src.indexOf(".", at + named[0].length);
    const sentence = src.slice(start, end === -1 ? src.length : end + 1).trim();
    return { total: 0, sentence, name: `Operation ${named[1]}`, namedOnly: true };
  }
  return best;
}

function whenOf(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

function placeOf(sentence, title) {
  const m = `${sentence} ${title}`.match(PLACE);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

/**
 * One heads row for a release, or null when it is not an operation, the unnamed
 * remainder is too small, or a heads row for this release is already on the feed.
 *
 * @param {object} rel { url, title, date, office, blocks }
 * @param {number} namedCount people this release named (already rows, or extracted this run)
 * @param {object[]} existingRows current harvest rows
 */
export function operationRow(rel, namedCount, existingRows = []) {
  const found = extractOperation([rel?.title, ...(rel?.blocks || [])].join(" "));
  if (!found) return null;
  const namedOnly = Boolean(found.namedOnly);
  const unnamed = namedOnly ? 0 : found.total - Math.max(0, namedCount);
  if (!namedOnly && unnamed < MIN_UNNAMED) return null;
  const key = urlKey(rel.url);
  if (!key) return null;
  if (existingRows.some((r) => (Number(r?.heads) > 1 || r?.operation === true) && rowUrls(r).includes(key))) return null;
  const place = placeOf(found.sentence, rel.title) || "Not stated";
  const geo = latLonFor(place.includes(",") ? place : "");
  const office = rel.office || "ICEgov";
  const when = whenOf(rel.date);
  const named = Math.max(0, namedCount);
  const title = found.name || `${office} ${place} operation`.replace(/\s+/g, " ").trim();
  const countLine = namedOnly
    ? "Named operation. Posted count not stated in this text. Do not invent one."
    : `${found.total} total, ${named} named on their own rows, ${unnamed} unnamed counted here.`;
  return {
    name: title,
    city: place.includes(",") ? place : "Not stated",
    crime: `Posted count: ${found.sentence} ${namedOnly ? countLine : `Unnamed cluster. ${named} named on their own rows; this row counts the other ${unnamed}. Do not invent names.`}`,
    usa: `${office} release ${when || rel.date}: ${rel.title}`,
    foreign: "Not stated in post",
    picked: `${when || rel.date} (${office} release)`,
    entered: "Not stated",
    office,
    id: `op-${office.toLowerCase()}-${(rel.date || "nodate").replace(/-/g, "")}-${found.total || slug(found.name || "named")}`,
    when,
    text: `${office} ${when || rel.date}, as posted: ${found.sentence} ${countLine}`,
    photo: "",
    via: String(rel.url || "").replace(/^https:\/\/(www\.)?/, ""),
    sourceUrl: rel.url,
    voting: false,
    origin: "Various",
    confirmedBy: office === "DHSgov" ? "DHS" : "ICE",
    lat: geo.lat,
    lon: geo.lon,
    ...(namedOnly ? { operation: true } : { heads: unnamed, operation: true }),
    status: "approved",
  };
}

/** New operation rows for a set of releases. Existing heads rows for the same URL are skipped. */
export function operationsFor(releases, existingRows = []) {
  const out = [];
  const seen = new Set(existingRows.filter((r) => Number(r?.heads) > 1).flatMap(rowUrls));
  for (const rel of releases) {
    const key = urlKey(rel?.url);
    if (!key || seen.has(key)) continue;
    const named = existingRows.filter((r) => !(Number(r?.heads) > 1) && rowUrls(r).includes(key)).length
      + (rel.namedThisRun || 0);
    const row = operationRow(rel, named, [...existingRows, ...out]);
    if (row) {
      out.push(row);
      seen.add(key);
    }
  }
  return out;
}
