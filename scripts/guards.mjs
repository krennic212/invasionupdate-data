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

const AT_LARGE_STRONG = /\bat[- ]large\b|\bremains? (a )?fugitive\b|\bstill (being )?sought\b|\b(has|have) not (yet )?been (arrested|apprehended|located|found)\b|\bnot yet (been )?(arrested|apprehended|located)\b|\bwhereabouts (?:are|is|remain|remains) (?:still )?unknown\b|\bunknown whereabouts\b|\binformation (?:about|on|regarding) (?:his|her|their) whereabouts\b|\bdo not attempt to apprehend\b/i;
const AT_LARGE_SENTENCE = /\bon the run\b|\bescaped\b|\bfled\b/i;

/** Sentence: strong or weak wording. Rest of the release: strong wording only (fail-safe: holds the whole release). */
// ICE jargon: an "at-large arrest / at-large targeted enforcement (action) / at-large operation" is an arrest made out in
// the community, not a fugitive (Krennic 2026-10-16). Strip it before testing; real fugitive wording still holds.
const AT_LARGE_JARGON = /\bat[- ]large\s+(?:(?:targeted\s+)?(?:enforcement\s+)?(?:arrests?|actions?|operations?|enforcement)|targeted\s+(?:enforcement|arrests?|operations?)(?:\s+(?:actions?|operations?))?)\b/gi;
const dejargon = (t) => String(t || "").replace(AT_LARGE_JARGON, " ");

export function atLarge(sentence, releaseText = "") {
  sentence = dejargon(sentence); releaseText = dejargon(releaseText);
  return AT_LARGE_STRONG.test(sentence) || AT_LARGE_SENTENCE.test(sentence) || AT_LARGE_STRONG.test(releaseText);
}

export function nonCitizenStated(sentence) {
  const s = String(sentence || "");
  // Ignore "falsely claiming to be a U.S. citizen" so real foreign-citizen wording still counts.
  const stripped = s.replace(/\b(?:falsely\s+)?claim(?:ing|ed|s)?\s+to\s+be\s+(?:a\s+)?(?:U\.S\.|United States|American)\s+citizen\b/gi, " ");
  if (/\bdual (national|citizen)|\bnaturali[sz]ed\b|\bU\.S\. citizen\b|\bUnited States citizen\b|\bAmerican citizen\b/i.test(stripped)) return false;
  return (
    /\baliens?\b|\bnon-?citizens?\b|\b(illegally|unlawfully) (present|residing|in the United States|in the U\.S\.)|\bnationals?\b|\bcitizens? of\b|\bforeign national\b|\billegal (immigrant|migrant)s?\b/i.test(s) ||
    /\b[A-Z][a-z]+ citizens?\b/.test(s)
  );
}

/**
 * Krennic decision 2026-10-16: a person whose U.S. citizenship has ACTUALLY been revoked (denaturalized) counts like a
 * stated non-citizen. Only completed revocation counts; "faces denaturalization proceedings", "seeks to revoke",
 * "initiated proceedings to revoke", "could be denaturalized" do NOT (that person is still a U.S. citizen).
 * Checked against the sentence plus the whole post/release text (headlines often carry it).
 */
export function denaturalizedStated(text) {
  const s = String(text || "").replace(/\s+/g, " ");
  const pending = /\b(?:could|may|might|would|will|to|seek(?:s|ing)? to|move[sd]? to|faces?|facing)\s+(?:be\s+)?(?:denaturali[sz]ed|revoke|strip)/i;
  const done =
    /\bcitizenship\s+(?:was\s+|has\s+been\s+|is\s+|been\s+)?(?:revoked|stripped|cancell?ed)\b/i.test(s) ||
    /\b(?:was|were|been|is|got|now|recently|officially|formally|has been|had been|and|who was)\s+denaturali[sz]ed\b/i.test(s) ||
    /^\s*denaturali[sz]ed\b/i.test(s) ||
    /\brevoked\s+(?:his|her|their)\s+(?:U\.S\.\s+|United States\s+)?citizenship\b/i.test(s) ||
    /\bstripped\s+of\s+(?:his|her|their)\s+(?:U\.S\.\s+|United States\s+)?citizenship\b/i.test(s) ||
    /\bdenaturali[sz]ation\s+order\b|\border(?:ed)?\s+(?:his|her|their)\s+denaturali[sz]ation\b/i.test(s);
  if (!done) return false;
  // If the only revocation wording is forward-looking, it is not done.
  return !(pending.test(s) && !/\bcitizenship\s+(?:was\s+|has\s+been\s+)?revoked\b|\b(?:was|has been|been)\s+denaturali[sz]ed\b/i.test(s));
}

/** All reasons a row must stay pending (empty array = may be auto-approved). */
export function holdReasons({ name, sentence, title = "", releaseText = "", label = "" }) {
  const out = [];
  if (String(name || "").trim().split(/\s+/).length < 2 || isPlaceName(name, { title })) out.push("not a person: name is a place name or a single word");
  if (isMinor(name, sentence, title)) out.push("possible minor / juvenile");
  if (!stageOk(label, sentence, title)) out.push(`stage: label "${label}" is later than the source wording`);
  if (atLarge(sentence, releaseText)) out.push("suspect described as still at large");
  if (!nonCitizenStated(sentence) && !denaturalizedStated(`${sentence} ${releaseText}`)) out.push("not stated to be a non-citizen");
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
