/**
 * Pure parsing helpers for official press releases (no network).
 * A person becomes a row only when the SAME sentence names them AND describes
 * them with the release's own non-citizen wording (alien / national / citizen of /
 * illegally present). Nothing is inferred: no status, no photo, no charge text
 * that is not on the page. The charge label is the source sentence, word for word.
 */

import { readFileSync } from "node:fs";

/** "City, ST" -> [lat, lon], same keys as the app's CITY_GEO (src/data/city-geo.ts). */
const CITY_GEO = JSON.parse(readFileSync(new URL("./city-geo.json", import.meta.url), "utf8"));
const CITY_GEO_CI = new Map(Object.keys(CITY_GEO).map((k) => [k.toLowerCase(), k]));

/** { lat, lon } from the city table, or nulls when the city is not stated / not in the table. */
export function latLonFor(city) {
  const c = String(city || "").trim();
  const key = CITY_GEO[c] ? c : CITY_GEO_CI.get(c.toLowerCase());
  return key ? { lat: CITY_GEO[key][0], lon: CITY_GEO[key][1] } : { lat: null, lon: null };
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", eacute: "é", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", Eacute: "É", Aacute: "Á", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", uuml: "ü" };

export function decode(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENT ? ENT[n] : m));
}

/** HTML -> text blocks (paragraphs / list items), page chrome removed. */
export function htmlBlocks(html) {
  const cleaned = String(html || "")
    .replace(/<(script|style|noscript|svg|header|nav|footer|form|button)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(p|li|h[1-6]|div|tr|br|section|article|blockquote|ul|ol|table)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decode(cleaned)
    .replace(/\u00a0/g, " ")
    .split(/\n+/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 0);
}

const ABBR = /(?:\b(?:U\.S|U\.S\.A|Mr|Mrs|Ms|Dr|Jr|Sr|St|Ft|Mt|No|Co|Inc|Corp|Ltd|Gen|Gov|Sen|Rep|Lt|Sgt|Det|Jan|Feb|Mar|Apr|Aug|Sept|Sep|Oct|Nov|Dec|Ala|Ariz|Ark|Calif|Colo|Conn|Del|Fla|Ga|Ill|Ind|Kan|Ky|La|Md|Mass|Mich|Minn|Miss|Mo|Mont|Neb|Nev|Okla|Ore|Pa|Tenn|Tex|Va|Vt|Wash|Wis|Wyo|N\.[A-Z]|S\.[A-Z]|D\.C|[A-Z]))$/;

/** Split a text block into sentences without breaking on U.S., Tenn., initials, etc. */
export function sentences(block) {
  const out = [];
  let start = 0;
  const re = /[.!?]["”’)]?\s+(?=["“(]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(block))) {
    const before = block.slice(start, m.index);
    if (ABBR.test(before)) continue;
    out.push(block.slice(start, m.index + m[0].trimEnd().length).trim());
    start = m.index + m[0].length;
  }
  const tail = block.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

const PART = "(?:[A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜáéíóúñü'’`.-]*)";
const PARTICLE = "(?:de|del|de la|de los|la|las|los|da|das|do|dos|van|von|y|e|bin|al|el)";
const NAME = `(${PART}(?:\\s+(?:${PARTICLE}\\s+)?${PART}){1,5})`;
const AGE = "(?:\\d{1,3},\\s+)?";
const OF_PLACE = "(?:(?:of|from)\\s+[A-Z][A-Za-z .'-]+,\\s+(?:[A-Z][A-Za-z.]+\\s?){1,3},\\s+)?";
const DESC = "(?:an?\\s+)?((?:[A-Za-z-]+\\s+){0,4}?)";
const TYPE = "(alien|national|citizen|noncitizen|non-citizen|native and citizen)s?";
const COUNTRY = "(?:the\\s+)?([A-Z][A-Za-z'’.-]+(?:\\s+(?:and|of|the|[A-Z][A-Za-z'’.-]+)){0,4})";

const PATTERNS = [
  // "Ian Clive Burton, a criminal illegal alien from Jamaica, convicted for ..."
  // "John Doe, 45, a Mexican national, was charged ..."
  // "Jane Doe, 39, of Omaha, Nebraska, a citizen of Honduras, ..."
  new RegExp(`(?:^|[—–-]\\s+|,\\s+|\\band\\s+|\\b(?:arrested|removed|deported|charged|sentenced|indicted|convicted|apprehended|detained)\\s+)${NAME},\\s+${AGE}${OF_PLACE}${DESC}${TYPE}(?:\\s+(?:from|of)\\s+${COUNTRY})?`, "g"),
  // "Jane Roe and John Doe, both illegal aliens from the Dominican Republic" (two people, two rows)
  new RegExp(`(?:^|:\\s+|,\\s+|\\b(?:arrested|identified|charged|indicted|removed|deported)\\s+)${NAME}\\s+and\\s+${NAME},\\s+(?:both|each)\\s+${DESC}${TYPE}(?:\\s+(?:from|of)\\s+${COUNTRY})?`, "g"),
  // "John Doe, 45, who is illegally present in the United States"
  new RegExp(`(?:^|\\s)${NAME},\\s+${AGE}(?:who\\s+(?:is|was)\\s+)?(illegally|unlawfully)\\s+present`, "g"),
];

const NOT_NAME = /\b(ICE|DHS|HSI|ERO|CBP|USCIS|FBI|DEA|ATF|DOJ|U\.S|United|States|America|American|Department|Justice|Attorney|Attorneys|Office|Offices|Secretary|President|Homeland|Security|Immigration|Customs|Enforcement|Border|Patrol|County|Court|District|Federal|Judge|Agent|Agents|Special|Officers|Officer|Police|Sheriff|Government|Administration|Trump|Biden|Obama|Act|Operation|Task|Force|Division|Bureau|Service|Services|Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|The|This|These|Those|His|Her|Their|According|Under|Assistant|Acting|Chief|Director|Deputy|Senior|Prosecutor)\b/;

const DEMONYM = {
  Mexican: "Mexico", Guatemalan: "Guatemala", Honduran: "Honduras", Salvadoran: "El Salvador", Salvadorian: "El Salvador",
  Venezuelan: "Venezuela", Colombian: "Colombia", Cuban: "Cuba", Haitian: "Haiti", Dominican: "Dominican Republic",
  Ecuadorian: "Ecuador", Nicaraguan: "Nicaragua", Peruvian: "Peru", Brazilian: "Brazil", Chinese: "China",
  Indian: "India", Jamaican: "Jamaica", Nigerian: "Nigeria", Russian: "Russia", Ukrainian: "Ukraine",
  Afghan: "Afghanistan", Pakistani: "Pakistan", Vietnamese: "Vietnam", Filipino: "Philippines", Canadian: "Canada",
  Chilean: "Chile", Argentine: "Argentina", Bolivian: "Bolivia", Uzbek: "Uzbekistan", Albanian: "Albania",
  Romanian: "Romania", Somali: "Somalia", Sudanese: "Sudan", Iranian: "Iran", Iraqi: "Iraq", Syrian: "Syria",
  Egyptian: "Egypt", Ghanaian: "Ghana", Kenyan: "Kenya", Liberian: "Liberia", Cameroonian: "Cameroon",
  Bangladeshi: "Bangladesh", Korean: "Korea", Turkish: "Turkey", Belizean: "Belize", Panamanian: "Panama",
  Costa: "", Trinidadian: "Trinidad and Tobago", Guyanese: "Guyana", Senegalese: "Senegal", Mauritanian: "Mauritania",
};

const STATES = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT",
  Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI",
  Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
  "District of Columbia": "DC", "Puerto Rico": "PR",
};
/** AP-style state abbreviations as they appear in releases and posts ("Mass.", "N.Y."). */
const AP_STATES = {
  "Ala.": "AL", "Ariz.": "AZ", "Ark.": "AR", "Calif.": "CA", "Cal.": "CA", "Colo.": "CO", "Conn.": "CT",
  "Del.": "DE", "D.C.": "DC", "Fla.": "FL", "Ga.": "GA", "Ill.": "IL", "Ind.": "IN", "Kan.": "KS", "Kans.": "KS",
  "Ky.": "KY", "La.": "LA", "Md.": "MD", "Mass.": "MA", "Mich.": "MI", "Minn.": "MN", "Miss.": "MS", "Mo.": "MO",
  "Mont.": "MT", "Neb.": "NE", "Nebr.": "NE", "Nev.": "NV", "N.H.": "NH", "N.J.": "NJ", "N.M.": "NM", "N.Mex.": "NM",
  "N.Y.": "NY", "N.C.": "NC", "N.D.": "ND", "Okla.": "OK", "Ore.": "OR", "Oreg.": "OR", "Pa.": "PA", "Penn.": "PA",
  "P.R.": "PR", "R.I.": "RI", "S.C.": "SC", "S.D.": "SD", "Tenn.": "TN", "Tex.": "TX", "Vt.": "VT", "Va.": "VA",
  "Wash.": "WA", "W.Va.": "WV", "W. Va.": "WV", "Wis.": "WI", "Wisc.": "WI", "Wyo.": "WY",
};
const CODES = new Set([...Object.values(STATES)]);
const STATE_OF = (s) => STATES[s] || AP_STATES[s] || (CODES.has(s) ? s : "");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STATE_RE = [
  ...Object.keys(STATES).map((k) => `${esc(k)}\\b`),
  // "Mass." / "N.Y.": the trailing period ends the token (it may also end the sentence).
  ...Object.keys(AP_STATES).map((k) => `${esc(k)}(?=$|[\\s,;:)"”’])`),
  // Two-letter postal codes only as a bare token: "Yazoo City, MS" yes, "MS-13" no.
  ...[...CODES].map((c) => `${c}(?![\\w-])`),
].sort((a, b) => b.length - a.length).join("|");

