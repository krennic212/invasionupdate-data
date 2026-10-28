#!/usr/bin/env node
/**
 * Row tags (Krennic 2026-10-28): additive metadata on every row in data/harvest.json and data/review.json,
 * `tags: string[]` in the fixed order of TAGS. Derived ONLY from the row's own words; nothing is guessed.
 *
 *   node scripts/tags.mjs            # (re)tag data/harvest.json + data/review.json in place
 *   node scripts/tags.mjs --check    # exit 1 if any row's tags differ from tagsFor()
 *
 * What is read: `crime`, `usa`, `entered` (the person's own fields) and `text`. When the same post / release
 * produced several rows (same sourceUrl or identical text), only the part of `text` about THIS person counts:
 * from the sentence that names them up to the sentence that names one of the others (a sentence before
 * any name counts only for a single-person post). `foreign`, `approvalNote`, `reviewReason` are never read.
 *
 * Rules:
 *  - CHNV: "CHNV", or the Cuba, Haiti, Nicaragua (and) Venezuela parole program.
 *  - DACA: DACA / Deferred Action for Childhood Arrivals stated as the person's status (recipient, granted,
 *    DACA <year>, former DACA ...). A denial / application / policy mention is not a status.
 *  - Entered under Biden: entry / crossing / arrival / release / parole wording tied to "Biden" in the same
 *    sentence, OR an entry date that falls wholly inside Jan 20, 2021 - Jan 19, 2025. CHNV implies Biden
 *    (the CHNV parole program existed only under Biden, 2022-2025).
 *  - Entered under Obama: same for "Obama" and Jan 20, 2009 - Jan 19, 2017.
 *  - A date only counts when it is the date of the entry itself ("entered ... in August 2022", "re-entered
 *    2023", "2015 entry"); dates of removals, orders, convictions etc. never count. A bare year / month that
 *    straddles an inauguration (2009, 2017, 2021, 2025; Jan of those years) is not enough. "Not stated" = none.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TAGS = ["CHNV", "DACA", "Entered under Biden", "Entered under Obama", "Gang", "MS-13", "TdA"];

const ADMINS = {
  "Entered under Biden": { who: "Biden", from: Date.UTC(2021, 0, 20), to: Date.UTC(2025, 0, 19) },
  "Entered under Obama": { who: "Obama", from: Date.UTC(2009, 0, 20), to: Date.UTC(2017, 0, 19) },
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MON = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
// One date: 11/24/2023 | 2023-11-24 | Nov. 24, 2023 | Oct 3 2005 | March 2015 | 2015
const DATE_SRC = `(?:\\d{1,2}/\\d{1,2}/(?:19|20)\\d{2}|(?:19|20)\\d{2}-\\d{2}-\\d{2}|${MON}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}|${MON},?\\s+(?:of\\s+)?(?:19|20)\\d{2}|(?:19|20)\\d{2})`;
const DATE = new RegExp(DATE_SRC, "i");

/** A written date -> the span of days it can mean, [start, end] in UTC ms. */
export function dateSpan(s) {
  const t = String(s).trim();
  let m;
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { const d = Date.UTC(+m[3], +m[1] - 1, +m[2]); return [d, d]; }
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { const d = Date.UTC(+m[1], +m[2] - 1, +m[3]); return [d, d]; }
  if ((m = t.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) { const d = Date.UTC(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]); return [d, d]; }
  if ((m = t.match(/^([A-Za-z]+)\.?,?\s+(?:of\s+)?(\d{4})$/))) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; return [Date.UTC(+m[2], mo, 1), Date.UTC(+m[2], mo + 1, 0)]; }
  if ((m = t.match(/^(\d{4})$/))) return [Date.UTC(+m[1], 0, 1), Date.UTC(+m[1], 11, 31)];
  return null;
}

const inside = (span, a) => !!span && span[0] >= a.from && span[1] <= a.to;

