/**
 * Hard guard rules. They hold even when AUTO_APPROVE is "true": a row that trips
 * any of them is written with status "pending" and a holdReason, and the site
 * does not show it until a person approves it.
 *
 *  1. minor     - the release indicates the person is a minor / juvenile.
 *  2. stage     - the label would say Convicted (or Removed) but the source's own wording for
 *                 this person is only charged / indicted / arrested. The stage is never escalated.
 *  3. at-large  - the person is described as a suspect still at large / not yet in custody.
 *  4. status    - the sentence does not state the person is a non-citizen (denaturalized, or deported,
 *                 anywhere in the sentence or post/release text also counts; Krennic 2026-10-16 / 2026-10-19).
 *  5. place     - the "name" is a place (state, city-geo city, "City, State", County, or the
 *                 release headline's "in <Place>"), not a person. Covers every writer (release
 *                 harvest, X scan picks, pending intake).
 */
import { stripPriors, CONVICT_WORDS, CHARGE_WORDS, isPlaceName, NOT_NAME } from "./parse.mjs";
import { suspiciousName } from "./names.mjs";

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
  if (label === "Pleaded guilty") {
    if (CONVICT_WORDS.test(s)) return true;
    return !CHARGE_WORDS.test(s) && CONVICT_WORDS.test(t) && !CHARGE_WORDS.test(t);
  }
  if (label === "Removed") {
    if (/\b(removed|deported|repatriated)\b/i.test(s)) return true;
    return !CHARGE_WORDS.test(s) && !CONVICT_WORDS.test(s) && /\b(deports|removes|deported|removed)\b/i.test(t) && !CHARGE_WORDS.test(t);
  }
  return true;
}

// Krennic 2026-11-06: "on the loose" (ICE wording) holds like "at large".
const AT_LARGE_STRONG = /\bat[- ]large\b|\bon the loose\b|\bstill on the run\b|\bremains? (a )?fugitive\b|\bstill (being )?sought\b|\b(has|have) not (yet )?been (arrested|apprehended|located|found)\b|\bnot yet (been )?(arrested|apprehended|located)\b|\bwhereabouts (?:are|is|remain|remains) (?:still )?unknown\b|\bunknown whereabouts\b|\binformation (?:about|on|regarding) (?:his|her|their) whereabouts\b|\bdo not attempt to apprehend\b/i;
const AT_LARGE_SENTENCE = /\bon the run\b|\bescaped\b|\bfled\b/i;

/** Sentence: strong or weak wording. Rest of the release: strong wording only (fail-safe: holds the whole release). */
// ICE jargon: an "at-large arrest / at-large targeted enforcement (action) / at-large operation" is an arrest made out in
// the community, not a fugitive (Krennic 2026-10-16). Strip it before testing; real fugitive wording still holds.
// Also ICE community-arrest phrasing: "arrested him/her at large" / "arrested <name> at-large" (Krennic 2026-10-19).
const AT_LARGE_JARGON = /\bat[- ]large\s+(?:(?:targeted\s+)?(?:enforcement\s+)?(?:arrests?|actions?|operations?|enforcement)|targeted\s+(?:enforcement|arrests?|operations?)(?:\s+(?:actions?|operations?))?)|\barrested\s+(?:him|her|them)\s+at[- ]large|\barrested(?:\s+\S+){0,6}\s+at[- ]large\b/gi;
const dejargon = (t) => String(t || "").replace(AT_LARGE_JARGON, " ");

export function atLarge(sentence, releaseText = "", name = "") {
  sentence = dejargon(sentence); releaseText = dejargon(releaseText);
  return AT_LARGE_STRONG.test(sentence) || AT_LARGE_SENTENCE.test(sentence) || releaseAtLargeFor(name, releaseText);
}

/**
 * Krennic 2026-10-31: strong at-large wording elsewhere in the release holds THIS person only when that sentence
 * names them (full name or surname), or names nobody else (pronoun / anonymous wording: fail-safe, holds everyone).
 * "Marianny Lucia Lopez-Torres and Frandy Aragon-Diaz are at large." no longer holds their sentenced co-defendants.
 * With no name (old callers) the whole release still holds everyone.
 */
