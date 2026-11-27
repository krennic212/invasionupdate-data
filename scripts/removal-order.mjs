#!/usr/bin/env node
/**
 * Removal / deportation ORDER date (Krennic 2026-11-26 t81u: "check again for prior arrests or Ordered Deported dates").
 *
 *   orderedRemovedDate    string or null. When an immigration judge (or DHS) ordered THIS person removed, at the precision the
 *                         official text states it: "YYYY-MM-DD" (a full date), "YYYY-MM" (month and year), "YYYY" (year only).
 *   orderedRemovedQuote   the exact phrase the date came from (so a human can check it), or null.
 *   orderedRemovedSource  the URL of the official page or post the phrase is on, or null.
 *
 * Optional fields: a row without them is fine (validate.mjs only checks them when present). Never guesses: a sentence
 * that says "a final order of removal" with no date, or a date that belongs to an arrest / removal / entry instead of the
 * order, gives null. "removed in 2019" is a REMOVAL (priorRemovals), not an order, and is not read here.
 * Data only: nothing else on a row changes. The frontend ignores these fields until a later Grok Build prompt.
 */
import { pick, sentences } from "./prior-arrests.mjs";

export const ORDER_KEYS = ["orderedRemovedDate", "orderedRemovedQuote", "orderedRemovedSource"];

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
const DATE = `(?:${MON}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}|${MON}\\s+(?:of\\s+)?(?:19|20)\\d{2}|(?:19|20)\\d{2})`;
// The order itself: "final order of removal", "removal order", "order of deportation", "ordered removed/deported".
const ORDER = "(?:(?:final\\s+)?(?:order|orders)\\s+of\\s+(?:removal|deportation|exclusion)|(?:final\\s+)?(?:removal|deportation|expedited removal)\\s+order|ordered\\s+(?:him\\s+|her\\s+)?(?:removed|deported|excluded)(?:\\s+(?:from|to)\\s+[^,.;]{1,40}?)?)";
const GAP = "[^.;]{0,60}?";
const RES = [
  // "... ordered removed by an immigration judge on May 3, 2019" / "issued a final order of removal on February 3, 2020"
  new RegExp(`${ORDER}${GAP}\\b(?:on|in|dated)\\s+(${DATE})`, "i"),
  // "In 2019, an immigration judge ordered him removed" / "On March 4, 2020, a judge issued a final order of removal"
  new RegExp(`\\b(?:On|In)\\s+(${DATE}),?\\s+(?:a|an|the)\\s+(?:DOJ\\s+)?(?:federal\\s+)?(?:immigration\\s+)?judge\\s+(?:with\\s+the\\s+[^,]{1,60},\\s+)?(?:(?:issued|entered|granted)[^.;]{0,40}?)?${ORDER}`, "i"),
  new RegExp(`\\b(?:On|In)\\s+(${DATE}),?\\s+(?:he|she)\\s+(?:was|received|got)\\s+(?:issued\\s+)?(?:a\\s+)?${ORDER}`, "i"),
  // "a 2018 final removal order" / "his March 2019 order of removal"
  new RegExp(`\\b(?:a|an|his|her)\\s+(${DATE})\\s+(?:final\\s+)?(?:removal|deportation)\\s+order`, "i"),
  new RegExp(`\\b(?:a|an|his|her)\\s+(${DATE})\\s+(?:final\\s+)?order\\s+of\\s+(?:removal|deportation)`, "i"),
];
// A date that clearly belongs to something else in the gap ("removed on", "arrested on", "entered in") is not the order date.
const OTHER_EVENT = /\b(?:removed|deported|arrested|entered|re-?entered|convicted|sentenced|released|apprehended|encountered|crossed)\s+(?:him\s+|her\s+)?(?:\w+\s+){0,3}(?:on|in)\s*$/i;