// Entry wording. "released" / "paroled" count (release at the border / into the US); "released from jail / prison" does not.
const ENTRY_VERB = "(?:re-?entered(?!\\s+(?:a|his|her)\\s+(?:guilty\\s+)?plea)|entered(?!\\s+(?:a|his|her|into\\s+a)\\s+(?:guilty\\s+|not\\s+guilty\\s+)?(?:plea|agreement|contract|marriage))|entering(?!\\s+(?:a|his|her)\\s+(?:guilty\\s+)?plea)|(?<!\\b(?:of|for|with|to)\\s+(?:(?:illegal|unlawful|improper)\\s+)?)(?<!\\b(?:illegal|unlawful|improper)\\s+re-?)(?<!\\bre-?)entry|crossed|crossing|arrived|arrival|came\\s+(?:in)?to|flew\\s+into|paroled(?!\\s+from)|parole(?!\\s+(?:in|of|officer|violation|board|hearing))|admitted\\s+into|let\\s+in|released(?!\\s+(?:from\\s+(?:jail|prison|custody\\s+at\\s+the)|on\\s+(?:parole|probation|bond|bail)))|released\\s+into)";
// Between the verb and its date: place / manner words only. Stops at anything that starts a different event.
const GAP = "(?:(?!\\b(?:after|before|until|removal|removed|deport\\w*|order\\w*|convict\\w*|sentenc\\w*|arrest\\w*|charged|vot\\w*|plea\\w*|elections?|since|then|and\\s+was|and\\s+(?:has|had)|remained|overstay\\w*|authorized)\\b)[^;.()])*?";
const VERB_THEN_DATE = new RegExp(`\\b${ENTRY_VERB}\\b(${GAP})\\b(?:in|on|around|about|approximately|circa|during)?\\s*(${DATE_SRC})\\b`, "gi");
const DATE_THEN_NOUN = new RegExp(`\\b(${DATE_SRC})\\s+(?:illegal\\s+|unlawful\\s+|legal\\s+)?(?:entry|arrival|border\\s+crossing|crossing)\\b`, "gi");

/** Entry dates written in one piece of text (the date of the entry itself only). */
export function entryDates(s) {
  const out = [];
  const text = String(s || "");
  for (const m of text.matchAll(VERB_THEN_DATE)) out.push(m[2]);
  for (const m of text.matchAll(DATE_THEN_NOUN)) out.push(m[1]);
  return out;
}

/**
 * Entry / release wording tied to an administration in the same sentence, e.g. "released ... by the Biden
 * administration", "Obama-released". The verb nearest to the administration's name must be an entry verb
 * (so "deported under Obama, re-entered in 2019" is not an Obama entry), at most 120 characters away.
 */
export function adminWording(sentence, who) {
  const s = String(sentence || "");
  if (new RegExp(`\\b${who}[- ](?:released|paroled|admitted)\\b`, "i").test(s)) return true;
  const admin = new RegExp(`\\b${who}\\b`, "gi");
  const verbs = [];
  for (const m of s.matchAll(new RegExp(`\\b${ENTRY_VERB}\\b`, "gi"))) verbs.push({ i: m.index, end: m.index + m[0].length, entry: true });
  for (const m of s.matchAll(/\b(?:deported|deportation|removed|removal|ignored|failed|refused|declined|ordered|convicted|sentenced|arrested)\b/gi)) verbs.push({ i: m.index, end: m.index + m[0].length, entry: false });
  for (const a of s.matchAll(admin)) {
    let best = null;
    // "under / by / during / via (the) (former President) Biden" belongs to the verb before it.
    const before = /\b(?:under|by|during|via|from)\s+(?:the\s+)?(?:former\s+)?(?:President\s+)?$/i.test(s.slice(Math.max(0, a.index - 40), a.index));
    for (const v of verbs) {
      if (before && v.end > a.index) continue;
      const between = v.end <= a.index ? s.slice(v.end, a.index) : s.slice(a.index + a[0].length, v.i);
      if (/[;]/.test(between) || between.length > 120) continue;
      if (!best || between.length < best.d) best = { d: between.length, entry: v.entry };
    }
    if (best?.entry) return true;
  }
  return false;
}

const CHNV_RE = /\bCHNV\b|\bCuba,?\s+Haiti,?\s+Nicaragua,?\s+(?:and\s+)?Venezuela\b[^.;]{0,60}\bparole|\bparole\b[^.;]{0,60}\bCuba,?\s+Haiti,?\s+Nicaragua,?\s+(?:and\s+)?Venezuela\b/i;