const PERSONISH = /\b[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'’]+(?:-[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'’]+)?(?:\s+(?:(?:de|del|de la|la|los|y|van|von|da|dos)\s+)?[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'’]+(?:-[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'’]+)?){1,4}\b/g;
function releaseAtLargeFor(name, releaseText) {
  const n = String(name || "").trim();
  if (!n) return AT_LARGE_STRONG.test(releaseText);
  const last = n.split(/\s+/).slice(-1)[0];
  const parts = [n, last, ...last.split("-").filter((x) => x.length > 2)];
  const mine = new RegExp(`(?<![\\p{L}])(?:${parts.map(esc).join("|")})(?![\\p{L}])`, "iu");
  const sents = String(releaseText || "").split(/(?<=[.!?])\s+(?=[“"(]?[A-Z0-9])/);
  for (const s of sents) {
    if (!AT_LARGE_STRONG.test(s)) continue;
    if (mine.test(s)) return true;
    const others = (s.match(PERSONISH) || []).filter((x) => !NOT_NAME.test(x) && !/^(?:Anyone|Any|Those|They|He|She|His|Her|Both|All|Two|Three|Four|Five|Six)\b/.test(x));
    if (!others.length) return true;
  }
  return false;
}

// "undocumented immigrant(s)" / "an undocumented ..." counts like "illegal alien" (Krennic 2026-10-19).
// "lawful / legal permanent resident" and "green card holder" are non-citizen statuses by definition (2026-10-20).
// "<Nationality> national" ("a Brazilian national") counts through \bnationals?\b.
const OBJECT_ALIENS = /\b(?:alien|human)[- ]smuggl\w*|\b(?:smuggl\w*|transport\w*|harbou?r\w*|conceal\w*|shield\w*|induc\w*|encourag\w*|recruit\w*|bring\w*|brought|mov(?:e|ed|ing))\s+(?:(?:or\s+\w+\s+)?(?:the|of|in|into|to|for|more|than|over|at|least|about|dozens|hundreds|thousands|\d[\d,]*|undocumented|illegal|other|several|many|multiple|groups?|[A-Z][a-z]+)\s+){0,5}aliens?\b|\b(?:travel|entry|transportation|smuggling|harbou?ring|movement)\s+of\s+(?:\w+\s+){0,2}aliens?\b/gi;
/**
 * Krennic 2026-11-03: "American citizen" / "U.S. citizen" that describes the person whose identity was stolen or assumed
 * ("assumed the identity of “Tony Wayne Ortiz,” an American citizen", usao-edtn Oct 30, 2026) is the victim, not this
 * defendant. Only the "identity / name / birth certificate / Social Security number of <someone>, a U.S. citizen" shape
 * is blanked; any other U.S.-citizen wording still blocks.
 */
export const VICTIM_IDENTITY = /\b(?:identit(?:y|ies)|name|birth certificate|social security number|passport)\s+of\s+(?:an?\s+|another\s+)?(?:(?:“[^”]{1,60}”|"[^"]{1,60}")\s*,?\s+(?:an?\s+)?)?(?:real\s+|actual\s+|living\s+|deceased\s+)?(?:American|U\.S\.|United States)\s+citizen\b/gi;
/**
 * Krennic 2026-11-06: a U.S. citizen the defendant harmed or targeted is a victim, not this defendant ("a crash that left a
 * U.S. citizen hospitalized", DHS Nov 5, 2026, Sukhdev Singh). Only object shapes after a harm verb / "victim" are blanked;
 * "<Name>, a U.S. citizen," and every other own-citizen wording still blocks.
 */
export const VICTIM_CITIZEN = /\b(?:left|leaving|leaves|killed|killing|kills|injur(?:ed|ing|es)|struck|striking|strikes|hit(?:ting)?|assault(?:ed|ing|s)|attack(?:ed|ing|s)|rap(?:ed|ing)|murder(?:ed|ing|s)|robb(?:ed|ing)|kidnapp?(?:ed|ing)|stabb(?:ed|ing)|shot|shooting|harm(?:ed|ing)|victimiz(?:ed|ing)|defraud(?:ed|ing)|target(?:ed|ing)|endanger(?:ed|ing)|abus(?:ed|ing)|threaten(?:ed|ing)|molest(?:ed|ing)|groom(?:ed|ing)|sexually\s+\w+|(?:the\s+)?victims?,?(?:\s+(?:was|were|is|are|who\s+(?:is|was)))?)\s+(?:(?:a|an|one|two|three|four|five|several|multiple|\d+|another|other|innocent|young|elderly|female|male|woman|man|girl|boy|child|teen(?:age)?|\d+-year-old)\s+){0,3}(?:U\.S\.|United States|American)\s+citizens?(?:\s+(?:victims?|woman|man|girl|boy|child|children))?\b|\b(?:U\.S\.|United States|American)\s+citizen\s+victims?\b/gi;
export const stripVictimIdentity = (s) => String(s || "").replace(VICTIM_IDENTITY, " ").replace(VICTIM_CITIZEN, " ");
/** Krennic 2026-11-03: "with no United States citizenship" (usao-sdfl Apr 29, 2025), "no U.S. citizenship",
 *  "not a citizen of the United States" state non-citizen status. */
const NO_US_CITIZENSHIP = /\bno\s+(?:United States|U\.S\.)\s+citizenship\b|\bnot\s+a\s+citizen\s+of\s+the\s+United States\b/i;

export function nonCitizenStated(sentence) {
  const s = stripVictimIdentity(sentence);
  // Ignore "falsely claiming to be a U.S. citizen" so real foreign-citizen wording still counts.
  const stripped = s.replace(/\b(?:falsely\s+)?claim(?:ing|ed|s)?\s+to\s+be\s+(?:a\s+)?(?:U\.S\.|United States|American)\s+citizen\b/gi, " ");
  if (/\bdual (national|citizen)|\bnaturali[sz]ed\b|\bU\.S\. citizen\b|\bUnited States citizen\b|\bAmerican citizen\b/i.test(stripped)) return false;
  // Krennic 2026-11-02: smuggling / conspiracy wording about OTHER people ("conspiracy to smuggle aliens", "an alien
  // smuggling organization", "the travel of aliens", "induced thousands of Cuban aliens") is never this person's status.
  const own = s.replace(OBJECT_ALIENS, " ");
  return (
    NO_US_CITIZENSHIP.test(s) ||
    /\baliens?\b/i.test(own) ||
    /\bnon-?citizens?\b|\b(?:lawful|legal) permanent residen(?:t|ts|ce)\b|\bgreen[- ]card holders?\b|\b(illegally|unlawfully) (present|residing|in the United States|in the U\.S\.)|\bnationals?\b|\bcitizens? of\b|\bforeign national\b|\billegal (immigrant|migrant)s?\b|\bundocumented (?:immigrant|migrant|alien|noncitizen|non-citizen)s?\b|\ban undocumented\b/i.test(s) ||
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

/**
 * Krennic decision 2026-10-19 (11:42 AM CT, replaces the narrower 'deported + illegally reentered' rule): "deported"
 * means illegal alien. A post that says the person was deported counts as non-citizen wording on its own; no
 * illegal-reentry wording is needed. Counts: "deported" (incl. "deported to <country>", "DEPORTED:"), "deportation of
 * him/her/<name>", "(illegal reentry) after (a prior) deportation", "removed (him/her) to <Country>". Does NOT count: forward-looking wording ("will / could / may / to be
 * deported", "faces / facing / pending deportation", bare "deportation proceedings"). The U.S.-citizen override still
 * wins: if the text says the person is a U.S. / United States / American citizen, dual national or naturalized (other
 * than "falsely claiming to be a U.S. citizen"), this does not count. Denaturalization rules are separate and unchanged.
 * Checked against the sentence plus the whole post/release text.
 */
const CITIZEN_CLAIM = /\b(?:falsely\s+)?claim(?:ing|ed|s)?\s+to\s+be\s+(?:a\s+)?(?:U\.S\.|United States|American)\s+citizen\b/gi;
const CITIZEN_OVERRIDE = /\bdual (national|citizen)|\bnaturali[sz]ed\b|\bU\.S\. citizen\b|\bUnited States citizen\b|\bAmerican citizen\b/i;
export function deportedStated(text) {
  const s = String(text || "").replace(/\s+/g, " ");
  if (CITIZEN_OVERRIDE.test(stripVictimIdentity(s).replace(CITIZEN_CLAIM, " "))) return false;
  // Blank forward-looking wording first so "will be deported" never counts.
  const t = s.replace(/\b(?:will|would|could|can|may|might|shall|to|must|should)\s+(?:also\s+|then\s+|soon\s+|likely\s+)?(?:be|get)\s+deported\b/gi, " ")
    .replace(/\b(?:faces?|facing|pending|awaiting|await|avoid(?:ed|ing)?|fight(?:ing|s)?|seek(?:s|ing)?)\s+(?:possible\s+|his\s+|her\s+)?deportation\b/gi, " ");
  return (
    /\bdeported\b/i.test(t) ||
    /\bdeportation\s+of\s+(?:him|her)\b/i.test(t) ||
    /\b[Dd]eportation\s+of\s+[A-Z][\w'-]+/.test(t) ||
    /\b(?:after|following|since)\s+(?:his\s+|her\s+|a\s+|an\s+)?(?:prior\s+|previous\s+|earlier\s+)?deportation\b/i.test(t) ||
    /\b[Rr]emoved\s+(?:him\s+|her\s+)?to\s+(?:the\s+)?[A-Z][a-z]+/.test(t)
  );
}
/** Kept for callers of the 2026-10-19 morning rule; now the same as deportedStated (the wider rule). */
export const deportedReentryStated = deportedStated;

/**
 * Person-scoped check (2026-10-20). DOJ lists several defendants in one sentence separated by ";":
 * "Gabriel Cezar Menezes, 29, a Brazilian national, was sentenced to 94 months; Omar ... Correa, 34, a U.S. citizen,
 * was sentenced to 30 months; ...". The co-defendant's "U.S. citizen" must not cancel THIS person's own wording, and
 * this person's own "U.S. citizen" must still hold them. True when every ";" clause that names the person is free of
 * U.S.-citizen / naturalized / dual wording and at least one of them states non-citizen status.
 */
export function nonCitizenStatedFor(name, sentence) {
  const s = String(sentence || "");
  const n = String(name || "").trim();
  if (!n || !/;\s/.test(s)) return nonCitizenStated(s);
  const last = n.split(/\s+/).slice(-1)[0];
  const parts = s.split(/;\s+/);
  let mine = parts.filter((p) => p.includes(n));
  if (!mine.length) mine = parts.filter((p) => new RegExp(`(?<![A-Za-z'’-])${esc(last)}(?![A-Za-z'’-])`).test(p));
  if (!mine.length) return nonCitizenStated(s);
  if (mine.some((p) => CITIZEN_OVERRIDE.test(stripVictimIdentity(p).replace(CITIZEN_CLAIM, " ")))) return false;
  // Krennic 2026-11-03: a one-person list entry that ends with its own nameless status sentence ("... ; convicted again in
  // 2018 of ... Citizen of Mexico.", D. Or. Oct 30, 2026) states this person's status. Only that exact closing form.
  if (/^[^;]*\S\s+[—–-]\s+/.test(s) && /(?:^|\.\s+)(?:Citizen|National|Native and citizen) of [A-Z][A-Za-z .'’-]+\.$/.test(s.trim()) && !CITIZEN_OVERRIDE.test(s.replace(CITIZEN_CLAIM, " "))) return true;
  return mine.some((p) => nonCitizenStated(p));
}

/** All reasons a row must stay pending (empty array = may be auto-approved). */
export function holdReasons({ name, sentence, title = "", releaseText = "", label = "", mononym = false }) {
  const out = [];
  // A one-word name passes only when the parser found it in a clearly structured list entry (parse.mjs MONONYM_ENTRY).
  if ((String(name || "").trim().split(/\s+/).length < 2 && !mononym) || isPlaceName(name, { title })) out.push("not a person: name is a place name or a single word");
  // Parser slips (Krennic 2026-10-27): "Pantaleon Chacon Madrid Oct", "Nevada.Mario Garcia", all-caps headline text.
  for (const r of suspiciousName(name)) if (r !== "single word" && r !== "empty name") out.push(`suspicious name: ${r}`);
  if (isMinor(name, sentence, title)) out.push("possible minor / juvenile");
  if (!stageOk(label, sentence, title)) out.push(`stage: label "${label}" is later than the source wording`);
  if (atLarge(sentence, releaseText, name)) out.push("suspect described as still at large");
  if (!nonCitizenStatedFor(name, sentence) && !denaturalizedStated(`${sentence} ${releaseText}`) && !deportedStated(`${sentence} ${releaseText}`)) out.push("not stated to be a non-citizen");
  return out;
}

/** Re-check an existing row from its own fields (crime = "<Label>: <verbatim sentence>", usa = "... release <date>: <title>"). */
export function holdReasonsForRow(row) {
  const crime = String(row?.crime || "");
  const m = crime.match(/^(Removed|Convicted|Pleaded guilty|Charged|Arrested|As posted):\s*([\s\S]*)$/);
  const label = m ? m[1] : "";
  const sentence = m ? m[2] : crime;
  const title = String(row?.usa || "").replace(/^[^:]*release [A-Z][a-z]{2} \d{1,2}, \d{4}:\s*/, "");
  return holdReasons({ name: row?.name || "", sentence, title, releaseText: `${row?.text || ""}`, label });
}
