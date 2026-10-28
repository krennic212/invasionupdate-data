/**
 * Operations are not people. Two kinds, both from the source text only:
 * 1. A stated arrest total of at least 10 aliens / individuals, with more than
 *    one person left unnamed. heads = total - named, so a named row is not
 *    counted twice. posted is that stated total, never a sum across releases.
 * 2. A named "Operation X" (Operation Southbound Takedown, Operation Los Tíos).
 *    No count is invented when the text does not state one.
 *
 * Not an operation: an office ("Joint Intake Operation Center", "Global
 * Investigative Operation Center"). A period ends the name, so
 * "Operation Center. ICE makes…" is not "Operation Center ICE."
 * A glued sentence word is not part of the name ("Operation Take Back America. This"
 * stays "Operation Take Back America").
 * One card per operation name. The X scan calls extractOperation.
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

const OP_WORD = "[A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'’-]*";
const NAMED_OP = new RegExp(`\\bOperation\\s+(${OP_WORD}(?:\\s+${OP_WORD}){0,4})`);
const OP_TRAIL = /^(?:This|These|That|The|A|An|It|In|On|At|For|And|Or)$/;
const OP_OFFICE = /^(?:Center|Office|Offices|Division|Field|Room|Plan|Orders|Order)$/i;
const OP_AGENCY = /^(?:ICE|DHS|DOJ|ERO|HSI|CBP|USCIS|FBI|DEA)$/i;

function cleanOpName(raw) {
  const words = String(raw || "")
    .replace(/[.,;:]+$/g, "")
    .split(/\s+/)
    .map((w) => w.replace(/[.,;:]+$/g, ""))
    .filter(Boolean);
  while (words.length && OP_TRAIL.test(words[words.length - 1])) words.pop();
  if (!words.length) return "";
  if (words.length === 1 && OP_OFFICE.test(words[0])) return "";
  if (words.every((w) => OP_OFFICE.test(w) || OP_AGENCY.test(w))) return "";
  return words.join(" ");
}

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
  const opName = named ? cleanOpName(named[1]) : "";
  if (best) {
    best.name = opName ? `Operation ${opName}` : "";
    return best;
  }
  if (opName) {
    const at = named.index;
    const start = Math.max(0, src.lastIndexOf(".", at - 1) + 1);
    const end = src.indexOf(".", at + named[0].length);
    const sentence = src.slice(start, end === -1 ? src.length : end + 1).trim();
    return { total: 0, sentence, name: `Operation ${opName}`, namedOnly: true };
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
    operation: true,
    posted: namedOnly ? null : found.total,
    ...(namedOnly ? {} : { heads: unnamed }),
    status: "approved",
  };
}

/** New operation rows for a set of releases. Existing heads rows for the same URL are skipped. */
export function operationsFor(releases, existingRows = []) {
  const out = [];
  const seen = new Set(existingRows.filter((r) => Number(r?.heads) > 1 || r?.operation === true).flatMap(rowUrls));
  const seenNames = new Set(
    existingRows.filter((r) => r?.operation === true || Number(r?.heads) > 1).map((r) => String(r.name || "").toLowerCase()),
  );
  for (const rel of releases) {
    const key = urlKey(rel?.url);
    if (!key || seen.has(key)) continue;
    const named = existingRows.filter((r) => !(Number(r?.heads) > 1) && !r?.operation && rowUrls(r).includes(key)).length
      + (rel.namedThisRun || 0);
    const row = operationRow(rel, named, [...existingRows, ...out]);
    if (!row) continue;
    const nk = String(row.name || "").toLowerCase();
    if (seenNames.has(nk)) continue;
    out.push(row);
    seen.add(key);
    seenNames.add(nk);
  }
  return out;
}
