#!/usr/bin/env node
/**
 * "# of previous arrests" (Krennic 2026-11-25) and its companions, read ONLY from the official words already on each row.
 *
 *   priorArrests        integer or null. A count the release states about THIS person ("six arrests", "more than 30 prior
 *                       arrests", "arrested 38 times", "On five occasions ... NYPD arrested him" + "Two more times ... arrested").
 *   priorArrestsPlus    true when the release gives a floor ("more than 30", "at least 3", or counts limited to one year).
 *   priorArrestsQuote   the exact phrase the number came from (so a human can check it), or null.
 *   priorReleases       integer or null. "released from jail seven times" (kept apart from arrests, never folded in).
 *   priorConvictions    integer or null. "two felony convictions", "3 prior convictions".
 *   priorRemovals       integer or null. "deported twice", "twice-deported", "removed three times".
 *
 * Never guesses. null whenever the wording gives no number: "prior arrests for X, Y and Z" (charges, not a count),
 * "an arrest for DUI" (one item of a non-exhaustive history), "multiple arrests", "nearly 40" (neither exact nor a floor),
 * ICE operation totals ("the operation led to 12 arrests"). A count counts only when the sentence ties it to the person
 * (a lead-in such as "with", "has", "had", "prior", "previous", "history of"; "arrested N times").
 * On a release or post that produced several rows, only sentences about THIS person are read (the subject is whoever was
 * named last); a sentence naming two of them is skipped.
 * Data only: no status, hold, guard or row is changed or added or removed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PRIOR_KEYS = ["priorArrests", "priorArrestsPlus", "priorArrestsQuote", "priorReleases", "priorConvictions", "priorRemovals"];

const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, twice: 2, thrice: 3,
};
const NUM = "(?:\\d{1,3}(?:,\\d{3})*|\\d+|" + Object.keys(WORDS).join("|") + ")";
const FLOOR = "(?:more than|over|at least|upwards of|in excess of)";
const NEAR = /\b(?:nearly|almost|approximately|about|around|roughly|under|fewer than|less than|up to)\s+$/i;

function toInt(w) {
  const s = String(w).toLowerCase().replace(/,/g, "");
  if (/^\d+$/.test(s)) return Number(s);
  return WORDS[s] ?? null;
}

const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();
const keyOf = (n) => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

function clip(s, m) {
  const a = Math.max(0, m.index - 40);
  const b = Math.min(s.length, m.index + m[0].length + 40);
  return tidy(`${a > 0 ? "..." : ""}${s.slice(a, b)}${b < s.length ? "..." : ""}`);
}

function firstCount(s, regexes, { allowFloor = true } = {}) {
  for (const re of regexes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const before = s.slice(0, m.index);
      if (NEAR.test(before)) continue;
      if (/\ball\s+$/i.test(before)) continue;
      const n = toInt(m.groups.n);
      if (n == null || n < 1 || n > 500) continue;
      const floor = allowFloor && new RegExp(`${FLOOR}\\s*$`, "i").test(before) || (m.groups.fl ? true : false);
      return { n, plus: !!floor, quote: clip(s, m) };
    }
  }
  return null;
}

const LEAD = "(?:with|has|had|having|have|history of|record of|racked up|accrued|accumulated|including|includes|also|and|of|prior|previous|previously)";
const ADJ = "(?:(?:prior|previous|past|earlier|criminal|separate|different|known|additional|felony|misdemeanor|other|total|documented)\\s+){0,2}";
// "twice-deported" / "twice deported" / "three times removed" right after the number belongs to removals, not arrests
// ("ICE arrested twice-deported Juan ...").
const NOT_REMOVAL = "(?![- ]+(?:time[- ]+)?(?:deported|removed|returned)\\b)";
const ARREST_RES = [
  // "with six arrests", "more than 30 prior arrests", "has 5 previous arrests"
  new RegExp(`\\b${LEAD}\\s+(?<fl>${FLOOR}\\s+)?(?<n>${NUM})\\s+${ADJ}arrests?\\b`, "gi"),
  // "38 prior arrests" without a lead-in word is only taken with prior / previous in front of arrests
  new RegExp(`(?<fl>${FLOOR}\\s+)?\\b(?<n>${NUM})\\s+(?:prior|previous|earlier)\\s+(?:\\w+\\s+)?arrests?\\b`, "gi"),
  // "arrested 5 times", "has been arrested twice", "arrested by NYPD 38 times"
  new RegExp(`\\barrested(?:\\s+(?:by\\s+[A-Za-z.]+(?:\\s+[A-Za-z.]+)?|previously|repeatedly|in\\s+[A-Z][a-z]+))?\\s+(?<fl>${FLOOR}\\s+)?(?<n>(?:${NUM})\\s+times|twice|thrice)\\b${NOT_REMOVAL}`, "gi"),
  // Krennic 2026-11-26 backfill: "He had twice been arrested in California", "has three times been arrested"
  new RegExp(`\\b(?:has|had|have)\\s+(?<n>twice|thrice|(?:${NUM})\\s+times)\\s+been\\s+arrested\\b`, "gi"),
  // "The U.S. Border Patrol later arrested Figueroa three times between Nov. 2015 and Feb. 2019" (an agency arrested the
  // person, named or "him", N times). Only sentences already picked as about this person reach here.
  new RegExp(`\\barrested\\s+(?:him|her|[A-Z][\\w'-]+(?:\\s+[A-Z][\\w'-]+){0,3})\\s+(?<fl>${FLOOR}\\s+)?(?<n>(?:${NUM})\\s+times|twice|thrice)\\b${NOT_REMOVAL}`, "g"),
  // 2026-11-27: "He had been arrested and released twice before" (both happened that many times)
  new RegExp(`\\b(?:has|had|have)\\s+been\\s+arrested\\s+and\\s+released\\s+(?<n>twice|thrice|(?:${NUM})\\s+times)\\b`, "gi"),
  // "arrested on three occasions", "has been arrested on 5 separate occasions", "ICE arrested him on two prior occasions"
  new RegExp(`\\barrested(?:\\s+(?:him|her|[A-Z][\\w'-]+(?:\\s+[A-Z][\\w'-]+){0,3}))?(?:\\s+(?:previously|repeatedly))?\\s+on\\s+(?<fl>${FLOOR}\\s+)?(?<n>${NUM})\\s+(?:separate\\s+|different\\s+|prior\\s+|previous\\s+|other\\s+)?occasions\\b`, "g"),
];

function arrestCount(s) {
  const strip = (r) => r && { ...r, n: r.n };
  // "arrested 5 times": group n includes "times"; reduce to the number
  for (const [ri, re] of ARREST_RES.entries()) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const before = s.slice(0, m.index);
      if (NEAR.test(before) || /\ball\s+$/i.test(before)) continue;
      const raw = String(m.groups.n).replace(/\s+times$/i, "");
      const n = toInt(raw);
      if (n == null || n < 1 || n > 500) continue;
      // A floor when the release says "more than", leads with "includes / including / also", or goes on to name further arrests.
      // "THREE prior arrests for driving under the influence": the count is for that offense, so the total is at least that.
      const after = s.slice(m.index + m[0].length);
      const forOffense = /^\s*(?:for|on charges? of)\b/i.test(after) || /^\s+in\s+[A-Z][\w.]*(?:\s+[A-Z][\w.]*)?\s+for\b/.test(after);
      // (2026-11-26 patterns only) A count limited to a stretch of time ("three times between Nov. 2015 and Feb. 2019") is a floor.
      const window = ri >= 3 && /^\s+(?:between|since|during|from|in\s+(?:19|20)\d{2}|in\s+[A-Z][a-z]+\s+(?:19|20)\d{2})\b/.test(after);
      const plus = forOffense || window || !!m.groups.fl || new RegExp(`${FLOOR}\\s*$`, "i").test(before) || /^(?:includes?|including|also)\b/i.test(m[0]) || /\b(?:as well as|and|plus)\s+(?:other\s+|additional\s+)?arrests\b/i.test(s.slice(m.index + m[0].length));
      return { n, plus, quote: clip(s, m) };
    }
  }
  // One stated prior arrest: "one previous arrest", "his only prior arrest". "a prior arrest for DUI" (Bill / Krennic 2026-11-27) is one
  // item of a history, like "an arrest for X", and is not a count. Rows filled before 2026-11-27 keep their stored value.
  const one = /\b(?:one|(?:his|her|a|the)\s+only)\s+(?:prior|previous)\s+(?:\w+\s+)?arrest\b/i.exec(s);
  if (one && !/\b(?:no|any)\s+$/i.test(s.slice(0, one.index))) return { n: 1, plus: /\b(?:includes?|including)\s+$/i.test(s.slice(0, one.index)), quote: clip(s, one) };
  // Counted occasions: "On five occasions in 2026, the NYPD arrested him" + "Two more times in November 2026, the NYPD arrested him".
  const occ = new RegExp(`\\b(?:on\\s+)?(?<n>${NUM})\\s+(?:more\\s+)?(?:occasions|times)(?:\\s+(?:in|during)\\s+(?:[A-Z][a-z]+\\s+)?(?:19|20)\\d{2})?,?\\s+(?:the\\s+)?(?<who>[A-Za-z.]+(?:\\s+[A-Za-z.]+){0,2}?)\\s+arrested\\b`, "gi");
  let total = 0;
  const quotes = [];
  let m;
  while ((m = occ.exec(s))) {
    const n = toInt(m.groups.n);
    if (n == null) continue;
    // The one who arrested must be an agency / police name ("the NYPD", "ICE officers"), not "he was".
    if (!/^[A-Z]/.test(m.groups.who) || /^(?:Was|Had|Has|Been|He|She|They|And|Then)\b/.test(m.groups.who)) continue;
    if (/(?:deported|removed|returned|convicted|released|sentenced)\s*$/i.test(s.slice(0, m.index))) continue;
    total += n;
    quotes.push(clip(s, m));
  }
  if (total > 0) return { n: total, plus: true, quote: quotes.join(" + ") };
  return null;
}

const RELEASE_RES = [
  new RegExp(`\\breleased\\s+(?:him|her|them|[A-Z][\\w-]+(?:\\s+[A-Z][\\w-]+){0,3})?\\s*(?:from\\s+(?:jail|custody|prison|detention)\\s*)?(?:back\\s+(?:onto|into)\\s+the\\s+streets?\\s*)?(?:\\w+\\s+){0,2}?(?<fl>${FLOOR}\\s+)?(?<n>${NUM})\\s+times\\b`, "gi"),
  new RegExp(`\\breleased\\s+from\\s+(?:jail|custody|prison)\\s+(?<fl>${FLOOR}\\s+)?(?<n>${NUM})\\s+times\\b`, "gi"),
  new RegExp(`\\blet\\s+(?:him|her|them)\\s+(?:go|out)\\s+(?<fl>${FLOOR}\\s+)?(?<n>${NUM})\\s+times\\b`, "gi"),
  new RegExp(`\\breleased\\s+(?:him|her|them)\\s+(?<n>twice|thrice)\\b`, "gi"),
  // 2026-11-27: "was released TWICE before ...", "had been arrested and released twice before", "been released 3 times"
  new RegExp(`\\b(?:was|were|been|and)\\s+released\\s+(?<fl>${FLOOR}\\s+)?(?<n>twice|thrice|(?:${NUM})\\s+times)\\b`, "gi"),
  new RegExp(`\\b(?<fl>${FLOOR}\\s+)?(?<n>${NUM})\\s+(?:prior|previous)\\s+releases\\b`, "gi"),
  // "released Flores back into the community on two separate occasions"
  new RegExp(`\\breleased\\s+(?:him|her|them|[A-Z][\\w-]+(?:\\s+[A-Z][\\w-]+){0,3})\\s+(?:back\\s+(?:onto|into)\\s+the\\s+(?:community|streets?)\\s+)?on\\s+(?<n>${NUM})\\s+(?:separate\\s+|different\\s+)?occasions\\b`, "gi"),
];

function releaseCount(s) {
  let best = null;
  for (const re of RELEASE_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const before = s.slice(0, m.index);
      if (NEAR.test(before) || /\ball\s+$/i.test(before)) continue;
      const mid = m[0];
      if (/\ball\s+\w+\s+times/i.test(mid)) continue;
      const n = toInt(String(m.groups.n).replace(/\s+times$/i, ""));
      if (n == null || n < 1 || n > 500) continue;
      if (!best || n > best) best = n;
    }
  }
  return best;
}

const CONVICTION_RES = [
  new RegExp(`\\b(?:with|has|had|having|history of|record of|prior|previous|previously|including|includes)\\s+(?:${FLOOR}\\s+)?(?<n>${NUM})\\s+${ADJ}(?:criminal\\s+)?convictions\\b`, "gi"),
  new RegExp(`\\b(?<n>${NUM})\\s+(?:prior|previous)\\s+(?:\\w+\\s+)?convictions\\b`, "gi"),
];
function convictionCount(s) {
  const r = firstCount(s, CONVICTION_RES, { allowFloor: false });
  return r ? r.n : null;
}

const REMOVAL_RES = [
  new RegExp(`\\b(?:previously\\s+|been\\s+|was\\s+|were\\s+)?(?:deported|removed)\\s+(?<n>(?:${NUM})\\s+times|twice|thrice)\\b`, "gi"),
  // "removed from the U.S. 3 times", "previously removed at least twice"
  new RegExp(`\\b(?:deported|removed)(?:\\s+[A-Za-z.]+){0,6}\\s+(?:at least\\s+)?(?<n>(?:${NUM})\\s+times|twice|thrice)\\b`, "gi"),
  // "twice-deported", "a twice previously removed", "a three-time previously removed" (2026-11-27)
  new RegExp(`\\b(?<n>twice|thrice|${NUM})[- ](?:time[- ])?(?:previously\\s+|prior\\s+)?(?:deported|removed)\\b`, "gi"),
  new RegExp(`\\b(?<n>${NUM})\\s+(?:prior\\s+|previous\\s+)?(?:removals|deportations)\\b`, "gi"),
  // 2026-11-27: "removed from the United States on three occasions", "deported on two prior occasions"
  new RegExp(`\\b(?:deported|removed)(?:\\s+[A-Za-z.]+){0,6}?\\s+on\\s+(?<n>${NUM})\\s+(?:separate\\s+|prior\\s+|previous\\s+|different\\s+)?occasions\\b`, "gi"),
];
function removalCount(s) {
  for (const re of REMOVAL_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const before = s.slice(0, m.index);
      if (NEAR.test(before)) continue;
      const n = toInt(String(m.groups.n).replace(/\s+times$/i, ""));
      if (n != null && n >= 1 && n <= 50) return n;
    }
  }
  return null;
}

export function sentences(text) {
  return tidy(text).split(/(?<=[.!?])(?<!\b(?:U\.S|U\.K|D\.C|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec|Mr|Mrs|Ms|Dr|St|Ft|Mt|No|Jr|Sr|Gov|Sen|Rep|Lt|Sgt|Det|Capt|Insp|Co|Inc|vs|Ave|Blvd|Rd)\.)\s+(?=[A-Z0-9"“🚨@])/);
}

/** Name keys that point at one person: the full name and each surname-ish piece longer than 3 letters. */
function nameHits(sentence, name) {
  const s = keyOf(sentence);
  const full = keyOf(name);
  if (!full) return false;
  if (s.includes(full)) return true;
  const parts = full.split(" ").filter((p) => p.length > 3);
  const last = parts[parts.length - 1];
  if (!!last && new RegExp(`\\b${last}\\b`).test(s)) return true;
  // A hyphenated surname is often shortened to its first half ("Figueroa-Bonilla" -> "Figueroa", "Flores-Arce" -> "Flores").
  const tail = String(name || "").trim().split(/\s+/).pop() || "";
  const half = tail.includes("-") ? keyOf(tail.split("-")[0]) : "";
  return half.length > 3 && new RegExp(`\\b${half}\\b`).test(s);
}