const DACA_WORD = /\bDACA\b|\bDeferred\s+Action\s+for\s+Childhood\s+Arrivals\b/i;
const DACA_STATUS = new RegExp(
  [
    "\\b(?:DACA|Deferred\\s+Action\\s+for\\s+Childhood\\s+Arrivals)(?:\\s*\\(DACA\\))?\\s+(?:recipient|holder|beneficiary|status|grant|approval|protections?|renewal|in\\s+" + MON + "|in\\s+(?:19|20)\\d{2}|(?:19|20)\\d{2})",
    "\\b(?:granted|received|receiving|approved\\s+for|obtained|had|has|held|holds|on|under|enrolled\\s+in|renewed|a|former|current|ex-)\\s+(?:his\\s+|her\\s+)?(?:DACA|Deferred\\s+Action\\s+for\\s+Childhood\\s+Arrivals)\\b",
    "\\b(?:DACA|Deferred\\s+Action\\s+for\\s+Childhood\\s+Arrivals)(?:\\s*\\(DACA\\))?\\s+(?:status\\s+)?(?:was|had\\s+been|has\\s+been)\\s+(?:granted|approved|revoked|terminated|expired|lapsed|renewed|rescinded)",
  ].join("|"),
  "i",
);
const DACA_NOT = /\b(?:denied|rejected|ineligible\s+for|not\s+eligible\s+for|never\s+(?:had|received|held|been\s+granted|applied\s+for)|applied\s+for|application\s+for)\s+(?:DACA|Deferred\s+Action\s+for\s+Childhood\s+Arrivals)\b|\bDACA\b[^.;]{0,40}\b(?:was|were)\s+denied\b|\bnot\s+a\s+DACA\b/i;

