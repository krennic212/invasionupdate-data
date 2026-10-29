/**
 * Pure parsing helpers for official press releases (no network).
 * A person becomes a row only when the SAME sentence names them AND describes
 * them with the release's own non-citizen wording (alien / national / citizen of /
 * illegally present). Nothing is inferred: no status, no photo, no charge text
 * that is not on the page. The charge label is the source sentence, word for word.
 */

import { countryFor, cleanOrigin, DEMONYMS, COUNTRIES } from "./country.mjs";
import { enteredFromText } from "./entered.mjs";
import { readFileSync } from "node:fs";
import { cleanPersonName } from "./names.mjs";

/** "City, ST" -> [lat, lon], same keys as the app's CITY_GEO (src/data/city-geo.ts). */
const CITY_GEO = JSON.parse(readFileSync(new URL("./city-geo.json", import.meta.url), "utf8"));
const CITY_GEO_CI = new Map(Object.keys(CITY_GEO).map((k) => [k.toLowerCase(), k]));

/** Table key for a place: exact, case-insensitive, or the normalized "City, ST" form ("Chicago, Illinois" -> "Chicago, IL"). */
export function cityGeoKey(city, table = CITY_GEO) {
  const c = String(city || "").trim();
  if (!c) return "";
  const ci = table === CITY_GEO ? CITY_GEO_CI : new Map(Object.keys(table).map((k) => [k.toLowerCase(), k]));
  for (const cand of [c, normalizePlace(c)]) {
    if (!cand) continue;
    if (table[cand]) return cand;
    const k = ci.get(cand.toLowerCase());
    if (k) return k;
  }
  return "";
}

/** { lat, lon } from the city table, or nulls when the city is not stated / not in the table. */
export function latLonFor(city) {
  const key = cityGeoKey(city);
  return key ? { lat: CITY_GEO[key][0], lon: CITY_GEO[key][1] } : { lat: null, lon: null };
}

/** Add entries to the in-memory table (scripts/geo.mjs writes them to city-geo.json as the cache). */
export function rememberCityGeo(key, lat, lon) {
  CITY_GEO[key] = [lat, lon];
  CITY_GEO_CI.set(key.toLowerCase(), key);
}

/**
 * One spelling for a place: "Chicago, Illinois" / "Chicago, Ill." / "Chicago, IL." / "chicago,  il" -> "Chicago, IL";
 * "Washington, D.C." -> "Washington, DC"; a bare state name stays as written. "" for "Not stated".
 */
export function normalizePlace(city) {
  let c = String(city || "").replace(/\s+/g, " ").trim();
  if (!c || /^(?:not stated|unknown|n\/a|none)$/i.test(c)) return "";
  const m = c.match(/^(.+?),\s*([A-Za-z. ]+?)\.?$/);
  if (!m) return c;
  const place = m[1].trim();
  const stRaw = m[2].trim();
  const st = STATE_OF(stRaw) || STATE_OF(`${stRaw}.`) || STATE_OF(stRaw.toUpperCase()) ||
    STATES[Object.keys(STATES).find((k) => k.toLowerCase() === stRaw.toLowerCase())] || "";
  return st ? `${place}, ${st}` : c;
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
    // "Hector Castro-Lopez , an illegal alien" -> "Hector Castro-Lopez, an illegal alien" (stray space before a comma).
    .map((b) => b.replace(/\s+/g, " ").replace(/ +,/g, ",").trim())
    .filter((b) => b.length > 0);
}

const ABBR = /(?:\b(?:U\.S|U\.S\.A|Mr|Mrs|Ms|Dr|Jr|Sr|St|Ft|Mt|No|Co|Inc|Corp|Ltd|Gen|Gov|Sen|Rep|Lt|Sgt|Det|Jan|Feb|Mar|Apr|Aug|Sept|Sep|Oct|Nov|Dec|Ala|Ariz|Ark|Calif|Colo|Conn|Del|Fla|Ga|Ill|Ind|Kan|Ky|La|Md|Mass|Mich|Minn|Miss|Mo|Mont|Neb|Nev|Okla|Ore|Pa|Tenn|Tex|Va|Vt|Wash|Wis|Wyo|N\.[A-Z]|S\.[A-Z]|D\.C|[A-Z]))$/;