/** NYC boroughs and "New York City" are placed as New York, NY (the city table key). */
const NYC = /^(?:Manhattan|Brooklyn|Queens|(?:the\s+)?Bronx|Staten Island|New York City|Harlem)$/i;
const NYC_BARE = /\b(?:in|on)\s+(?:the\s+)?(Manhattan|Brooklyn|Queens|Bronx|Staten Island|New York City)\b(?!,?\s+(?:County|Criminal|Supreme|District|Family)\b)/g;

/**
 * Place the sentence ties to the person or the act: "in X, ST" / "of X, ST" (last one wins),
 * or a bare NYC borough / "New York City". "from X" is origin and never a place here.
 * "in Monmouth County, New Jersey" -> "Monmouth County, NJ"; "in Marlborough, Mass." -> "Marlborough, MA";
 * "in Yazoo City, MS" -> "Yazoo City, MS"; "in Manhattan" -> "New York, NY". Only when the sentence says it.
 */
export function cityFrom(sentence) {
  const text = String(sentence || "");
  const re = new RegExp(`\\b(?:in|of)\\s+((?:[A-Z][A-Za-z.'’-]+\\s?){1,4}),\\s+(${STATE_RE})`, "g");
  let last = null;
  let m;
  while ((m = re.exec(text))) last = m;
  let bare = null;
  NYC_BARE.lastIndex = 0;
  while ((m = NYC_BARE.exec(text))) bare = m;
  if (last && (!bare || last.index > bare.index)) {
    const city = last[1].trim();
    const st = STATE_OF(last[2]);
    if (!st) return "";
    if (NYC.test(city) && st === "NY") return "New York, NY";
    if (NOT_NAME.test(city) && !/County/.test(city)) return "";
    return `${city}, ${st}`;
  }
  if (bare) return "New York, NY";
  return "";
}

