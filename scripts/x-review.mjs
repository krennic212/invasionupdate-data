/**
 * Krennic 2026-11-03: an official .gov row replaces a same-name X-only review row, but ONLY when it is clearly the same
 * person. Before this, any same-name row in data/review.json blocked the official release row (Pedro Gutierrez, Jasveer
 * Singh, Jose Rodriguez-Gomez, Nov 2, 2026).
 *
 * "Clearly the same person" (sameCaseAs):
 *  - the X row links the official release (same URL or same release slug), or
 *  - the X row is about the same case: both rows state the same country, and their own case words share at least 3
 *    distinctive words, one of them not a common crime word ("penetration", "300 pounds", "semi-truck", "Indiana").
 * Two stated countries that differ: different people. Anything else is "unsure".
 * Different or unsure: keep both rows. The official row goes in; the X row stays in review.json with a sameNameAs flag
 * (pruneReviewOfLive keeps it) and the pair is reported in harvest-status.json. Never merged on name alone.
 */
import { nameKey, nameKeysOf, urlsIn } from "./rules.mjs";
import { urlKey, releaseSlug } from "./dedupe.mjs";

const X_URL = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\//i;

/** A review row whose only source is an X post (no .gov or news link). */
export function xOnlyRow(r) {
  const u = urlsIn(r?.sourceUrl);
  return u.length > 0 && u.every((x) => X_URL.test(x));
}

const STOP = new Set(
  ("illegal alien aliens criminal convicted conviction convictions charged charges arrested arrest arrests removed removal deported " +
    "official mugshot posted post card status card from with after before their that this have been were which also into more than " +
    "under over about said says among people person roster victim victims unnamed name names uniquebyname citizen national native " +
    "previously prior history record released release state county city united states america ice dhs doj ero hsi agents agency " +
    "january february march april june july august september sept october november december jan feb mar apr jun jul aug sep oct nov dec " +
    "monday tuesday wednesday thursday friday saturday sunday week weekend year years month months today yesterday when where while " +
    "not stated stage label case cases post posts posted operation lodged detainer detainers custody federal following whose includes including onto also later then").split(/\s+/),
);
const COMMON_CRIME = new Set(
  ("sexual abuse assault child children minor minors drug drugs possession controlled substance battery robbery theft burglary murder " +
    "homicide driving influence domestic violence weapon weapons firearm firearms trafficking smuggling rape kidnapping larceny fraud " +
    "unlawful degree first second third fourth count counts aggravated attempted felony misdemeanor cocaine methamphetamine fentanyl " +
    "heroin marijuana entry reentry illegally unlawfully sodomy manslaughter strangulation predator offender offenses offense " +
    "deadly dangerous license without commit conspiracy gang gangs member members prisoner violent violation violations charge").split(/\s+/),
);

const FILLER = new Set("a an the of and or in on at to for by with as is was were be been his her their him he she it its who that from".split(" "));

/** Consecutive word pairs from the row's own case text (names, country and filler-only pairs left out). */
function casePairs(row) {
  const nameToks = new Set(nameKeysOf(row).flatMap((k) => k.split(" ")));
  const originToks = new Set(nameKey(row?.origin).split(" "));
  const t = nameKey(`${row?.crime || ""} ${row?.usa || ""} ${row?.text || ""}`).split(" ").filter((w) => w && !nameToks.has(w) && !originToks.has(w));
  const out = new Set();
  for (let i = 0; i + 1 < t.length; i++) {
    const [x, y] = [t[i], t[i + 1]];
    if ((FILLER.has(x) || STOP.has(x)) && (FILLER.has(y) || STOP.has(y))) continue;
    if (/^\d+$/.test(x) && /^(?:19|20)\d{2}$/.test(x)) continue;
    out.add(`${x} ${y}`);
  }
  return out;
}

function caseWords(row) {
  const nameToks = new Set(nameKeysOf(row).flatMap((k) => k.split(" ")));
  const originToks = new Set(nameKey(row?.origin).split(" "));
  const raw = nameKey(`${row?.crime || ""} ${row?.usa || ""} ${row?.text || ""}`).split(" ");
  return new Set(
    raw.filter((t) => {
      if (!t || nameToks.has(t) || originToks.has(t) || STOP.has(t)) return false;
      if (/^(?:19|20)\d{2}$/.test(t)) return false; // a year is a date, not a case detail
      if (/^\d+$/.test(t)) return Number(t) >= 100 && !/^0+$/.test(t); // small numbers are ages / counts
      return t.length >= 4;
    }),
  );
}