/** Split a text block into sentences without breaking on U.S., Tenn., initials, etc. */
export function sentences(block) {
  const out = [];
  let start = 0;
  // Also a period with no space before the next sentence ("... in Las Vegas, Nevada.Mario Garcia, a criminal ...",
  // DHS Oct 26, 2026): a word of 2+ lowercase letters, ".", then a capitalized word. "St.Louis" / "U.S." stay whole (ABBR).
  const re = /[.!?]["”’)]?\s+(?=["“(]?[A-Z0-9])|(?<=[a-z]{2})\.(?=[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+[\s,])/g;
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
// "of Omaha, Nebraska, " or (state releases) "of Fort Myers (Lee County), " / "of Tampa, ".
const OF_PLACE = "(?:(?:of|from)\\s+[A-Z][A-Za-z .'-]+,\\s+(?:[A-Z][A-Za-z.]+\\s?){1,3},\\s+|(?:of|from)\\s+[A-Z][A-Za-z.'-]+(?:\\s[A-Z][A-Za-z.'-]+){0,2}(?:\\s\\([A-Z][A-Za-z .'-]+\\))?,\\s+)?";
const DESC = "(?:an?\\s+)?(?:\\d+-time\\s+)?((?:[A-Za-z-]+\\s+){0,6}?)";
const TYPE = "(alien|national|citizen|noncitizen|non-citizen|native and citizen)s?";
const COUNTRY = "(?:the\\s+)?([A-Z][A-Za-z'’.-]+(?:\\s+(?:and|of|the|[A-Z][A-Za-z'’.-]+)){0,4})";

const PATTERNS = [
  // "Ian Clive Burton, a criminal illegal alien from Jamaica, convicted for ..."
  // "John Doe, 45, a Mexican national, was charged ..."
  // "Jane Doe, 39, of Omaha, Nebraska, a citizen of Honduras, ..."
  new RegExp(`(?:^|[—–-]\\s+|,\\s+|;\\s+(?:and\\s+)?|\\band\\s+|\\b(?:that|is)\\s+|\\b(?:arrested|removed|deported|charged|sentenced|indicted|convicted|apprehended|detained)\\s+)${NAME},\\s+${AGE}${OF_PLACE}${DESC}${TYPE}(?:\\s+(?:from|of)\\s+${COUNTRY})?`, "g"),
  // "Jane Roe and John Doe, both illegal aliens from the Dominican Republic" (two people, two rows)
  // "Rudi Lacatusu and Mirabela Lacatusu, illegal aliens from Romania" (plural wording, no "both"; DHS Oct 13 2026)
  new RegExp(`(?:^|:\\s+|,\\s+|;\\s+(?:and\\s+)?|\\b(?:arrested|identified|charged|indicted|removed|deported)\\s+)${NAME}(?:,\\s+\\d{1,3},)?\\s+and\\s+${NAME},\\s+${AGE}(?:(?:both|each)\\s+${DESC}${TYPE}|${DESC}(alien|national|citizen|noncitizen|non-citizen)s)(?:\\s+(?:from|of)\\s+${COUNTRY})?`, "g"),
  // "John Doe, 45, who is illegally present in the United States"
  new RegExp(`(?:^|\\s)${NAME},\\s+${AGE}(?:who\\s+(?:is|was)\\s+)?(illegally|unlawfully)\\s+present`, "g"),
  // ICE's common wording: "ICE Seattle arrested illegal alien Ronald Zacarias-Gregorio, 36, of Guatemala."
  // "... arrested criminal illegal alien Tung Huy Nguyen, 52, of Vietnam" / "... arrested criminal alien <Name>, 30, of El Salvador"
  new RegExp(`\\b(?:arrested|arrests|removed|deported|apprehended|detained)\\s+(?:an?\\s+)?(?:criminal\\s+)?(?:illegal\\s+)?alien\\s+${NAME}(?:,\\s+(${PART}(?:\\s+${PART}){0,2})(?=,\\s+\\d{1,3}\\b))?(?=,|\\.|\\s+(?:in|on|at|from|of|who|after|for|upon|was)\\b|$)`, "g"),
  // DOJ election-crime roundups lead each case with the nationality (OPA Oct 5 / Oct 12 / Sept 18, 2026):
  // "Pakistani national Jamil Ahmad, 50, a lawful permanent resident, has been charged ..." /
  // "Nigerian national, Helen Sayen Adams, 67, ..." / "Democratic Republic of Congo National, Celestin Katubadi , 20, ...".
  // Sentence start only, and the name must be followed by an age, so a headline or official never matches.
  new RegExp(`^(?:[A-Z][A-Za-z .'’-]{0,40}[:–—]\\s+)?((?:[A-Z][a-z]+\\s+(?:of\\s+)?){0,3}[A-Z][a-z]+)\\s+[Nn]ational,?\\s+${NAME}\\s?,\\s+\\d{1,3},`, "g"),
  // Date before the name: "On October 21, 2026, ICE arrested Juan Silva, a criminal alien from Mexico."
  // The same sentence must name the person as an alien / non-citizen / citizen of / national of.
  // A date plus "charged <Name>" whose status is in the next paragraph stays with linkedPeople.
  new RegExp(`\\b(?:On\\s+)?(?:\\d{1,2}/\\d{1,2}/(?:19|20)\\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2})\\b[^.]{0,140}?\\b(?:arrested|deported|removed|charged|indicted)\\s+(?:an?\\s+)?(?:criminal\\s+)?(?:illegal\\s+)?(?:alien\\s+)?${NAME}(?=[^.]{0,180}\\b(?:illegal\\s+alien|alien|non-?citizen|citizen\\s+of|national\\s+of)\\b)`, "g"),
  // "a 4-time previously deported criminal alien" after the name, and "the arrest of [Name]".
  new RegExp(`\\b(?:deported|removed|arrested)\\s+${NAME},\\s+${AGE}(?:an?\\s+)?(?:\\d+-time\\s+)?previously\\s+deported\\s+criminal\\s+alien`, "g"),
  new RegExp(`\\bthe arrest of\\s+${NAME}(?=[^.]{0,100}\\b(?:alien|non-?citizen|national)\\b)`, "g"),
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
/** Approximate geographic center of each state, for rows whose only place is the state (USAO district). */
const STATE_CENTER = {
  AL: [32.8067, -86.7911], AK: [61.3707, -152.4044], AZ: [34.0489, -111.0937], AR: [34.9697, -92.3731], CA: [36.7783, -119.4179],
  CO: [39, -105.5], CT: [41.6032, -73.0877], DE: [38.9108, -75.5277], DC: [38.9072, -77.0369], FL: [27.6648, -81.5158],
  GA: [32.1656, -82.9001], HI: [19.8968, -155.5828], ID: [44.0682, -114.742], IL: [40.6331, -89.3985], IN: [40.2672, -86.1349],
  IA: [41.878, -93.0977], KS: [39.0119, -98.4842], KY: [37.8393, -84.27], LA: [31, -92], ME: [45.2538, -69.4455],
  MD: [39.0458, -76.6413], MA: [42.4072, -71.3824], MI: [44.3148, -85.6024], MN: [46.7296, -94.6859], MS: [32.3547, -89.3985],
  MO: [37.9643, -91.8318], MT: [46.8797, -110.3626], NE: [41.4925, -99.9018], NV: [38.8026, -116.4194], NH: [43.1939, -71.5724],
  NJ: [40.0583, -74.4057], NM: [34.5199, -105.8701], NY: [40.7128, -74.006], NC: [35.7596, -79.0193], ND: [47.5515, -101.002],
  OH: [40.4173, -82.9071], OK: [35.0078, -97.0929], OR: [43.8041, -120.5542], PA: [41.2033, -77.1945], RI: [41.5801, -71.4774],
  SC: [33.8361, -81.1637], SD: [43.9695, -99.9018], TN: [35.5175, -86.5804], TX: [31.9686, -99.9018], UT: [39.321, -111.0937],
  VT: [44.5588, -72.5778], VA: [37.5, -78.6], WA: [47.7511, -120.7401], WV: [38.5976, -80.4549], WI: [43.7844, -88.7879],
  WY: [43.076, -107.2903], PR: [18.2208, -66.5901],
};
const STATE_NAME_OF = Object.fromEntries(Object.entries(STATES).map(([n, c]) => [c, n]));

/** State code of a U.S. Attorney's Office release URL ("/usao-ndtx/" -> "TX", "/usao-mn/" -> "MN"). */
export function stateFromUsao(url) {
  const m = String(url || "").match(/\/usao-([a-z]{2,4})\//i);
  if (!m) return "";
  const code = m[1].slice(-2).toUpperCase();
  return CODES.has(code) ? code : "";
}

/**
 * Fallback place for a row whose sentence has no "in X, ST" (Krennic 2026-10-20: 33 voting rows were
 * "Not stated"). The release's own locality ("living in Long Beach", "a Fresno resident", "of Hudson
 * County") with the USAO district's state, when that city is in the map table or is a county; otherwise
 * the district's state name. The USAO district counts as the state. Empty when there is no district.
 */
export function placeFromDistrict(sentence, url) {
  const st = stateFromUsao(url);
  if (!st) return "";
  const text = String(sentence || "");
  const loc =
    text.match(/\b(?:living|residing|who lives|who resides)\s+in\s+((?:[A-Z][A-Za-z.'’-]+\s?){1,4})/) ||
    text.match(/\b(?:an?\s+)?((?:[A-Z][A-Za-z.'’-]+\s?){1,3})\s+resident\b/) ||
    text.match(/\bof\s+((?:[A-Z][A-Za-z.'’-]+\s){0,2}County)\b/);
  if (loc) {
    const place = loc[1].trim().replace(/[,.]$/, "");
    const key = `${place}, ${st}`;
    if (/\bCounty$/.test(place) || CITY_GEO_CI.has(key.toLowerCase())) return key;
  }
  return STATE_NAME_OF[st] || "";
}

/** { lat, lon } for a city from the table, or the state's center for a bare state name. */
export { STATES, STATE_CENTER };
export function geoForPlace(place) {
  const ll = latLonFor(place);
  if (ll.lat != null) return ll;
  const st = STATES[String(place || "").trim()];
  return st && STATE_CENTER[st] ? { lat: STATE_CENTER[st][0], lon: STATE_CENTER[st][1] } : ll;
}

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

/** City names from scripts/city-geo.json ("Syracuse", "St. Louis"), lowercased. */
const CITY_NAMES = new Set(Object.keys(CITY_GEO).map((k) => k.replace(/,\s*[A-Z]{2}$/, "").trim().toLowerCase()));
const STATE_NAMES = new Set(Object.keys(STATES).map((k) => k.toLowerCase()));
const PLACE_WORD = /\b(?:County|Parish|Borough|Township|City|Village|Metro|Metropolitan|Area|Region|Valley|Island|Islands)\b/i;
const placeKey = (s) => String(s || "").replace(/[“”"‘’']/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Place phrases a release headline names with "in <Place>" / "across <Place>":
 * "DHS Highlights Worst Illegal Aliens Arrested in Syracuse, New York | Homeland Security"
 *   -> ["syracuse, new york", "syracuse", "new york"].
 */
export function titlePlaces(title) {
  const out = new Set();
  const t = String(title || "").replace(/\s*\|.*$/, "");
  const re = /\b(?:in|across|throughout|near|around)\s+((?:[A-Z][A-Za-z.'’-]*,?\s*){1,6})/g;
  let m;
  while ((m = re.exec(t))) {
    const phrase = m[1].replace(/[,\s]+$/, "").trim();
    if (!phrase) continue;
    out.add(placeKey(phrase));
    for (const part of phrase.split(/\s*,\s*/)) if (part) out.add(placeKey(part));
  }
  return [...out];
}

/**
 * True when a "name" is really a place: a US state ("New York"), a city in city-geo.json
 * ("Syracuse"), "City, State" ("Syracuse, New York"), New York City / boroughs, anything with
 * County / Parish / Borough / City / ..., or a place the release headline names ("... in <Place>").
 */
export function isPlaceName(name, { title = "" } = {}) {
  const n = placeKey(name);
  if (!n) return false;
  if (STATE_NAMES.has(n) || CITY_NAMES.has(n) || NYC.test(n)) return true;
  if (PLACE_WORD.test(n)) return true;
  const cs = n.match(/^(.+?),\s*(.+)$/);
  if (cs && (STATE_NAMES.has(cs[2]) || STATE_OF(cs[2].toUpperCase()) || CITY_NAMES.has(cs[1]))) return true;
  if (title && titlePlaces(title).includes(n)) return true;
  return false;
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
  // "a United States citizen" / "a U.S. citizen" is never a foreign origin (was read as "States").
  if (/\b(?:United\s+States|U\.\s?S\.?|USA|American)\b/.test(String(desc || ""))) return "";
  const c = cleanCountry(country);
  if (c && /^[A-Z]/.test(c) && !NOT_NAME.test(c)) return cleanOrigin(c);
  // "a United Kingdom national" / "a Dominican Republic national": the country name itself, written out.
  const named = String(desc || "").trim().match(/^(?:an?\s+)?((?:[A-Z][a-z]+\s+){1,3}?[A-Z][a-z]+)$/);
  if (named && /national|citizen/.test(type) && COUNTRIES.has(named[1])) return cleanOrigin(named[1]);
  const words = String(desc || "").trim().split(/\s+/).filter((w) => /^[A-Z]/.test(w));
  for (const w of words) if (DEMONYM[w]) return DEMONYM[w];
  for (const w of words) if (DEMONYMS[w]) return DEMONYMS[w];
  if (/national|citizen/.test(type) && words.length) return cleanOrigin(words[words.length - 1]);
  return "";
}

const VERB = /\b(charged|indicted|convicted|sentenced|pleaded|pled|found guilty|arrested|removed|deported|accused|alleged|wanted|detained|apprehended)\b/i;

/**
 * Find named non-citizens in a release.
 * Returns [{ name, origin, sentence, city }]; sentence is verbatim from the page.
 * A name must have 2+ words and must not be a place (isPlaceName: state, city-geo city,
 * "City, State", County / City / ..., or a place from the release title's "in <Place>").
 */
export function extractPeople(blocks, { title = "" } = {}) {
  const found = [];
  const seen = new Set();
  for (const block of blocks) {
    if (block.length < 25) continue;
    const sents = sentences(block);
    for (let i = 0; i < sents.length; i++) {
      // Non-breaking / figure hyphens inside names ("Arellano‑Alba", U+2011, OPA Sept 18, 2026) read as "-".
      const s = sents[i].replace(/[\u2010\u2011]/g, "-");
      for (const re of PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(s))) {
          const pair = re === PATTERNS[1];
          const people = pair
            ? [m[1], m[2]].map((n) => ({ n, origin: originFrom(m[3] ?? m[5], m[4] ?? m[6], m[7]) }))
            : re === PATTERNS[4]
              ? [{ n: m[2], origin: DEMONYM[m[1]] || "" }]
              : [{ n: re === PATTERNS[3] && m[2] ? `${m[1]} ${m[2]}` : m[1], origin: re === PATTERNS[0] ? originFrom(m[2], m[3] || "", m[4]) : "" }];
          for (const { n, origin } of people) {
          // "... alien Zinzun Bautista." -> no sentence period in the name (Jr. / Sr. keep theirs).
          // Date words stuck on ("... Madrid Oct. 21") and place text joined by a period ("Nevada.Mario Garcia") are cut.
          const name = cleanPersonName(n).replace(/(?<!\b(?:Jr|Sr|[A-Z]))\.$/, "");
          const toks = name.split(" ");
          if (toks.length < 2 || toks.length > 6 || name.length > 60) continue;
          if (NOT_NAME.test(name)) continue;
          // Never a place: "In Syracuse, New York, ICE has arrested illegal aliens ..." is not a person named "New York".
          if (isPlaceName(name, { title })) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          // Verbatim label: the naming sentence, plus the next sentence in the same
          // paragraph when the first has no charge / conviction / removal verb.
          let sentence = s;
          const next = sents[i + 1] || "";
          const saysStatus = /\b(?:alien|non-?citizen|citizen of|national of|national\b)/i;
          if (next && ((!VERB.test(s) && VERB.test(next)) || (VERB.test(s) && !saysStatus.test(s) && saysStatus.test(next)))) {
            sentence = `${s} ${next}`;
          }
          // Country only from wording tied to this person ("<Name>, 36, of Guatemala", "Honduran national <Name>").
          found.push({ name, origin: cleanOrigin(origin) || countryFor(name, s), sentence, city: cityFrom(s) || cityFrom(sentence) });
          }
        }
      }
    }
  }
  for (const h of linkedPeople(blocks, { title, seen: found })) {
    const key = h.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(h);
  }
  // A linked hit never borrows the headline's stage: the headline may be about someone else ("Restaurant Owner
  // Pleads Guilty" is not the co-conspirator's plea). Its label comes from its own verbatim sentences only.
  for (const h of found) if (h.linked) h.noTitleStage = true;
  return found;
}

/* ------------------------------------------------------------------------------------------------
 * Linked wording (2026-10-20 audit). USAO releases often put the name and the non-citizen wording in
 * neighbouring sentences, or lead with the status. Each rule below still needs the release's OWN
 * non-citizen words for THIS person; the label is the verbatim naming sentence + the verbatim status
 * sentence (joined with one space). Nothing is inferred and the guards in guards.mjs still run.
 *  B lead:     "Illegal alien from Mexico Julian Garcia-Soto was arrested ..." (+ "aka <Name>")
 *  D ident:    "Gerardo Torres-Sanchez was found in ... and identified as an illegal alien from Mexico."
 *  C surname:  "Toribio Canales is a citizen of El Salvador." / "Investigators saw Arce Cruz, an illegal
 *              alien, ..." -> the full name the same release gives ("Jose Toribio Canales (44, ...)").
 *  E anon:     "A Brazilian national was sentenced today ..." / "A Lebanese man with a Legal Permanent
 *              Resident Card was arrested ..." followed by the sentence that names the one defendant.
 *  F list:     "Among the illegal aliens who were deported are:" then "<Name>, whose criminal history ..."
 *              items (DHS deportation-flight releases).
 *  G roundup:  case paragraph naming "<Full Name> and <Full Name> were charged ...", then "... apprehend
 *              <Surname> and ..., including <Surname>, who were determined to be citizens of Mexico" or
 *              "... all were unlawfully present ... one of them, <Surname>, was ..." (USAO Arizona).
 * ---------------------------------------------------------------------------------------------- */
const escRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COUNTRY_ALT = [...COUNTRIES].sort((a, b) => b.length - a.length).map(escRe).join("|");
const AKA = `(?:,?\\s+(?:aka|a/k/a|a\\.k\\.a\\.)\\s+${NAME})?`;
const LEAD = new RegExp(`(?:^|[.;:]\\s+|\\b(?:and|while)\\s+)(?:[Cc]riminal\\s+)?[Ii]llegal\\s+alien\\s+from\\s+(?:the\\s+)?(${COUNTRY_ALT})\\s+${NAME}${AKA}(?=\\s+(?:was|is|has|had|pleaded|faces|remains|allegedly)\\b)`, "g");
const IDENT = new RegExp(`^(?:[A-Z][^,]{0,40},\\s+)?${NAME}\\s+(?:was|is)\\s+[^.;]{0,120}?\\b(?:identified|determined|confirmed|found)\\s+(?:to\\s+be\\s+|as\\s+)an?\\s+(?:criminal\\s+)?(?:illegal\\s+alien|citizen\\s+of|national\\s+of)(?:\\s+(?:from|of)\\s+)?(?:the\\s+)?(${COUNTRY_ALT})?`);
const SUR = "([A-Z][A-Za-z'’-]+(?:\\s+[A-Z][A-Za-z'’-]+)?)";
const SURNAME_STATUS = new RegExp(`(?:^|,\\s+|\\b(?:saw|that|and|when)\\s+)${SUR}(?:,\\s+an?\\s+(?:criminal\\s+)?illegal\\s+alien\\b|\\s+(?:is|was)\\s+(?:an?\\s+)?(?:criminal\\s+)?(?:illegal\\s+alien|citizen\\s+of|native\\s+and\\s+citizen\\s+of|national\\s+of)\\b|\\s+(?:is|was)\\s+an?\\s+[A-Z][a-z]+\\s+national\\b)`, "g");
const ANON = /^(?:[A-Z][A-Za-z .,'’-]{0,40}[:–—]\s+|[A-Z][A-Za-z .,'’-]{0,40}\s+[–—-]\s+)?An?\s+(?:[A-Za-z-]+\s+){0,3}?(?:illegal\s+alien|alien|national|citizen\s+of\s+[A-Z]\w+|(?:man|woman)\s+with\s+an?\s+(?:Legal|Lawful)\s+Permanent\s+Resident(?:\s+Card)?|lawful\s+permanent\s+resident)\b/;
const NEXT_NAME = new RegExp(`^(?:[A-Z][^,]{0,60}?\\b(?:alleges|alleged|says|states|shows)\\s+that\\s+|According\\s+to\\s+[^,]+,\\s+)?${NAME}\\s+(?:was|is|has|had|allegedly|pleaded|pled)\\b|\\b(?:sentenced|charged|indicted)\\s+${NAME},\\s+\\d{1,3}\\b`);
const LIST_INTRO = /\b(?:illegal\s+aliens?|aliens?|non-?citizens?)\b[^:]*\b(?:deported|removed|arrested|convicted|charged|sentenced)\b[^:]*:\s*$|\b(?:deported|removed|arrested)\b[^:]*\b(?:illegal\s+aliens?|aliens?)\b[^:]*:\s*$/i;
const LIST_ITEM = new RegExp(`^${NAME},\\s+(?:whose|who|an?)\\s`);
const ALL_FROM = new RegExp(`\\bAll\\s+of\\s+the\\s+(?:illegal\\s+)?aliens\\b[^.]*?\\bwere\\s+from\\s+(?:the\\s+)?(${COUNTRY_ALT})\\b`);
// H (USAO-NV Oct 28, 2026): "According to the criminal information, on or about October 29, 2024, <Name>, from Sudan and a
// lawful permanent resident, voted in an election ..." The status is in the naming sentence; the charge is in a later
// sentence that names the surname ("Yousif and Safi are each charged with one count of voting by an alien.").
const FROM_STATUS = new RegExp(`(?:^|,\\s+)${NAME},\\s+(?:\\d{1,3},\\s+)?(?:from|of)\\s+(?:the\\s+)?(${COUNTRY_ALT})\\s+and\\s+(?:an?\\s+)?(?:(?:lawful|legal)\\s+permanent\\s+resident|(?:illegal\\s+)?alien|non-?citizen)\\b`, "g");
const STATUS_COUNTRY = new RegExp(`\\b(?:from|of)\\s+(?:the\\s+)?(${COUNTRY_ALT})(?![A-Za-z])`);

function cleanName(n) {
  return cleanPersonName(String(n || "").replace(/\s+/g, " ").trim()).replace(/^(?:Co-?conspirator|Co-?defendant|Defendant|Suspect)\s+/i, "").replace(/(?<!\b(?:Jr|Sr|[A-Z]))\.$/, "").replace(/[’']s$/, "");
}
function okName(name, title) {
  const toks = name.split(" ");
  return toks.length >= 2 && toks.length <= 6 && name.length <= 60 && !NOT_NAME.test(name) && !isPlaceName(name, { title });
}
function countryIn(text) {
  const m = String(text || "").match(STATUS_COUNTRY);
  if (m) return m[1];
  const d = String(text || "").match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:national|citizen|man|woman)\b/);
  return d ? DEMONYMS[d[1]] || DEMONYM[d[1]] || "" : "";
}

/** Full name the release gives for a surname ("Toribio Canales" -> "Jose Toribio Canales"), with its sentence. */
function fullNameFor(sur, sentList) {
  const re = new RegExp(`(${PART}(?:\\s+(?:${PARTICLE}\\s+)?${PART}){0,4}?)\\s+${escRe(sur)}(?![A-Za-z'’-])(?=\\s*[,(]|\\s+(?:and|was|were|is|has|have|pleaded|pled|allegedly|aka)\\b)`);
  for (const s of sentList) {
    const m = s.match(re);
    if (!m) continue;
    const lead = m[1].split(/\s+/).filter((t) => !NOT_NAME.test(t) && /^[A-ZÁÉÍÓÚÑÜ]/.test(t));
    // Drop leading sentence words ("Investigators", "On") that are not part of the name.
    let name = `${m[1]} ${sur}`;
    const toks = m[1].split(/\s+/);
    while (toks.length && (NOT_NAME.test(toks[0]) || /^(?:In|On|At|By|As|If|When|While|After|Before|Investigators|Agents|Officers|Prosecutors|Police|Records|Court|Documents)$/.test(toks[0]))) toks.shift();
    if (!toks.length || !lead.length) continue;
    name = cleanName(`${toks.join(" ")} ${sur}`);
    if (name.split(" ").length <= sur.split(" ").length) continue;
    return { name, sentence: s };
  }
  return null;
}

export function linkedPeople(blocks, { title = "", seen = [] } = {}) {
  const out = [];
  const have = new Set(seen.map((h) => h.name.toLowerCase()));
  const covered = (n) => have.has(n.toLowerCase()) || [...have].some((h) => h.endsWith(` ${n.toLowerCase()}`));
  const push = (h) => {
    if (!okName(h.name, title) || covered(h.name)) return;
    have.add(h.name.toLowerCase());
    out.push({ city: cityFrom(h.sentence), ...h, origin: cleanOrigin(h.origin) || countryFor(h.name, h.sentence) || "", linked: true });
  };
  const all = blocks.filter((b) => b.length >= 25).map((b) => sentences(b));
  const flat = all.flat();
  const allFrom = blocks.join(" ").match(ALL_FROM)?.[1] || "";

  // F: list intro + "<Name>, whose ..." items.
  let intro = null;
  for (const b of blocks) {
    if (LIST_INTRO.test(b)) { intro = b; continue; }
    if (!intro) continue;
    if (b.length < 25) continue; // "Image" captions between list items
    const m = b.match(LIST_ITEM);
    if (!m) { intro = null; continue; }
    const name = cleanName(m[1]);
    const item = sentences(b)[0];
    push({ name, origin: allFrom || countryIn(intro), sentence: `${intro} ${item}` });
  }

  for (let bi = 0; bi < all.length; bi++) {
    const sents = all[bi];
    for (let i = 0; i < sents.length; i++) {
      const s = sents[i];
      // B: "Illegal alien from Mexico <Name> (aka <Name>) was ..."
      LEAD.lastIndex = 0;
      let m;
      while ((m = LEAD.exec(s))) {
        const name = cleanName(m[2]);
        push({ name, origin: m[1], sentence: withNowCharge(sents, i), ...(m[3] ? { aka: cleanName(m[3]) } : {}) });
      }
      // D: "<Name> was found ... and identified as an illegal alien from Mexico."
      const d = s.match(IDENT);
      if (d) push({ name: cleanName(d[1]), origin: d[2] || "", sentence: withNowCharge(sents, i) });
      // C: surname + status in this sentence, full name elsewhere in the release.
      SURNAME_STATUS.lastIndex = 0;
      while ((m = SURNAME_STATUS.exec(s))) {
        const sur = cleanName(m[1]);
        if (NOT_NAME.test(sur) || /^(?:He|She|They|It|The|A|An|This|That|Who|Each|Both)$/.test(sur)) continue;
        if (covered(sur)) continue;
        const full = fullNameFor(sur, flat);
        if (!full) continue;
        const own = withNowCharge(sents, i);
        const tail = own.startsWith(s) && NOW_CHARGE.test(own) ? own : s;
        const sentence = full.sentence === s ? tail : `${full.sentence} ${tail}`;
        push({ name: full.name, origin: countryIn(s.slice(m.index)), sentence });
      }
      // E: "A <...> national / illegal alien / man with a Legal Permanent Resident Card ..." + next sentence naming one person.
      if (ANON.test(s)) {
        const next = sents[i + 1] ?? (i === sents.length - 1 ? all[bi + 1]?.[0] : undefined);
        const n = next && next.match(NEXT_NAME);
        if (n) push({ name: cleanName(n[1] || n[2]), origin: countryIn(s), sentence: `${s} ${next}` });
      }
      // H: "<Name>, from <Country> and a lawful permanent resident, voted ..." + the later charge sentence for the surname.
      FROM_STATUS.lastIndex = 0;
      while ((m = FROM_STATUS.exec(s))) {
        const name = cleanName(m[1]);
        const sur = name.split(" ").slice(-1)[0];
        const surRe = new RegExp(`(?<![A-Za-z'’-])${escRe(sur)}(?![A-Za-z'’-])`);
        const charge = flat.slice(flat.indexOf(s) + 1).find((x) => surRe.test(x) && /\b(?:charged|indicted)\b/i.test(x));
        push({ name, origin: m[2], sentence: charge ? `${s} ${charge}` : withNowCharge(sents, i) });
      }
      // G: case paragraph (USAO Arizona weekly roundup).
      const det = s.match(/^(.*?)\b(?:who|which)\s+(?:were|was)\s+determined\s+to\s+be\s+(?:citizens?|nationals?)\s+of\b/);
      if (det) {
        for (const full of namesChargedIn(sents)) {
          const sur = full.name.split(" ").slice(-1)[0];
          if (new RegExp(`(?<![A-Za-z'’-])${escRe(sur)}(?![A-Za-z'’-])`).test(det[1])) push({ name: full.name, origin: countryIn(s), sentence: `${full.sentence} ${s}` });
        }
      }
      const one = s.match(/\bone\s+of\s+them,\s+([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)?),/);
      if (one && i > 0 && /\ball\s+were\s+(?:unlawfully|illegally)\s+present\b/i.test(sents[i - 1])) {
        const full = namesChargedIn(sents).find((f) => f.name.endsWith(` ${one[1]}`) || f.name === one[1]);
        if (full) push({ name: full.name, origin: "", sentence: `${full.sentence} ${sents[i - 1]} ${s}` });
      }
    }
  }
  return out;
}

/**
 * Naming sentence, extended (verbatim, contiguous) through a "He's now charged with ..." / "He now faces a charge
 * of ..." sentence up to 3 sentences later in the same paragraph, so the label is this case's stage, not a past
 * record. Otherwise the old rule: add the next sentence only when the naming sentence has no stage verb.
 */
const NOW_CHARGE = /\bnow\s+(?:charged|faces?\s+(?:(?:a|an|his|her|the)\s+)?(?:[\w-]+\s+){0,3}?(?:charges?|counts?))\b/i;
function withNowCharge(sents, i) {
  for (let k = i + 1; k <= i + 3 && k < sents.length; k++) if (NOW_CHARGE.test(sents[k])) return sents.slice(i, k + 1).join(" ");
  if (!VERB.test(sents[i]) && sents[i + 1] && VERB.test(sents[i + 1])) return `${sents[i]} ${sents[i + 1]}`;
  return sents[i];
}

/** People a case paragraph says were charged: "<Name> and <Name> were charged ..." / "<Name> was charged ...". */
function namesChargedIn(sents) {
  const out = [];
  const re = new RegExp(`(?:^|,\\s+)${NAME}(?:\\s+and\\s+${NAME})?\\s+(?:was|were)\\s+(?:charged|indicted|arrested|sentenced|convicted)\\b`);
  for (const s of sents) {
    const m = s.match(re);
    if (!m) continue;
    for (const n of [m[1], m[2]].filter(Boolean)) {
      const name = cleanName(n);
      if (name.split(" ").length >= 2 && !NOT_NAME.test(name)) out.push({ name, sentence: s });
    }
  }
  return out;
}

/** Prior-history phrases ("previously removed", "prior conviction", "criminal history includes")
 *  describe the past, not the stage of THIS case, so they never set the label. */
export function stripPriors(text) {
  return String(text || "")
    .replace(/\b(previously|prior|earlier|already|twice|thrice|once|formerly)[\s-]+(been\s+)?(removed|deported|convicted)\b/gi, "prior-history")
    .replace(/\b(\d+|two|three|four|five|six|multiple|several)[- ]times?[- ](previously[- ])?(removed|deported)\b/gi, "prior-history")
    .replace(/\b(removed|deported)\s+(from\s+the\s+(U\.S\.|United States)\s+)?(at least\s+)?(once|twice|thrice|\d+|two|three|four|five|six|multiple|several)(\s+times)?\b/gi, "prior-history")
    // "has been convicted 2x" / "convicted twice" / "convicted 3 times": a counted record is history.
    .replace(/\b((has|have|had)\s+been\s+)?convicted\s+(\d+x|\d+\s+times|twice|thrice|(two|three|four|five|multiple|several)\s+times)\b/gi, "prior-history")
    .replace(/\bprior\s+(\w+\s+){0,2}convictions?\b/gi, "prior-history")
    // "Reyes-Hernandez was convicted in 2023 for alien smuggling ... He's now charged with illegal re-entry":
    // a conviction dated to an earlier year is past history when the same text says "now charged / now faces".
    .replace(/\b(?:was|were|been)\s+convicted\s+in\s+(?:19|20)\d{2}\b(?=[\s\S]*\bnow\s+(?:charged|faces?)\b)/gi, "prior-history")
    .replace(/\b(?:has|have|had)\s+(?:also\s+)?(?:been\s+)?previously\s+convicted\b(?=[\s\S]*\bnow\s+(?:charged|faces?)\b)/gi, "prior-history")
    // "illegally reentering the U.S. as a removed alien" / "Reentry of Removed Alien": a past removal, not this case.
    .replace(/\b(?:a\s+)?(?:previously\s+)?(?:removed|deported)\s+aliens?\b/gi, "prior-history")
    // "arrested near Comstock after just being removed from the U.S. on Sept. 11": the removal is past, not this case.
    .replace(/\b(?:after|since)\s+(?:just\s+|recently\s+|being\s+)*(?:being|having\s+been)\s+(removed|deported)\b/gi, "prior-history")
    .replace(/\bcriminal (history|record)\b/gi, "prior-history");
}

/**
 * The release describes the person's PAST record ("whose criminal history includes burglary",
 * "a criminal history that includes arrests for ...", "prior convictions for", "prior arrest for",
 * "previously convicted of", "history of ..."). Those crimes are not a charge in this case.
 */
export const HISTORY = /\b(?:criminal|arrest|conviction|police|immigration)\s+(?:histor(?:y|ies)|records?)\b|\b(?:histor(?:y|ies)|records?)\s+(?:that\s+)?(?:includes?|including|include)\b|\bhistory\s+of\b|\bprior\s+(?:\w+\s+){0,2}(?:convictions?|arrests?|charges?)\b|\bpreviously\s+(?:been\s+)?(?:convicted|arrested|charged)\s+(?:of|for|with)\b/i;

/** Sentence with every history clause cut out (from the history phrase to the next ";" or sentence end). */
export function withoutHistory(sentence) {
  const re = new RegExp(`(?:${HISTORY.source})[^;]*?(?=;|[.!?](?:\\s|$)|$)`, "gi");
  return String(sentence || "").replace(re, " prior-history ");
}

/**
 * Stage for a sentence that lists a past record. Never "Charged" and never taken from the title
 * (the headline's "Arrested" is the immigration arrest, not a charge for the listed crimes).
 * Removed / Convicted only when the text OUTSIDE the history clause says so; otherwise "As posted".
 */
function historyStatus(sentence) {
  const s = stripPriors(withoutHistory(sentence));
  if (!NOT_YET_REMOVED.test(s) && REMOVE_WORDS.test(s)) return "Removed";
  if (CONVICT_WORDS.test(s) || PLEA_WORDS.test(s)) return convictLabel(s);
  return "As posted";
}

/** Conviction wording other than a guilty plea (convicted / sentenced / found guilty). */
export const FINAL_CONVICT_WORDS = /\b(convicted|convictions?|sentenced|found guilty)\b/i;
/** Guilty-plea wording. A plea with no conviction / sentence wording is "Pleaded guilty", not "Convicted" (Krennic 2026-10-20). */
// Past / present tense only: "expected to plead guilty" / "will enter a guilty plea" is not a stage.
export const PLEA_WORDS = /\b(pleaded guilty|pled guilty|pleads guilty|entered (?:a|his|her) (?:plea of guilty|guilty plea))\b/i;
/** "Convicted", "Pleaded guilty" or "" for text that has conviction-stage wording. */
export function convictLabel(text) {
  const t = String(text || "");
  if (FINAL_CONVICT_WORDS.test(t)) return "Convicted";
  if (PLEA_WORDS.test(t)) return "Pleaded guilty";
  return "";
}
export const CONVICT_WORDS = /\b(convicted|convictions?|sentenced|pleaded guilty|pled guilty|pleads guilty|found guilty|entered (?:a|his|her) (?:plea of guilty|guilty plea))\b/i;
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
 *  - A sentence that lists a past record ("criminal history includes", "prior convictions / arrests for")
 *    is never Charged: Removed / Convicted only from wording outside that clause, else "As posted".
 */
export function statusFrom(sentence, title = "") {
  // "He's now charged with illegal re-entry" / "He now faces a charge of ...": this case's stage is Charged,
  // whatever past record the same text lists. (Charged is never an upgrade.)
  if (NOW_CHARGE.test(String(sentence || ""))) return "Charged";
  if (HISTORY.test(String(sentence || ""))) return historyStatus(sentence);
  const s = stripPriors(sentence);
  const t = stripPriors(title);
  const notYet = NOT_YET_REMOVED.test(s);
  if (!notYet && REMOVE_WORDS.test(s)) return "Removed";
  if (CONVICT_WORDS.test(s) || PLEA_WORDS.test(s)) return convictLabel(s);
  if (CHARGE_WORDS.test(s)) return "Charged";
  if (!notYet && /\b(deports|removes|deported|removed)\b/i.test(t) && !CHARGE_WORDS.test(t)) return "Removed";
  if ((CONVICT_WORDS.test(t) || PLEA_WORDS.test(t)) && !CHARGE_WORDS.test(t)) return convictLabel(t);
  if (CHARGE_WORDS.test(t) || /\b(apprehend\w*|nabs|detainer)\b/i.test(t)) return "Charged";
  return "As posted";
}

export const FORMAL_CHARGE = /\b(charged|charges|charging|indicted|indictment|complaint|accused)\b/i;

/**
 * Stage for a press-release row. The stage comes from the sentence naming the person; the release
 * headline is used only when that sentence has no stage word at all. An arrest / detention with no
 * formal-charge wording in the person's own sentence is "Arrested", never "Charged" (same rule as xLabel).
 */
export function releaseLabel(sentence, title = "") {
  const own = statusFrom(sentence, "");
  if (own === "Charged") return FORMAL_CHARGE.test(stripPriors(sentence)) || NOW_CHARGE.test(String(sentence || "")) ? "Charged" : "Arrested";
  if (own !== "As posted") return own;
  if (HISTORY.test(String(sentence || ""))) return own;
  const t = statusFrom(sentence, title);
  return t === "Charged" && !FORMAL_CHARGE.test(stripPriors(title)) ? "Arrested" : t;
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
  DailySignal: { label: "Daily Signal", tag: "ds", confirmedBy: "White House via Daily Signal" },
  // State election-crime newsrooms (state cases; scripts/state-sources.mjs). label = the agency, tag = id prefix.
  FloridaAG: { label: "Florida Attorney General", tag: "fl-ag", confirmedBy: "Florida Attorney General" },
  FDLE: { label: "Florida Department of Law Enforcement", tag: "fdle", confirmedBy: "Florida Department of Law Enforcement" },
  TexasAG: { label: "Texas Attorney General", tag: "tx-ag", confirmedBy: "Texas Attorney General" },
  MichiganAG: { label: "Michigan Attorney General", tag: "mi-ag", confirmedBy: "Michigan Attorney General" },
  NewHampshireDOJ: { label: "New Hampshire Department of Justice", tag: "nh-doj", confirmedBy: "New Hampshire Department of Justice" },
  NevadaAG: { label: "Nevada Attorney General", tag: "nv-ag", confirmedBy: "Nevada Attorney General" },
  PennsylvaniaAG: { label: "Pennsylvania Attorney General", tag: "pa-ag", confirmedBy: "Pennsylvania Attorney General" },
  KansasAG: { label: "Kansas Attorney General", tag: "ks-ag", confirmedBy: "Kansas Attorney General" },
  GeorgiaAG: { label: "Georgia Attorney General", tag: "ga-ag", confirmedBy: "Georgia Attorney General" },
  GeorgiaSOS: { label: "Georgia Secretary of State", tag: "ga-sos", confirmedBy: "Georgia Secretary of State" },
  NorthCarolinaAG: { label: "North Carolina Attorney General", tag: "nc-ag", confirmedBy: "North Carolina Attorney General" },
  OhioAG: { label: "Ohio Attorney General", tag: "oh-ag", confirmedBy: "Ohio Attorney General" },
  OhioSOS: { label: "Ohio Secretary of State", tag: "oh-sos", confirmedBy: "Ohio Secretary of State" },
  ArizonaAG: { label: "Arizona Attorney General", tag: "az-ag", confirmedBy: "Arizona Attorney General" },
  WisconsinDOJ: { label: "Wisconsin Department of Justice", tag: "wi-doj", confirmedBy: "Wisconsin Department of Justice" },
  AlabamaAG: { label: "Alabama Attorney General", tag: "al-ag", confirmedBy: "Alabama Attorney General" },
  VirginiaAG: { label: "Virginia Attorney General", tag: "va-ag", confirmedBy: "Virginia Attorney General" },
  LouisianaAG: { label: "Louisiana Attorney General", tag: "la-ag", confirmedBy: "Louisiana Attorney General" },
  IndianaAG: { label: "Indiana Attorney General", tag: "in-ag", confirmedBy: "Indiana Attorney General" },
  MissouriAG: { label: "Missouri Attorney General", tag: "mo-ag", confirmedBy: "Missouri Attorney General" },
  TennesseeAG: { label: "Tennessee Attorney General", tag: "tn-ag", confirmedBy: "Tennessee Attorney General" },
  IowaAG: { label: "Iowa Attorney General", tag: "ia-ag", confirmedBy: "Iowa Attorney General" },
  USCIS: { label: "USCIS", confirmedBy: "DHS" },
};

export function slug(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** One feed row in the app's existing CaseRecord shape. photo is always "". */
export function toRow(hit, rel) {
  const a = AGENCY[rel.office] || { label: rel.office, confirmedBy: "DHS" };
  const d = dateParts(rel.date);
  const status = releaseLabel(hit.sentence, hit.noTitleStage ? "" : rel.title);
  const city = hit.city || placeFromDistrict(hit.sentence, rel.url) || "Not stated";
  return {
    name: hit.name,
    ...(hit.aka ? { aka: hit.aka } : {}),
    city,
    crime: `${status}: ${hit.sentence}`,
    usa: `${a.label} release ${d.long}: ${rel.title}`,
    foreign: "Not stated in post",
    picked: `${d.picked} (${a.label} release)`,
    entered: enteredFromText(hit.sentence),
    office: rel.office,
    id: `${a.tag || a.label.toLowerCase()}-${d.compact}-${slug(hit.name)}`,
    when: d.when,
    text: `${a.label} ${d.long}, as posted: ${hit.sentence}`,
    photo: "",
    via: rel.url.replace(/^https:\/\/(www\.)?/, ""),
    sourceUrl: rel.url,
    voting: VOTING.test(hit.sentence),
    origin: cleanOrigin(hit.origin) || countryFor(hit.name, hit.sentence) || "Not stated", // only wording tied to this person
    confirmedBy: a.confirmedBy,
    ...(city === "Not stated" ? latLonFor("") : geoForPlace(city)),
  };
}

/** Voting / registration fraud wording in the person's own sentence. */
export const VOTING =
  /\b(illegal(ly)? vot|unlawful(ly)? vot|voting (as|by)|voted in|vote in|registered to vote|in order to vote|when (?:he|she) voted|provisional ballot|cast (?:a |her |his )?ballots?)/i;