const AND_COUNTRIES = /^(Antigua and Barbuda|Trinidad and Tobago|Bosnia and Herzegovina|Saint Kitts and Nevis|Sao Tome and Principe|Saint Vincent and the Grenadines)\b/;

function cleanCountry(c) {
  if (!c) return "";
  const fixed = String(c).match(AND_COUNTRIES);
  if (fixed) return fixed[1];
  return c
    .replace(/\s+and\b.*$/, "")
    .replace(/[,.;:]+$/, "")
    .replace(/\s+(?:and|of|the)$/i, "")
    .replace(/\s+(?:who|was|is|in|for|on|after|convicted|charged|arrested|with)\b.*$/, "")
    .trim();
}

/** Origin exactly as the sentence states it: "from X" / "of X" / "a Mexican national". */
function originFrom(desc, type, country) {
  const c = cleanCountry(country);
  if (c && /^[A-Z]/.test(c) && !NOT_NAME.test(c)) return c;
  const words = String(desc || "").trim().split(/\s+/).filter((w) => /^[A-Z]/.test(w));
  for (const w of words) if (DEMONYM[w]) return DEMONYM[w];
  if (/national|citizen/.test(type) && words.length) return words[words.length - 1];
  return "";
}

const VERB = /\b(charged|indicted|convicted|sentenced|pleaded|pled|found guilty|arrested|removed|deported|accused|alleged|wanted|detained|apprehended)\b/i;

