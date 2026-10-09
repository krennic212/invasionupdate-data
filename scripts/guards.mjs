/**
 * Hard guard rules. They hold even when AUTO_APPROVE is "true": a row that trips
 * any of them is written with status "pending" and a holdReason, and the site
 * does not show it until a person approves it.
 *
 *  1. minor     - the release indicates the person is a minor / juvenile.
 *  2. stage     - the label would say Convicted (or Removed) but the source's own wording for
 *                 this person is only charged / indicted / arrested. The stage is never escalated.
 *  3. at-large  - the person is described as a suspect still at large / not yet in custody.
 *  4. status    - the sentence does not state the person is a non-citizen.
 *  5. place     - the "name" is a place (state, city-geo city, "City, State", County, or the
 *                 release headline's "in <Place>"), not a person. Covers every writer (release
 *                 harvest, X scan picks, pending intake).
 */
import { stripPriors, CONVICT_WORDS, CHARGE_WORDS, isPlaceName } from "./parse.mjs";

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function isMinor(name, sentence, title = "") {
  const s = String(sentence || "");
  const age = s.match(new RegExp(`${esc(name)},\\s+(\\d{1,2}),`));
  if (age && Number(age[1]) < 18) return true;
  if (new RegExp(`${esc(name)},\\s+(?:a|an)\\s+(?:\\w+[\\s-]+){0,3}?(?:minor|juvenile|teen|teenager|boy|girl|child)\\b`, "i").test(s)) return true;
  if (/\b(\d{1,2})[- ]year[- ]old\b/i.test(s)) {
    const n = Number(s.match(/\b(\d{1,2})[- ]year[- ]old\b/i)[1]);
    if (n < 18 && new RegExp(`${esc(name)}[^.]{0,40}\\b${n}[- ]year[- ]old`, "i").test(s)) return true;
  }
  if (/\bjuvenile\b|\bunaccompanied (alien )?(child|children|minor)\b|\bas a minor\b|\bwhile a minor\b|\b(is|was) a minor\b/i.test(s)) return true;
  if (/\b(juvenile|teen|teenager|minor) (alien|suspect|defendant|offender|national)\b/i.test(title)) return true;
  return false;
}

/** Label must not be a later stage than the source's own words for this person. */
export function stageOk(label, sentence, title = "") {
  const s = stripPriors(sentence);
  const t = stripPriors(title);
  if (label === "Convicted") {
    if (CONVICT_WORDS.test(s)) return true;
    // No conviction word in the sentence: only a conviction-only title may carry it.
    return !CHARGE_WORDS.test(s) && CONVICT_WORDS.test(t) && !CHARGE_WORDS.test(t);
  }
  if (label === "Removed") {
    if (/\b(removed|deported|repatriated)\b/i.test(s)) return true;
    return !CHARGE_WORDS.test(s) && !CONVICT_WORDS.test(s) && /\b(deports|removes|deported|removed)\b/i.test(t) && !CHARGE_WORDS.test(t);
  }
  return true;
}

const AT_LARGE_STRONG = /\bat[- ]large\b|\bremains? (a )?fugitive\b|\bstill (being )?sought\b|\b(has|have) not (yet )?been (arrested|apprehended|located|found)\b|\bnot yet (been )?(arrested|apprehended|located)\b|\bwhereabouts\b/i;
const AT_LARGE_SENTENCE = /\bon the run\b|\bescaped\b|\bfled\b/i;

/** Sentence: strong or weak wording. Rest of the release: strong wording only (fail-safe: holds the whole release). */
export function atLarge(sentence, releaseText = "") {
  return AT_LARGE_STRONG.test(sentence) || AT_LARGE_SENTENCE.test(sentence) || AT_LARGE_STRONG.test(releaseText);
}

export function nonCitizenStated(sentence) {
  const s = String(sentence || "");
  if (/\bdual (national|citizen)|\bnaturali[sz]ed\b|\bU\.S\. citizen\b|\bUnited States citizen\b|\bAmerican citizen\b/i.test(s)) return false;
  return (
    /\baliens?\b|\bnon-?citizens?\b|\b(illegally|unlawfully) (present|residing|in the United States|in the U\.S\.)|\bnationals?\b|\bcitizens? of\b|\bforeign national\b|\billegal (immigrant|migrant)s?\b/i.test(s) ||
    /\b[A-Z][a-z]+ citizens?\b/.test(s)
  );
}

/** All reasons a row must stay pending (empty array = may be auto-approved). */
export function holdReasons({ name, sentence, title = "", releaseText = "", label = "" }) {
  const out = [];
  if (String(name || "").trim().split(/\s+/).length < 2 || isPlaceName(name, { title })) out.push("not a person: name is a place name or a single word");
  if (isMinor(name, sentence, title)) out.push("possible minor / juvenile");
  if (!stageOk(label, sentence, title)) out.push(`stage: label "${label}" is later than the source wording`);
  if (atLarge(sentence, releaseText)) out.push("suspect described as still at large");
  if (!nonCitizenStated(sentence)) out.push("not stated to be a non-citizen");
  return out;
}

/** Re-check an existing row from its own fields (crime = "<Label>: <verbatim sentence>", usa = "... release <date>: <title>"). */
export function holdReasonsForRow(row) {
  const crime = String(row?.crime || "");
  const m = crime.match(/^(Removed|Convicted|Charged|Arrested|As posted):\s*([\s\S]*)$/);
  const label = m ? m[1] : "";
  const sentence = m ? m[2] : crime;
  const title = String(row?.usa || "").replace(/^[^:]*release [A-Z][a-z]{2} \d{1,2}, \d{4}:\s*/, "");
  return holdReasons({ name: row?.name || "", sentence, title, releaseText: `${row?.text || ""}`, label });
}