/** "February 3, 2020" -> "2020-02-03"; "March 2019" -> "2019-03"; "2018" -> "2018". null when it is not a real date. */
export function isoOf(d) {
  const s = String(d).replace(/\./g, "").replace(/\bof\s+/i, "").trim();
  let m = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3)));
    const day = Number(m[2]);
    if (mo < 0 || day < 1 || day > 31) return null;
    return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3)));
    return mo < 0 ? null : `${m[2]}-${String(mo + 1).padStart(2, "0")}`;
  }
  return /^(?:19|20)\d{2}$/.test(s) ? s : null;
}

const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** The exact words around the match: the whole sentence when short, else up to ~80 characters either side (word-aligned). */
function quoteAround(sen, at, len) {
  // Links and a release's trailing "# # # Topics ..." footer are not part of what was said.
  const raw = String(sen);
  const cut = (x) => tidy(x.replace(/https?:\/\/\S+/g, " ").replace(/\s#\s#\s#[\s\S]*$/, " "));
  const s = cut(raw);
  const head = cut(raw.slice(0, at));
  at = head.length + (head ? 1 : 0);
  if (s.length <= 160) return s;
  let a = Math.max(0, at - 60);
  let b = Math.min(s.length, at + len + 60);
  if (a > 0) a = s.indexOf(" ", a) + 1;
  if (b < s.length) b = s.lastIndexOf(" ", b);
  return `${a > 0 ? "..." : ""}${s.slice(a, b)}${b < s.length ? "..." : ""}`;
}

/** First order date stated in this text (already limited to this person). Returns { date, quote } or null. */
export function orderDateIn(text) {
  for (const sen of sentences(text)) {
    for (const re of RES) {
      const m = sen.match(re);
      if (!m) continue;
      if (re === RES[0]) {
        // Only the words between the order phrase and the date can tie the date to another event.
        const head = m[0].slice(0, m[0].lastIndexOf(m[1]));
        const om = head.match(new RegExp(ORDER, "i"));
        const gap = om ? head.slice(om.index + om[0].length) : head;
        if (OTHER_EVENT.test(gap)) continue;
      }
      const date = isoOf(m[1]);
      if (!date) continue;
      return { date, quote: quoteAround(sen, m.index, m[0].length) };
    }
  }
  return null;
}

/** From a row's own excerpt, a whole release, or a full post, for one person (siblings = other people on that source). */
export function orderFor(text, name, siblings = [], { strict = true } = {}) {
  const all = [...new Set(sentences(Array.isArray(text) ? text.join(" ") : String(text || "")))];
  return orderDateIn(pick(all, name, siblings, strict));
}

/** Fill the three fields only when the row has no date yet and has no approvalNote. Returns true when filled. */
export function fillOrder(row, found, sourceUrl) {
  if (!row || row.approvalNote || !found || !sourceUrl) return false;
  if (row.orderedRemovedDate != null) return false;
  row.orderedRemovedDate = found.date;
  row.orderedRemovedQuote = found.quote;
  row.orderedRemovedSource = sourceUrl;
  return true;
}

/** validate.mjs: problems with the optional fields on one row (empty list when absent or fine). */
export function orderProblems(r) {
  const out = [];
  const has = ORDER_KEYS.some((k) => k in r);
  if (!has) return out;
  const d = r.orderedRemovedDate;
  if (d != null && !(typeof d === "string" && /^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(d)))
    out.push(`row (${r.name}): orderedRemovedDate must be null or "YYYY", "YYYY-MM" or "YYYY-MM-DD"`);
  if (d != null && !String(r.orderedRemovedQuote || "").trim()) out.push(`row (${r.name}): orderedRemovedDate has no quoted phrase`);
  if (d != null && !/^https:\/\//.test(String(r.orderedRemovedSource || ""))) out.push(`row (${r.name}): orderedRemovedDate has no source URL`);
  if (d == null && (r.orderedRemovedQuote || r.orderedRemovedSource)) out.push(`row (${r.name}): orderedRemovedDate is null but a quote / source is set`);
  return out;
}