/**
 * Find named non-citizens in a release.
 * Returns [{ name, origin, sentence, city }]; sentence is verbatim from the page.
 */
export function extractPeople(blocks) {
  const found = [];
  const seen = new Set();
  for (const block of blocks) {
    if (block.length < 25) continue;
    const sents = sentences(block);
    for (let i = 0; i < sents.length; i++) {
      const s = sents[i];
      for (const re of PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(s))) {
          const pair = re === PATTERNS[1];
          const people = pair
            ? [m[1], m[2]].map((n) => ({ n, origin: originFrom(m[3], m[4], m[5]) }))
            : [{ n: m[1], origin: re === PATTERNS[0] ? originFrom(m[2], m[3] || "", m[4]) : "" }];
          for (const { n, origin } of people) {
          const name = n.replace(/\s+/g, " ").trim();
          const toks = name.split(" ");
          if (toks.length < 2 || toks.length > 6 || name.length > 60) continue;
          if (NOT_NAME.test(name)) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          // Verbatim label: the naming sentence, plus the next sentence in the same
          // paragraph when the first has no charge / conviction / removal verb.
          let sentence = s;
          if (!VERB.test(s) && sents[i + 1] && VERB.test(sents[i + 1])) sentence = `${s} ${sents[i + 1]}`;
          found.push({ name, origin, sentence, city: cityFrom(s) || cityFrom(sentence) });
          }
        }
      }
    }
  }
  return found;
}

/** Prior-history phrases ("previously removed", "prior conviction", "criminal history includes")
 *  describe the past, not the stage of THIS case, so they never set the label. */
export function stripPriors(text) {
  return String(text || "")
    .replace(/\b(previously|prior|earlier|already|twice|once|formerly)\s+(been\s+)?(removed|deported|convicted)\b/gi, "prior-history")
    .replace(/\b(\d+|two|three|four|five|six|multiple|several)[- ]times?[- ](previously[- ])?(removed|deported)\b/gi, "prior-history")
    .replace(/\b(removed|deported)\s+(from\s+the\s+(U\.S\.|United States)\s+)?(at least\s+)?(once|twice|thrice|\d+|two|three|four|five|six|multiple|several)(\s+times)?\b/gi, "prior-history")
    .replace(/\bprior\s+(\w+\s+){0,2}convictions?\b/gi, "prior-history")
    .replace(/\bcriminal (history|record)\b/gi, "prior-history");
}