/** Sentences, split on . ! ? followed by a capital / quote / @ (abbreviations like "U.S. under" stay joined). */
export function sentences(s) {
  return String(s || "").split(/(?<=[.!?])\s+(?=["“'‘(@#A-Z])/).map((x) => x.trim()).filter(Boolean);
}

const STOP = new Set(["de", "del", "la", "las", "los", "el", "y", "da", "dos", "van", "von", "jr", "sr", "ii", "iii", "the", "aka"]);
const tokens = (name) => String(name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z'-]+/).flatMap((t) => [t, ...t.split("-")]).filter((t) => t.length >= 3 && !STOP.has(t));
const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Does this sentence name the person? Full name, or a surname token the other people of the post do not share. */
function names(sentence, person, others) {
  const s = fold(sentence);
  const full = [person.name, ...(person.aka ? [].concat(person.aka) : [])].filter(Boolean);
  if (full.some((n) => s.includes(fold(n)))) return true;
  const theirs = new Set(others.flatMap((o) => tokens(o)));
  const mine = full.flatMap(tokens).filter((t) => !theirs.has(t));
  return mine.some((t) => new RegExp(`(?:^|[^a-z])${t.replace(/[-']/g, "\\$&")}(?:$|[^a-z])`).test(s));
}

/** The part of `text` about this person (see header). */
export function ownText(row, others = []) {
  const ss = sentences(row?.text);
  if (!others.length) return ss.join(" ");
  const out = [];
  let mine = false;
  for (const s of ss) {
    const me = names(s, row, []) && names(s, row, others);
    const them = others.some((o) => names(s, { name: o }, [row.name, ...others.filter((x) => x !== o)]));
    if (me) mine = true;
    else if (them) mine = false;
    if (mine) out.push(s);
  }
  return out.join(" ");
}

/** Tags for one row. `others` = names of the other people from the same post / release. */
export function tagsFor(row, others = []) {
  if (!row || typeof row !== "object") return [];
  const entered = /^\s*not stated\b/i.test(String(row.entered || "")) && !/[;:]/.test(String(row.entered || "")) ? "" : String(row.entered || "");
  const pieces = [row.crime, row.usa, entered, ownText(row, others)].map((x) => String(x || "").replace(/\bU\.S\.(?:A\.)?/g, "US")).filter(Boolean);
  const sents = pieces.flatMap(sentences);
  const tags = new Set();

  if (sents.some((s) => CHNV_RE.test(s))) tags.add("CHNV");
  if (sents.some((s) => DACA_WORD.test(s) && DACA_STATUS.test(s) && !DACA_NOT.test(s))) tags.add("DACA");

  const dates = pieces.flatMap((p) => p.split(/;/).flatMap(entryDates)).map(dateSpan).filter(Boolean);
  for (const [tag, a] of Object.entries(ADMINS)) {
    if (dates.some((d) => inside(d, a)) || sents.some((s) => adminWording(s, a.who))) tags.add(tag);
  }
  if (tags.has("CHNV")) tags.add("Entered under Biden");
  const gangBlob = pieces.join(" ");
  if (/\b(MS-13|MS13|Mara Salvatrucha)\b/i.test(gangBlob)) tags.add("MS-13");
  if (/\b(Tren de Aragua|TdA)\b/i.test(gangBlob)) tags.add("TdA");
  if (/\b(gang member|street gang|gang affiliation|Tango (?:Blast|Corpito)|18th Street|Barrio 18|Latin Kings|Sureños|Surenos|MS-13|Mara Salvatrucha|Tren de Aragua|TdA)\b/i.test(gangBlob)) tags.add("Gang");
  return TAGS.filter((t) => tags.has(t));
}

/** Names of the other people per row: rows that share the same sourceUrl or the identical text. */
export function siblingsIndex(rows) {
  const by = new Map();
  const add = (k, r) => { if (!k) return; if (!by.has(k)) by.set(k, []); by.get(k).push(r); };
  for (const r of rows) { add(`u:${r?.sourceUrl || ""}`.replace(/^u:$/, ""), r); add(r?.text && r.text.length > 80 ? `t:${r.text}` : "", r); }
  return (row) => {
    const set = new Set();
    for (const k of [row?.sourceUrl ? `u:${row.sourceUrl}` : "", row?.text && row.text.length > 80 ? `t:${row.text}` : ""]) {
      for (const o of by.get(k) || []) if (o !== row && fold(o.name) !== fold(row.name)) set.add(o.name);
    }
    return [...set];
  };
}

/** Set `tags` on every row (new array objects; nothing else on the row changes). Returns how many rows changed. */
export function applyTags(rows, pool = rows) {
  const others = siblingsIndex(pool);
  let changed = 0;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const t = tagsFor(r, others(r));
    if (JSON.stringify(r.tags) !== JSON.stringify(t)) { r.tags = t; changed++; }
  }
  return changed;
}

/** Retag harvest.json + review.json on disk (only rewrites a file when a tag changed). */
export function applyTagsFiles({ harvest = "data/harvest.json", review = "data/review.json" } = {}) {
  const h = JSON.parse(readFileSync(harvest, "utf8"));
  const v = JSON.parse(readFileSync(review, "utf8"));
  const pool = [...h, ...v];
  const ch = applyTags(h, pool);
  const cv = applyTags(v, pool);
  if (ch) writeFileSync(harvest, `${JSON.stringify(h, null, 2)}\n`);
  if (cv) writeFileSync(review, `${JSON.stringify(v, null, 2)}\n`);
  return { harvestChanged: ch, reviewChanged: cv, counts: { live: countTags(h), review: countTags(v) } };
}

export function countTags(rows) {
  return Object.fromEntries(TAGS.map((t) => [t, rows.filter((r) => r?.tags?.includes(t)).length]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const harvest = process.env.HARVEST_FILE || "data/harvest.json";
  const review = process.env.REVIEW_FILE || "data/review.json";
  if (process.argv.includes("--check")) {
    const h = JSON.parse(readFileSync(harvest, "utf8"));
    const v = JSON.parse(readFileSync(review, "utf8"));
    const others = siblingsIndex([...h, ...v]);
    const bad = [...h, ...v].filter((r) => JSON.stringify(r.tags) !== JSON.stringify(tagsFor(r, others(r))));
    console.log(JSON.stringify({ mismatched: bad.map((r) => r.id) }));
    process.exit(bad.length ? 1 : 0);
  }
  console.log(JSON.stringify(applyTagsFiles({ harvest, review })));
}