function stated(origin) {
  const o = nameKey(origin);
  return o && !/^(?:not stated|unknown|none)$/.test(o) ? o : "";
}

/** { decision: "same" | "different" | "unsure", why } for an official row and a same-name X-only review row. */
/** How many rows use each case word pair (rarity table for sameCaseAs). */
export function pairCounts(rows) {
  const df = new Map();
  for (const r of rows || []) {
    const src = urlsIn(r?.sourceUrl).map(urlKey)[0] || String(r?.id || "");
    for (const p of casePairs(r)) {
      if (!df.has(p)) df.set(p, new Set());
      df.get(p).add(src);
    }
  }
  return df;
}

export function sameCaseAs(official, xrow, { df = null } = {}) {
  const keys = new Set(urlsIn(official?.sourceUrl).flatMap((u) => [urlKey(u), releaseSlug(u)]).filter(Boolean));
  const xUrls = urlsIn(JSON.stringify(xrow || {})).map((u) => u.replace(/[",\\)\]]+$/, ""));
  if (xUrls.some((u) => keys.has(urlKey(u)) || (releaseSlug(u) && keys.has(releaseSlug(u))))) return { decision: "same", why: "X row links the official release" };
  const a = stated(official?.origin);
  const b = stated(xrow?.origin);
  if (a && b && a !== b) return { decision: "different", why: `different country (${official.origin} vs ${xrow.origin})` };
  const wa = caseWords(official);
  const shared = [...caseWords(xrow)].filter((t) => wa.has(t));
  const specific = shared.filter((t) => !COMMON_CRIME.has(t));
  const pa = casePairs(official);
  const pairs = [...casePairs(xrow)].filter((p) => pa.has(p));
  const plain = (w) => FILLER.has(w) || STOP.has(w) || COMMON_CRIME.has(w);
  // A rare pair: used by at most 2 OTHER sources (releases / posts) in the whole feed + review (when the table is given),
  // and never only filler, stop or common crime words. "300 pounds", "sexual penetration" count; "intent to distribute" never does.
  const own = new Set([official, xrow].map((r) => urlsIn(r?.sourceUrl).map(urlKey)[0] || String(r?.id || "")));
  const others = (p) => [...(df?.get(p) || [])].filter((k) => !own.has(k)).length;
  const rare = pairs.filter((p) => p.split(" ").some((w) => !plain(w) && !/^\d{1,2}$/.test(w)) && (!df || others(p) <= 2));
  if (a && b && shared.length >= 3 && specific.length >= 1 && pairs.length >= 3 && rare.length >= 2) return { decision: "same", why: `same country (${official.origin}) and same case wording: ${pairs.slice(0, 6).join(" / ")}` };
  return { decision: "unsure", why: a && b ? `same country but too few case words in common (${shared.join(", ") || "none"})` : "country not stated on both rows" };
}

/**
 * New official rows vs X-only review rows with the same name keys. Returns the new review list (clear matches removed,
 * others flagged sameNameAs) plus { replaced, keptBoth } for harvest-status.json. Never touches a harvest row.
 */
export function resolveXReview(officialRows, review, corpus = []) {
  const df = pairCounts([...corpus, ...review, ...officialRows]);
  const replaced = [];
  const keptBoth = [];
  const drop = new Set();
  const out = review.map((r) => r);
  for (const off of officialRows) {
    const keys = new Set(nameKeysOf(off));
    out.forEach((x, i) => {
      if (drop.has(i) || !xOnlyRow(x) || !nameKeysOf(x).some((k) => keys.has(k))) return;
      const { decision, why } = sameCaseAs(off, x, { df });
      if (decision === "same") {
        drop.add(i);
        replaced.push({ reviewId: x.id, name: x.name, liveId: off.id, why });
        return;
      }
      const flags = Array.isArray(x.sameNameAs) ? x.sameNameAs : [];
      if (!flags.some((f) => f.id === off.id)) out[i] = { ...x, sameNameAs: [...flags, { id: off.id, decision: "kept both", why }] };
      keptBoth.push({ reviewId: x.id, name: x.name, liveId: off.id, why });
    });
  }
  return { review: out.filter((_, i) => !drop.has(i)), replaced, keptBoth };
}