export const CONVICT_WORDS = /\b(convicted|convictions?|sentenced|pleaded guilty|pled guilty|pleads guilty|found guilty)\b/i;
export const CHARGE_WORDS = /\b(charged|charges|charging|indicted|indictment|arrested|arrests?|accused|alleged|allegedly|complaint|wanted|detained|apprehended)\b/i;
const REMOVE_WORDS = /\b(removed|deported|repatriated)\b/i;
const NOT_YET_REMOVED = /\bpending (removal|immigration)|in ICE custody|awaiting removal|will be (removed|deported)|processed for (removal|deportation)|ordered (removed|deported)/i;

/**
 * Stage label from the source's own words. Rules (stage is never escalated):
 *  - Convicted only when the person's own sentence says convicted / sentenced / pleaded or found guilty
 *    (not "prior conviction"), or, if the sentence has no stage word at all, a title that says so
 *    and does not also say charged / indicted / arrested.
 *  - Removed only when the sentence says removed / deported (not "previously"), or the sentence has
 *    no stage word and the title says deports / removes.
 *  - Otherwise charged / indicted / arrested wording gives Charged; nothing at all gives "As posted".
 */
export function statusFrom(sentence, title = "") {
  const s = stripPriors(sentence);
  const t = stripPriors(title);
  const notYet = NOT_YET_REMOVED.test(s);
  if (!notYet && REMOVE_WORDS.test(s)) return "Removed";
  if (CONVICT_WORDS.test(s)) return "Convicted";
  if (CHARGE_WORDS.test(s)) return "Charged";
  if (!notYet && /\b(deports|removes|deported|removed)\b/i.test(t) && !CHARGE_WORDS.test(t)) return "Removed";
  if (CONVICT_WORDS.test(t) && !CHARGE_WORDS.test(t)) return "Convicted";
  if (CHARGE_WORDS.test(t) || /\b(apprehend\w*|nabs|detainer)\b/i.test(t)) return "Charged";
  return "As posted";
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dateParts(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return {
    when: `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    picked: `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`,
    long: `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
    compact: iso.replace(/-/g, ""),
  };
}

const AGENCY = {
  DHSgov: { label: "DHS", confirmedBy: "DHS" },
  ICEgov: { label: "ICE", confirmedBy: "ICE" },
  TheJusticeDept: { label: "DOJ", confirmedBy: "DOJ" },
  CBP: { label: "CBP", confirmedBy: "DHS" },
};

export function slug(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** One feed row in the app's existing CaseRecord shape. photo is always "". */
export function toRow(hit, rel) {
  const a = AGENCY[rel.office] || { label: rel.office, confirmedBy: "DHS" };
  const d = dateParts(rel.date);
  const status = statusFrom(hit.sentence, rel.title);
  return {
    name: hit.name,
    city: hit.city || "Not stated",
    crime: `${status}: ${hit.sentence}`,
    usa: `${a.label} release ${d.long}: ${rel.title}`,
    foreign: "Not stated in post",
    picked: `${d.picked} (${a.label} release)`,
    entered: "Not stated",
    office: rel.office,
    id: `${a.label.toLowerCase()}-${d.compact}-${slug(hit.name)}`,
    when: d.when,
    text: `${a.label} ${d.long}, as posted: ${hit.sentence}`,
    photo: "",
    via: rel.url.replace(/^https:\/\/(www\.)?/, ""),
    sourceUrl: rel.url,
    voting: /\b(illegal(ly)? vot|unlawful(ly)? vot|voting (as|by)|voted in|vote in|registered to vote)/i.test(hit.sentence),
    origin: hit.origin || "Not stated",
    confirmedBy: a.confirmedBy,
    ...latLonFor(hit.city),
  };
}