const PRONOUN_LEAD = /^(?:He|She|His|Her|The\s+(?:defendant|suspect|illegal alien|criminal illegal alien|criminal alien|alien))\b/;

/**
 * The text this person's counts may be read from. `siblings` = other names whose rows share this release / post.
 * Lenient (a row's own stored excerpt): every sentence, minus other people's when the source has several rows.
 * Strict (a whole release): only sentences that name this person, plus a pronoun sentence right after one
 * ("He has ...") so a victim, a co-defendant or an official is never read as the person.
 */
export function personText(row, siblings = [], { strict = false } = {}) {
  const all = [...new Set(sentences(`${row.text || ""} ${row.crime || ""}`))];
  return pick(all, row.name, siblings, strict);
}

export function pick(all, name, siblings, strict) {
  if (!strict && !siblings.length) return all.join(" ");
  const keep = [];
  let subjectIsSelf = !strict;
  for (const sen of all) {
    const self = nameHits(sen, name);
    // Test the others on the sentence minus this person's full name, so a sibling surname that is also one of this person's
    // given names ("Elias Izquiero Manuel" vs "Jose Manuel Munoz Ramos") does not mark the sentence as shared.
    const rest = keyOf(sen).split(keyOf(name)).join(" ");
    const other = siblings.some((n) => nameHits(rest, n));
    if (self && other) { subjectIsSelf = false; continue; }
    if (self) subjectIsSelf = true;
    else if (other) subjectIsSelf = false;
    else if (strict && !PRONOUN_LEAD.test(sen)) subjectIsSelf = false;
    if (subjectIsSelf) keep.push(sen);
  }
  return keep.join(" ");
}

function fieldsFrom(s) {
  const a = arrestCount(s);
  return {
    priorArrests: a ? a.n : null,
    priorArrestsPlus: a ? a.plus : false,
    priorArrestsQuote: a ? a.quote : null,
    priorReleases: releaseCount(s),
    priorConvictions: convictionCount(s),
    priorRemovals: removalCount(s),
  };
}

export function priorFor(row, siblings = []) {
  return fieldsFrom(personText(row, siblings));
}

/** Counts read from a whole official release (array of paragraph strings, or one string) for one person. */
export function priorFromRelease(blocks, name, siblings = []) {
  const text = Array.isArray(blocks) ? blocks.join(" ") : String(blocks || "");
  return fieldsFrom(pick([...new Set(sentences(text))], name, siblings, true));
}

/** Rows that share a release or post with this one (other people's names), keyed by row id. */
export function siblingNames(rows, pool = rows) {
  const bySource = new Map();
  for (const r of pool) {
    for (const u of [r?.sourceUrl, r?.via].filter(Boolean)) {
      const k = String(u).split(/[\s,]+/)[0];
      // Only a link is a shared source. A bare handle ("@EROBaltimore 1927...") would join every post from that account.
      if (!k.includes("/")) continue;
      if (!bySource.has(k)) bySource.set(k, new Map());
      bySource.get(k).set(r.id, r.name);
    }
  }
  return (r) => {
    const out = new Map();
    for (const u of [r?.sourceUrl, r?.via].filter(Boolean)) {
      const k = String(u).split(/[\s,]+/)[0];
      for (const [id, name] of bySource.get(k) || []) if (id !== r.id && keyOf(name) !== keyOf(r.name)) out.set(id, name);
    }
    return [...out.values()];
  };
}

/** Set the six fields on every row that lacks them. Returns how many rows changed. Nothing else on a row is touched. */
export function applyPrior(rows, pool = rows) {
  const sibs = siblingNames(rows, pool);
  let changed = 0;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    // Fill only rows that do not carry the fields yet. A value read from a whole release (harvest.mjs, backfill) is never
    // overwritten by a re-read of the shorter stored excerpt.
    if (PRIOR_KEYS.every((k) => k in r)) continue;
    const p = priorFor(r, sibs(r));
    for (const k of PRIOR_KEYS) r[k] = p[k];
    changed++;
  }
  return changed;
}

export function applyPriorFile(harvest = "data/harvest.json", review = "data/review.json") {
  const h = JSON.parse(readFileSync(harvest, "utf8"));
  let v = [];
  try { v = JSON.parse(readFileSync(review, "utf8")); } catch { v = []; }
  const changed = applyPrior(h, [...h, ...v]);
  if (changed) writeFileSync(harvest, `${JSON.stringify(h, null, 2)}\n`);
  return { rows: h.length, fieldsChanged: changed, withArrests: h.filter((r) => r.priorArrests != null).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(applyPriorFile(process.argv[2] || "data/harvest.json", process.argv[3] || "data/review.json")));
}
